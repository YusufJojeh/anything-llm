class ResponseTooLargeError extends Error {
  constructor(maxBytes) {
    super(`Model provider response exceeded ${maxBytes} bytes.`);
    this.name = "ResponseTooLargeError";
    this.code = "RESPONSE_TOO_LARGE";
  }
}

function abortError() {
  const error = new Error("Model provider response reading was aborted.");
  error.name = "AbortError";
  error.code = "ABORTED";
  return error;
}

async function readChunk(reader, signal) {
  if (!signal) return reader.read();
  if (signal.aborted) {
    await reader.cancel();
    throw abortError();
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      Promise.resolve(reader.cancel()).finally(() => reject(abortError()));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(reader.read()).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}

async function readLimitedText(response, maxBytes, { signal } = {}) {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = "";
    try {
      while (true) {
        const { done, value } = await readChunk(reader, signal);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw new ResponseTooLargeError(maxBytes);
        }
        text += decoder.decode(value, { stream: true });
      }
      return text + decoder.decode();
    } finally {
      reader.releaseLock?.();
    }
  }
  if (typeof response.text === "function") {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes)
      throw new ResponseTooLargeError(maxBytes);
    return text;
  }
  if (typeof response.json === "function") {
    // Test/mocked transports may omit a ReadableStream. Production fetch
    // always takes the streaming branch above.
    const value = await response.json();
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text, "utf8") > maxBytes)
      throw new ResponseTooLargeError(maxBytes);
    return text;
  }
  throw new Error("Model provider response body is unavailable.");
}

async function readLimitedJson(response, maxBytes, options) {
  const text = await readLimitedText(response, maxBytes, options);
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Model provider returned malformed JSON.");
    error.code = "MALFORMED_RESPONSE";
    throw error;
  }
}

module.exports = {
  ResponseTooLargeError,
  readLimitedText,
  readLimitedJson,
};
