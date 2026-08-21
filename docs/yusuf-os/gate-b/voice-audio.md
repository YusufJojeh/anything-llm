# Voice / Audio Plane

Phase U adds voice as a governed interface, not a new execution authority.

- STT and TTS use existing AnythingLLM provider implementations behind a Yusuf OS privacy policy.
- Local providers are preferred. Browser speech and cloud providers require explicit environment
  opt-in; fallback is explicit and local-first.
- Audio and provider work are bounded, cancel on request disconnect, and fail closed on empty or
  malformed output. Uploaded audio is temporary input and is not copied into Yusuf OS records.
- A transcript enters the same Chief-of-Staff reasoning loop as typed input. It cannot encode
  approval, and an L3 decision must still stop on the durable exact-intent approval record.
- The `/os` UI uses push-to-talk, a 60-second recording ceiling, no surprise autoplay, visible
  processing/error state, and explicit play/stop/replay/rate/mute controls.
- English and Arabic are supported; untrusted transcript and response text is rendered with safe
  bidirectional isolation.

Configuration is documented in `server/.env.example`. Live browser/cloud behavior remains
environment-dependent and is not claimed unless its provider is actually validated.
