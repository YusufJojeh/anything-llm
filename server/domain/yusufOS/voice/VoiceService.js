const { randomUUID } = require("crypto");
const prisma = require("../../../utils/prisma");
const { YusufTask } = require("../../../models/yusufOS/task");
const { getSTTProvider } = require("../../../utils/SpeechToText");
const { getTTSProvider } = require("../../../utils/TextToSpeech");
const { ensureCoreStaff } = require("../agents/AgentRegistry");
const { AgentRunCoordinator } = require("../agents/AgentRunCoordinator");
const { AgentReasoningLoop } = require("../agents/AgentReasoningLoop");
const { PRINCIPAL_TYPES, RUN_KINDS } = require("../constants");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_UTTERANCE_CHARS = 10000;
const MAX_SPEECH_CHARS = 4096;
const MAX_AGENT_TURNS = 6;
const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;

const PROVIDER_SCOPE = Object.freeze({
  LOCAL: "LOCAL",
  CLOUD: "CLOUD",
  BROWSER: "BROWSER",
  UNKNOWN: "UNKNOWN",
});

function enabled(value) {
  return String(value || "").toLowerCase() === "true";
}

function providerTimeoutMs(env) {
  const configured = Number(env.YUSUF_OS_VOICE_PROVIDER_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_PROVIDER_TIMEOUT_MS;
  return Math.min(120_000, Math.max(1_000, Math.floor(configured)));
}

async function withTimeout(operation, timeoutMs, externalSignal) {
  let timeout;
  let rejectExternal;
  const controller = new AbortController();
  if (externalSignal?.aborted) throw new Error("VOICE_REQUEST_ABORTED");
  const abortFromExternal = () => {
    controller.abort();
    rejectExternal?.(new Error("VOICE_REQUEST_ABORTED"));
  };
  externalSignal?.addEventListener("abort", abortFromExternal, {
    once: true,
  });
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise((_, reject) => {
        rejectExternal = reject;
      }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("VOICE_PROVIDER_TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

function providerScope(kind, provider, env = process.env) {
  if (kind === "stt") {
    if (provider === "native") return PROVIDER_SCOPE.BROWSER;
    if (provider === "lemonade") return PROVIDER_SCOPE.LOCAL;
    if (["openai", "groq", "deepgram"].includes(provider))
      return PROVIDER_SCOPE.CLOUD;
    if (provider === "generic-openai") {
      const scope = String(env.YUSUF_OS_STT_PROVIDER_SCOPE || "").toUpperCase();
      return [PROVIDER_SCOPE.LOCAL, PROVIDER_SCOPE.CLOUD].includes(scope)
        ? scope
        : PROVIDER_SCOPE.UNKNOWN;
    }
  }
  if (kind === "tts") {
    if (provider === "kokoro") return PROVIDER_SCOPE.LOCAL;
    if (["openai", "elevenlabs"].includes(provider))
      return PROVIDER_SCOPE.CLOUD;
    if (provider === "generic-openai") {
      const scope = String(env.YUSUF_OS_TTS_PROVIDER_SCOPE || "").toUpperCase();
      return [PROVIDER_SCOPE.LOCAL, PROVIDER_SCOPE.CLOUD].includes(scope)
        ? scope
        : PROVIDER_SCOPE.UNKNOWN;
    }
  }
  return PROVIDER_SCOPE.UNKNOWN;
}

function providerConfigured(kind, provider, env = process.env) {
  if (kind === "stt") {
    if (provider === "native") return true;
    if (provider === "lemonade") return Boolean(env.STT_LEMONADE_BASE_PATH);
    if (provider === "openai") return Boolean(env.OPEN_AI_KEY);
    if (provider === "deepgram") return Boolean(env.STT_DEEPGRAM_API_KEY);
    if (provider === "groq") return Boolean(env.STT_GROQ_API_KEY);
    if (provider === "generic-openai")
      return Boolean(env.STT_OPEN_AI_COMPATIBLE_ENDPOINT);
  }
  if (kind === "tts") {
    if (provider === "kokoro") return Boolean(env.TTS_KOKORO_ENDPOINT);
    if (provider === "openai") return Boolean(env.TTS_OPEN_AI_KEY);
    if (provider === "elevenlabs") return Boolean(env.TTS_ELEVEN_LABS_KEY);
    if (provider === "generic-openai")
      return Boolean(env.TTS_OPEN_AI_COMPATIBLE_ENDPOINT);
  }
  return false;
}

function safeAudioFilename(filename) {
  const match = String(filename || "")
    .toLowerCase()
    .match(/\.(webm|ogg|oga|wav|mp3|m4a|mp4|flac)$/);
  return `audio${match?.[0] || ".webm"}`;
}

function providerPolicy(env = process.env) {
  const allowCloud = enabled(env.YUSUF_OS_VOICE_ALLOW_CLOUD);
  const allowBrowserSpeech = enabled(env.YUSUF_OS_VOICE_ALLOW_BROWSER_SPEECH);
  const describe = (kind, provider) => {
    if (!provider)
      return {
        provider: null,
        scope: null,
        configured: false,
        eligible: false,
        available: false,
        health: "NOT_CONFIGURED",
        reason: "NOT_CONFIGURED",
      };
    const scope = providerScope(kind, provider, env);
    const configured = providerConfigured(kind, provider, env);
    const eligible =
      configured &&
      (scope === PROVIDER_SCOPE.LOCAL ||
        (scope === PROVIDER_SCOPE.BROWSER && allowBrowserSpeech) ||
        (scope === PROVIDER_SCOPE.CLOUD && allowCloud));
    return {
      provider,
      scope,
      configured,
      eligible,
      available: eligible ? null : false,
      health:
        scope === PROVIDER_SCOPE.BROWSER ? "CLIENT_DETECTED" : "UNCHECKED",
      reason: eligible
        ? null
        : !configured
          ? "CONFIG_MISSING"
          : scope === PROVIDER_SCOPE.BROWSER
            ? "BROWSER_SPEECH_DISABLED"
            : scope === PROVIDER_SCOPE.CLOUD
              ? "CLOUD_DISABLED"
              : "SCOPE_UNCONFIRMED",
    };
  };
  const candidates = (kind, primary, fallback) => {
    const rank = {
      [PROVIDER_SCOPE.LOCAL]: 0,
      [PROVIDER_SCOPE.BROWSER]: 1,
      [PROVIDER_SCOPE.CLOUD]: 2,
      [PROVIDER_SCOPE.UNKNOWN]: 3,
    };
    return [...new Set([primary, fallback].filter(Boolean))]
      .map((provider, index) => ({ ...describe(kind, provider), index }))
      .sort(
        (left, right) =>
          rank[left.scope] - rank[right.scope] || left.index - right.index
      )
      .map(({ index: _index, ...candidate }) => candidate);
  };
  const sttCandidates = candidates(
    "stt",
    env.STT_PROVIDER || "native",
    env.YUSUF_OS_STT_FALLBACK_PROVIDER
  );
  const ttsCandidates = candidates(
    "tts",
    env.TTS_PROVIDER || null,
    env.YUSUF_OS_TTS_FALLBACK_PROVIDER
  );
  return {
    allowCloud,
    allowBrowserSpeech,
    stt:
      sttCandidates.find((candidate) => candidate.eligible) || sttCandidates[0],
    tts:
      ttsCandidates.find((candidate) => candidate.eligible) ||
      ttsCandidates[0] ||
      describe("tts", null),
    sttCandidates,
    ttsCandidates,
  };
}

function serverCandidates(channel, policy) {
  const candidates = policy[`${channel}Candidates`].filter(
    (candidate) =>
      candidate.eligible && candidate.scope !== PROVIDER_SCOPE.BROWSER
  );
  if (!candidates.length)
    throw new YusufOSError(
      ErrorCodes.MODEL_UNAVAILABLE,
      `${channel.toUpperCase()} is not available under the current voice privacy policy.`,
      {
        status: 503,
        details: {
          channel,
          reason: policy[channel]?.reason || "BROWSER_ONLY",
        },
      }
    );
  return candidates;
}

class VoiceService {
  constructor({
    db = prisma,
    env = process.env,
    sttFactory = getSTTProvider,
    ttsFactory = getTTSProvider,
    runCoordinator,
    reasoningLoop,
  } = {}) {
    this.db = db;
    this.env = env;
    this.sttFactory = sttFactory;
    this.ttsFactory = ttsFactory;
    this.runs = runCoordinator || new AgentRunCoordinator(db);
    this.reasoning = reasoningLoop || new AgentReasoningLoop({ db });
  }

  status() {
    return {
      ...providerPolicy(this.env),
      browser: {
        speechRecognition: "CLIENT_DETECTED",
        speechSynthesis: "CLIENT_DETECTED",
        recording: "CLIENT_DETECTED",
        allowSpeechServices: enabled(
          this.env.YUSUF_OS_VOICE_ALLOW_BROWSER_SPEECH
        ),
      },
      languages: ["en", "ar"],
      wakeWord: "DEFERRED",
    };
  }

  async transcribe(buffer, filename = "audio.webm", { signal } = {}) {
    if (
      !Buffer.isBuffer(buffer) ||
      buffer.length === 0 ||
      buffer.length > MAX_AUDIO_BYTES
    )
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "Voice audio must be a non-empty bounded buffer.",
        { status: 422 }
      );
    const policy = providerPolicy(this.env);
    const attempts = [];
    for (const candidate of serverCandidates("stt", policy)) {
      try {
        const text = String(
          (await withTimeout(
            (signal) =>
              this.sttFactory(candidate.provider).transcribe(
                buffer,
                safeAudioFilename(filename),
                { signal }
              ),
            providerTimeoutMs(this.env),
            signal
          )) || ""
        )
          .trim()
          .slice(0, MAX_UTTERANCE_CHARS);
        if (!text) throw new Error("EMPTY_TRANSCRIPT");
        return text;
      } catch {
        if (signal?.aborted)
          throw new YusufOSError(
            ErrorCodes.CONFLICT,
            "Voice transcription was cancelled.",
            { status: 409 }
          );
        attempts.push(candidate.provider);
      }
    }
    throw new YusufOSError(
      ErrorCodes.MODEL_UNAVAILABLE,
      "No permitted speech recognition provider returned a transcript.",
      { status: 502, details: { channel: "stt", attempts } }
    );
  }

  async speak(text, { signal } = {}) {
    const value = String(text || "").trim();
    if (!value || value.length > MAX_SPEECH_CHARS)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Speech text must contain 1-${MAX_SPEECH_CHARS} characters.`,
        { status: 422 }
      );
    const policy = providerPolicy(this.env);
    const attempts = [];
    for (const candidate of serverCandidates("tts", policy)) {
      try {
        const buffer = await withTimeout(
          (signal) =>
            this.ttsFactory(candidate.provider).ttsBuffer(value, {
              signal,
              timeoutMs: providerTimeoutMs(this.env),
            }),
          providerTimeoutMs(this.env),
          signal
        );
        if (!Buffer.isBuffer(buffer) || buffer.length === 0)
          throw new Error("EMPTY_AUDIO");
        return buffer;
      } catch {
        if (signal?.aborted)
          throw new YusufOSError(
            ErrorCodes.CONFLICT,
            "Voice playback generation was cancelled.",
            { status: 409 }
          );
        attempts.push(candidate.provider);
      }
    }
    throw new YusufOSError(
      ErrorCodes.MODEL_UNAVAILABLE,
      "No permitted speech provider returned audio.",
      { status: 502, details: { channel: "tts", attempts } }
    );
  }

  async command({ utterance, principal, requestId = randomUUID(), signal }) {
    const objective = String(utterance || "").trim();
    if (!objective || objective.length > MAX_UTTERANCE_CHARS)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Voice utterance must contain 1-${MAX_UTTERANCE_CHARS} characters.`,
        { status: 422 }
      );
    const staff = await ensureCoreStaff(this.db);
    const chief = staff.chief_of_staff;
    const task = await YusufTask.create(
      {
        assignedAgentId: chief.id,
        title: objective.slice(0, 500),
        objective,
        status: "RUNNING",
        principal,
        requestId,
      },
      this.db
    );
    let run = await this.runs.createRun({
      taskId: task.id,
      agentId: chief.id,
      runKind: RUN_KINDS.ORCHESTRATION,
      principal: {
        type: PRINCIPAL_TYPES.USER,
        id: String(principal?.id || "yusuf"),
      },
      requestId,
    });
    for (let turn = 1; turn <= MAX_AGENT_TURNS; turn += 1) {
      const result = await this.reasoning.execute({
        runId: run.id,
        requestId,
        signal,
      });
      if (result.outcome === "WAITING_HANDOFF" && result.nextRunId) {
        run = await this.db.yusuf_agent_runs.findUnique({
          where: { uuid: result.nextRunId },
        });
        if (!run) break;
        continue;
      }
      const approval =
        result.outcome === "WAITING_APPROVAL"
          ? await this.db.yusuf_approval_requests.findFirst({
              where: { intent: { taskId: task.id }, status: "PENDING" },
              orderBy: { requestedAt: "desc" },
            })
          : null;
      if (result.outcome === "WAITING_APPROVAL" && !approval)
        throw new YusufOSError(
          ErrorCodes.INVALID_STATE_TRANSITION,
          "Agent reported an approval wait without a durable pending approval.",
          { status: 409, details: { taskId: task.uuid, runId: result.runId } }
        );
      return {
        taskId: task.uuid,
        runId: result.runId,
        state: approval ? "APPROVAL_REQUIRED" : result.outcome,
        response:
          result.summary ||
          result.reason ||
          (approval
            ? "This request needs Yusuf's approval before it can continue."
            : "The request was recorded and the Agent turn finished."),
        approvalId: approval?.uuid || null,
      };
    }
    return {
      taskId: task.uuid,
      runId: run?.uuid || null,
      state: "QUEUED",
      response: "The request is queued for the next Agent turn.",
      approvalId: null,
    };
  }
}

module.exports = {
  VoiceService,
  PROVIDER_SCOPE,
  providerPolicy,
  MAX_AUDIO_BYTES,
  MAX_UTTERANCE_CHARS,
  MAX_SPEECH_CHARS,
};
