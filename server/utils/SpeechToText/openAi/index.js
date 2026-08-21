class OpenAiSTT {
  constructor() {
    if (!process.env.OPEN_AI_KEY) throw new Error("No OpenAI API key was set.");
    const { OpenAI: OpenAIApi } = require("openai");
    this.openai = new OpenAIApi({
      apiKey: process.env.OPEN_AI_KEY,
    });
    this.model = process.env.STT_OPEN_AI_MODEL ?? "whisper-1";
  }

  /**
   * Transcribes an audio buffer to text using the OpenAI STT service.
   * @param {Buffer} audioBuffer - The audio buffer to be transcribed.
   * @param {string} filename - Original filename, used to hint the audio container/codec to OpenAI.
   * @returns {Promise<string>} The transcribed text.
   */
  async transcribe(audioBuffer, filename = "audio.webm", { signal } = {}) {
    const { toFile } = require("openai");
    const file = await toFile(audioBuffer, filename);
    const payload = { file, model: this.model };
    const result = signal
      ? await this.openai.audio.transcriptions.create(payload, { signal })
      : await this.openai.audio.transcriptions.create(payload);
    return result?.text ?? "";
  }
}

module.exports = { OpenAiSTT };
