import React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n } from "./renderWithI18n";

const api = vi.hoisted(() => ({
  voiceStatus: vi.fn(),
  runVoiceCommand: vi.fn(),
  transcribeVoice: vi.fn(),
  speakVoiceResponse: vi.fn(),
}));

vi.mock("@/features/yusufOS/api/client", () => ({ yusufApi: api }));

import VoiceConsole from "@/features/yusufOS/components/VoiceConsole";

let recorderInstances = [];
let recognitionInstances = [];

class FakeRecorder {
  static supported = () => true;

  static isTypeSupported(type) {
    return FakeRecorder.supported(type);
  }

  constructor(_stream, options = {}) {
    this.mimeType = options.mimeType || "audio/mp4";
    this.state = "inactive";
    recorderInstances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["audio"], { type: this.mimeType }),
    });
    this.onstop?.();
  }
}

class FakeRecognition {
  constructor() {
    this.abort = vi.fn();
    recognitionInstances.push(this);
  }

  start() {
    this.onresult?.({
      results: [{ 0: { transcript: "record the role" } }],
    });
  }

  stop() {
    this.onend?.();
  }
}

describe("Yusuf OS voice console", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recorderInstances = [];
    recognitionInstances = [];
    FakeRecorder.supported = () => true;
    api.voiceStatus.mockResolvedValue({
      stt: { provider: "native", scope: "BROWSER", eligible: true },
      tts: { provider: null, eligible: false },
      browser: { allowSpeechServices: true },
    });
    api.runVoiceCommand.mockResolvedValue({
      response: "I prepared a governed action.",
      state: "APPROVAL_REQUIRED",
      approvalId: "123e4567-e89b-12d3-a456-426614174000",
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });
    const permissionStatus = { state: "prompt", onchange: null };
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue(permissionStatus) },
    });
    window.MediaRecorder = FakeRecorder;
    window.SpeechRecognition = FakeRecognition;
    window.AudioContext = class {
      createAnalyser() {
        return {
          fftSize: 0,
          frequencyBinCount: 1,
          getByteFrequencyData: vi.fn(),
        };
      }
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      close() {
        return Promise.resolve();
      }
    };
    window.requestAnimationFrame = vi.fn(() => 1);
    window.cancelAnimationFrame = vi.fn();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: vi.fn(() => [
          {
            name: "Local English",
            lang: "en-US",
            localService: true,
          },
        ]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        speak: vi.fn(),
        cancel: vi.fn(),
      },
    });
    globalThis.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
  });

  test("never autoplays a response and exposes governed approval state", async () => {
    renderWithI18n(<VoiceConsole />);
    const start = await screen.findByRole("button", {
      name: "Start listening",
    });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    fireEvent.click(
      await screen.findByRole("button", { name: "Stop listening" })
    );
    expect(await screen.findByText("record the role")).toBeInTheDocument();
    expect(
      await screen.findByText("I prepared a governed action.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review required approval" })
    ).toHaveAttribute(
      "href",
      "/os/approvals/123e4567-e89b-12d3-a456-426614174000"
    );
    expect(api.runVoiceCommand).toHaveBeenCalledWith("record the role");
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play response" }));
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Stop speaking" }));
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });

  test("renders the same controls in Arabic", async () => {
    renderWithI18n(<VoiceConsole />, { language: "ar" });
    expect(
      await screen.findByRole("button", { name: "بدء الاستماع" })
    ).toBeInTheDocument();
    expect(screen.getByText(/لا يمكنه الموافقة/)).toBeInTheDocument();
  });

  test("tears down recognition, recording, and microphone on unmount", async () => {
    const track = { stop: vi.fn() };
    navigator.mediaDevices.getUserMedia.mockResolvedValue({
      getTracks: () => [track],
    });
    const view = renderWithI18n(<VoiceConsole />);
    const start = await screen.findByRole("button", {
      name: "Start listening",
    });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    await screen.findByRole("button", { name: "Stop listening" });
    view.unmount();
    expect(recognitionInstances[0].abort).toHaveBeenCalled();
    expect(recorderInstances[0].state).toBe("inactive");
    expect(track.stop).toHaveBeenCalled();
  });

  test("cancels a recording without sending a transcript or command", async () => {
    renderWithI18n(<VoiceConsole />);
    const start = await screen.findByRole("button", {
      name: "Start listening",
    });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel recording" })
    );
    expect(recorderInstances[0].state).toBe("inactive");
    expect(recognitionInstances[0].abort).toHaveBeenCalled();
    expect(api.transcribeVoice).not.toHaveBeenCalled();
    expect(api.runVoiceCommand).not.toHaveBeenCalled();
  });

  test("reports denied microphone permission without starting a command", async () => {
    const denied = new Error("Permission denied");
    denied.name = "NotAllowedError";
    navigator.mediaDevices.getUserMedia.mockRejectedValue(denied);
    renderWithI18n(<VoiceConsole />);
    const start = await screen.findByRole("button", {
      name: "Start listening",
    });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Permission denied"
    );
    expect(
      screen.getByText("Microphone permission denied")
    ).toBeInTheDocument();
    expect(api.runVoiceCommand).not.toHaveBeenCalled();
  });

  test("preserves an iOS-style MP4 recorder filename for server STT", async () => {
    FakeRecorder.supported = (type) => type === "audio/mp4";
    api.voiceStatus.mockResolvedValue({
      stt: { provider: "lemonade", scope: "LOCAL", eligible: true },
      tts: { provider: null, eligible: false },
      browser: { allowSpeechServices: false },
    });
    api.transcribeVoice.mockResolvedValue({ text: "safe read" });
    api.runVoiceCommand.mockResolvedValue({
      response: "Done",
      state: "COMPLETED",
      approvalId: null,
    });
    renderWithI18n(<VoiceConsole />);
    const start = await screen.findByRole("button", {
      name: "Start listening",
    });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    fireEvent.click(
      await screen.findByRole("button", { name: "Stop listening" })
    );
    await waitFor(() => expect(api.transcribeVoice).toHaveBeenCalled());
    expect(api.transcribeVoice.mock.calls[0][1]).toBe("voice.mp4");
  });

  test("dock variant exposes the same accessible names as the panel", async () => {
    renderWithI18n(<VoiceConsole variant="dock" />);
    const start = await screen.findByRole("button", {
      name: "Start listening",
    });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    fireEvent.click(
      await screen.findByRole("button", { name: "Stop listening" })
    );
    expect(await screen.findByText("record the role")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review required approval" })
    ).toHaveAttribute(
      "href",
      "/os/approvals/123e4567-e89b-12d3-a456-426614174000"
    );
    fireEvent.click(screen.getByRole("button", { name: "Play response" }));
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });
});

describe("Yusuf OS text command composer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.voiceStatus.mockResolvedValue({
      stt: { provider: "native", scope: "BROWSER", eligible: true },
      tts: { provider: null, eligible: false },
      browser: { allowSpeechServices: true },
    });
    api.runVoiceCommand.mockResolvedValue({
      response: "The system is healthy.",
      state: "COMPLETED",
      approvalId: null,
      taskId: "9c1c9b3a-1111-4c1a-9d2a-000000000001",
      runId: "9c1c9b3a-2222-4c1a-9d2a-000000000002",
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: {
        query: vi.fn().mockResolvedValue({ state: "prompt", onchange: null }),
      },
    });
  });

  async function typeAndGetControls() {
    renderWithI18n(<VoiceConsole />);
    const input = await screen.findByLabelText("Type a command");
    const send = screen.getByRole("button", { name: "Send command" });
    return { input, send };
  }

  test("renders the composer with a real text input and send control", async () => {
    const { input, send } = await typeAndGetControls();
    expect(input.tagName).toBe("TEXTAREA");
    expect(send).toBeDisabled();
  });

  test("Enter submits the typed command and clears the input", async () => {
    const { input } = await typeAndGetControls();
    fireEvent.change(input, {
      target: { value: "ما هي حالة النظام؟" },
    });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(api.runVoiceCommand).toHaveBeenCalledWith("ما هي حالة النظام؟")
    );
    expect(input).toHaveValue("");
  });

  test("Shift+Enter inserts a newline instead of submitting", async () => {
    const { input } = await typeAndGetControls();
    fireEvent.change(input, { target: { value: "line one" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(api.runVoiceCommand).not.toHaveBeenCalled();
    expect(input).toHaveValue("line one");
  });

  test("Send button submits the typed command", async () => {
    const { input, send } = await typeAndGetControls();
    fireEvent.change(input, { target: { value: "status please" } });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() =>
      expect(api.runVoiceCommand).toHaveBeenCalledWith("status please")
    );
  });

  test("rejects whitespace-only input without sending a request", async () => {
    const { input, send } = await typeAndGetControls();
    fireEvent.change(input, { target: { value: "   " } });
    expect(send).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(api.runVoiceCommand).not.toHaveBeenCalled();
  });

  test("bounds input length to the backend contract limit", async () => {
    const { input } = await typeAndGetControls();
    expect(input).toHaveAttribute("maxlength", "10000");
  });

  test("prevents a duplicate submit while a command is already processing", async () => {
    let resolveCall;
    api.runVoiceCommand.mockReturnValue(
      new Promise((resolve) => {
        resolveCall = resolve;
      })
    );
    const { input, send } = await typeAndGetControls();
    fireEvent.change(input, { target: { value: "first command" } });
    fireEvent.click(send);
    await waitFor(() => expect(input).toBeDisabled());
    expect(screen.getByRole("button", { name: "Send command" })).toBeDisabled();
    resolveCall({ response: "done", state: "COMPLETED", approvalId: null });
    await waitFor(() => expect(input).toBeEnabled());
    expect(api.runVoiceCommand).toHaveBeenCalledTimes(1);
  });

  test("surfaces a backend error from a typed command", async () => {
    api.runVoiceCommand.mockRejectedValue(new Error("Rejected by policy."));
    const { input, send } = await typeAndGetControls();
    fireEvent.change(input, { target: { value: "do something risky" } });
    fireEvent.click(send);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Rejected by policy."
    );
  });

  test("surfaces a network failure from a typed command", async () => {
    api.runVoiceCommand.mockRejectedValue(
      Object.assign(new Error("Yusuf OS is unreachable."), {
        code: "NETWORK_UNREACHABLE",
      })
    );
    const { input, send } = await typeAndGetControls();
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(send);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Yusuf OS is unreachable."
    );
  });

  test("does not crash on a malformed (field-missing) response", async () => {
    api.runVoiceCommand.mockResolvedValue({});
    const { input, send } = await typeAndGetControls();
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(send);
    await waitFor(() => expect(input).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("a typed command that requires approval renders the approval link, not an auto-approval", async () => {
    api.runVoiceCommand.mockResolvedValue({
      response: "This needs your approval.",
      state: "APPROVAL_REQUIRED",
      approvalId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    const { input, send } = await typeAndGetControls();
    fireEvent.change(input, { target: { value: "push a branch" } });
    fireEvent.click(send);
    expect(
      await screen.findByRole("link", { name: "Review required approval" })
    ).toHaveAttribute(
      "href",
      "/os/approvals/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    );
  });

  test("displays the actual returned response text for a typed command", async () => {
    const { input, send } = await typeAndGetControls();
    fireEvent.change(input, { target: { value: "status" } });
    fireEvent.click(send);
    expect(
      await screen.findByText("The system is healthy.")
    ).toBeInTheDocument();
  });

  test("links to the real task and run when the server returns their ids", async () => {
    const { input, send } = await typeAndGetControls();
    fireEvent.change(input, { target: { value: "status" } });
    fireEvent.click(send);
    expect(
      await screen.findByRole("link", { name: "View task" })
    ).toHaveAttribute("href", "/os/tasks/9c1c9b3a-1111-4c1a-9d2a-000000000001");
    expect(screen.getByRole("link", { name: "View run" })).toHaveAttribute(
      "href",
      "/os/runs/9c1c9b3a-2222-4c1a-9d2a-000000000002"
    );
  });

  test("does not fabricate task/run links when the server omits them", async () => {
    api.runVoiceCommand.mockResolvedValue({
      response: "Done",
      state: "COMPLETED",
      approvalId: null,
    });
    const { input, send } = await typeAndGetControls();
    fireEvent.change(input, { target: { value: "status" } });
    fireEvent.click(send);
    await screen.findByText("Done");
    expect(
      screen.queryByRole("link", { name: "View task" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "View run" })
    ).not.toBeInTheDocument();
  });

  test("renders the same composer in Arabic with RTL-appropriate labels", async () => {
    renderWithI18n(<VoiceConsole />, { language: "ar" });
    const input = await screen.findByLabelText("اكتب أمرًا");
    expect(
      screen.getByRole("button", { name: "إرسال الأمر" })
    ).toBeInTheDocument();
    expect(input).toHaveAttribute("dir", "auto");
  });

  test("voice and text call the same command function", async () => {
    const { input, send } = await typeAndGetControls();
    fireEvent.change(input, { target: { value: "status" } });
    fireEvent.click(send);
    await waitFor(() => expect(api.runVoiceCommand).toHaveBeenCalledTimes(1));
    // The mic path exercises the identical yusufApi.runVoiceCommand call —
    // covered by the existing "never autoplays a response…" test above. This
    // assertion documents that both paths share one mock call signature.
    expect(api.runVoiceCommand).toHaveBeenLastCalledWith("status");
  });
});

describe("Yusuf OS text composer — security boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.voiceStatus.mockResolvedValue({
      stt: { provider: "native", scope: "BROWSER", eligible: true },
      tts: { provider: null, eligible: false },
      browser: { allowSpeechServices: true },
    });
    api.runVoiceCommand.mockResolvedValue({
      response: "ok",
      state: "COMPLETED",
      approvalId: null,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: {
        query: vi.fn().mockResolvedValue({ state: "prompt", onchange: null }),
      },
    });
  });

  test("a typed command goes through the yusufApi client, never a raw fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderWithI18n(<VoiceConsole />);
    const input = await screen.findByLabelText("Type a command");
    fireEvent.change(input, { target: { value: "status" } });
    fireEvent.click(screen.getByRole("button", { name: "Send command" }));
    await waitFor(() => expect(api.runVoiceCommand).toHaveBeenCalled());
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test("never writes a session, CSRF, or command value into localStorage", async () => {
    // i18next itself persists the chosen language (`i18nextLng`) — that is
    // the test harness's framework, not this component, and is not a
    // security-sensitive value. What must never appear is anything this
    // component owns: the session/CSRF token or the command text itself.
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    renderWithI18n(<VoiceConsole />);
    const input = await screen.findByLabelText("Type a command");
    fireEvent.change(input, { target: { value: "status" } });
    fireEvent.click(screen.getByRole("button", { name: "Send command" }));
    await waitFor(() => expect(api.runVoiceCommand).toHaveBeenCalled());
    const keysWritten = setItemSpy.mock.calls.map(([key]) => key);
    expect(keysWritten).not.toContain("csrf");
    expect(
      keysWritten.some((key) => /csrf|token|session|command/i.test(key))
    ).toBe(false);
    setItemSpy.mockRestore();
  });
});
