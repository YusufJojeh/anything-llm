const {
  VoiceService,
  PROVIDER_SCOPE,
  providerPolicy,
  MAX_AUDIO_BYTES,
  MAX_SPEECH_CHARS,
} = require("../../../domain/yusufOS/voice/VoiceService");

describe("Phase U — voice provider privacy policy", () => {
  test("browser speech is opt-in and no paid provider is forced by default", () => {
    expect(providerPolicy({})).toMatchObject({
      allowCloud: false,
      allowBrowserSpeech: false,
      stt: {
        provider: "native",
        scope: PROVIDER_SCOPE.BROWSER,
        eligible: false,
        reason: "BROWSER_SPEECH_DISABLED",
      },
      tts: { provider: null, eligible: false },
    });
  });

  test("cloud providers require configuration and explicit privacy permission", () => {
    expect(
      providerPolicy({ STT_PROVIDER: "openai", OPEN_AI_KEY: "configured" }).stt
    ).toMatchObject({
      scope: PROVIDER_SCOPE.CLOUD,
      eligible: false,
      reason: "CLOUD_DISABLED",
    });
    expect(
      providerPolicy({
        STT_PROVIDER: "openai",
        OPEN_AI_KEY: "configured",
        YUSUF_OS_VOICE_ALLOW_CLOUD: "true",
      }).stt.eligible
    ).toBe(true);
    expect(
      providerPolicy({
        STT_PROVIDER: "openai",
        YUSUF_OS_VOICE_ALLOW_CLOUD: "true",
      }).stt.reason
    ).toBe("CONFIG_MISSING");
  });

  test("generic providers require an endpoint and confirmed locality", () => {
    expect(
      providerPolicy({
        STT_PROVIDER: "generic-openai",
        STT_OPEN_AI_COMPATIBLE_ENDPOINT: "http://localhost:8080",
      }).stt
    ).toMatchObject({
      scope: PROVIDER_SCOPE.UNKNOWN,
      eligible: false,
      reason: "SCOPE_UNCONFIRMED",
    });
    expect(
      providerPolicy({
        STT_PROVIDER: "generic-openai",
        STT_OPEN_AI_COMPATIBLE_ENDPOINT: "http://localhost:8080",
        YUSUF_OS_STT_PROVIDER_SCOPE: "LOCAL",
      }).stt
    ).toMatchObject({ scope: PROVIDER_SCOPE.LOCAL, eligible: true });
  });

  test("transcription reuses an allowed local AnythingLLM provider", async () => {
    const transcribe = jest.fn().mockResolvedValue("  local transcript  ");
    const service = new VoiceService({
      env: {
        STT_PROVIDER: "lemonade",
        STT_LEMONADE_BASE_PATH: "http://localhost:8000",
      },
      sttFactory: () => ({ transcribe }),
    });
    await expect(
      service.transcribe(Buffer.from("audio"), "request.webm")
    ).resolves.toBe("local transcript");
    expect(transcribe).toHaveBeenCalledWith(
      Buffer.from("audio"),
      "audio.webm",
      { signal: expect.any(AbortSignal) }
    );
  });

  test("a refused cloud provider is never instantiated", async () => {
    const sttFactory = jest.fn();
    const service = new VoiceService({
      env: { STT_PROVIDER: "deepgram", STT_DEEPGRAM_API_KEY: "configured" },
      sttFactory,
    });
    await expect(service.transcribe(Buffer.from("audio"))).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE",
    });
    expect(sttFactory).not.toHaveBeenCalled();
  });

  test("speech output is bounded and can use an explicitly local provider", async () => {
    const ttsBuffer = jest.fn().mockResolvedValue(Buffer.from("speech"));
    const service = new VoiceService({
      env: {
        TTS_PROVIDER: "kokoro",
        TTS_KOKORO_ENDPOINT: "http://localhost:8880/v1",
      },
      ttsFactory: () => ({ ttsBuffer }),
    });
    await expect(service.speak("مرحبا Yusuf")).resolves.toEqual(
      Buffer.from("speech")
    );
    await expect(
      service.speak("x".repeat(MAX_SPEECH_CHARS + 1))
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.transcribe(Buffer.alloc(MAX_AUDIO_BYTES + 1))
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("local providers are preferred over an explicitly permitted cloud primary", async () => {
    const local = jest.fn().mockResolvedValue("local first");
    const cloud = jest.fn().mockResolvedValue("cloud fallback");
    const sttFactory = jest.fn((provider) => ({
      transcribe: provider === "lemonade" ? local : cloud,
    }));
    const service = new VoiceService({
      env: {
        STT_PROVIDER: "openai",
        OPEN_AI_KEY: "configured",
        YUSUF_OS_STT_FALLBACK_PROVIDER: "lemonade",
        STT_LEMONADE_BASE_PATH: "http://localhost:8000",
        YUSUF_OS_VOICE_ALLOW_CLOUD: "true",
      },
      sttFactory,
    });
    await expect(service.transcribe(Buffer.from("audio"))).resolves.toBe(
      "local first"
    );
    expect(sttFactory).toHaveBeenCalledWith("lemonade");
    expect(cloud).not.toHaveBeenCalled();
  });

  test("failed local output falls back only to explicitly allowed cloud", async () => {
    const sttFactory = jest.fn((provider) => ({
      transcribe:
        provider === "lemonade"
          ? jest.fn().mockResolvedValue("")
          : jest.fn().mockResolvedValue("cloud result"),
    }));
    const service = new VoiceService({
      env: {
        STT_PROVIDER: "lemonade",
        STT_LEMONADE_BASE_PATH: "http://localhost:8000",
        YUSUF_OS_STT_FALLBACK_PROVIDER: "openai",
        OPEN_AI_KEY: "configured",
        YUSUF_OS_VOICE_ALLOW_CLOUD: "true",
      },
      sttFactory,
    });
    await expect(service.transcribe(Buffer.from("audio"))).resolves.toBe(
      "cloud result"
    );
    expect(sttFactory.mock.calls.map(([provider]) => provider)).toEqual([
      "lemonade",
      "openai",
    ]);
  });

  test("empty transcripts and empty speech buffers fail closed", async () => {
    const stt = new VoiceService({
      env: {
        STT_PROVIDER: "lemonade",
        STT_LEMONADE_BASE_PATH: "http://localhost:8000",
      },
      sttFactory: () => ({ transcribe: jest.fn().mockResolvedValue("") }),
    });
    await expect(stt.transcribe(Buffer.from("audio"))).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE",
    });

    const tts = new VoiceService({
      env: {
        TTS_PROVIDER: "kokoro",
        TTS_KOKORO_ENDPOINT: "http://localhost:8880/v1",
      },
      ttsFactory: () => ({ ttsBuffer: jest.fn().mockResolvedValue(null) }),
    });
    await expect(tts.speak("response")).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE",
    });
  });

  test("a non-responsive provider is bounded by the voice timeout", async () => {
    jest.useFakeTimers();
    try {
      const service = new VoiceService({
        env: {
          STT_PROVIDER: "lemonade",
          STT_LEMONADE_BASE_PATH: "http://localhost:8000",
          YUSUF_OS_VOICE_PROVIDER_TIMEOUT_MS: "1000",
        },
        sttFactory: () => ({ transcribe: () => new Promise(() => {}) }),
      });
      const result = expect(
        service.transcribe(Buffer.from("audio"))
      ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
      await jest.advanceTimersByTimeAsync(1000);
      await result;
    } finally {
      jest.useRealTimers();
    }
  });

  test("an already-disconnected request never starts a provider call", async () => {
    const transcribe = jest.fn();
    const service = new VoiceService({
      env: {
        STT_PROVIDER: "lemonade",
        STT_LEMONADE_BASE_PATH: "http://localhost:8000",
      },
      sttFactory: () => ({ transcribe }),
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.transcribe(Buffer.from("audio"), "audio.webm", {
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(transcribe).not.toHaveBeenCalled();
  });
});
