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
