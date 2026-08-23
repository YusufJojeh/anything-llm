# Phase AC — Provider Validation Evidence

**Recorded:** 2026-08-24

## Scope and safety

All checks were local or read-only. No model was pulled, no credential was created, and no cloud
request was sent. This is evidence of provider transport/runtime behavior, not evidence that any
Agent completed a business task.

## Ollama / Gemma — LIVE-VALIDATED

Read-only `GET /api/tags` through `OllamaProvider.health()` returned `HEALTHY`. Installed local
models included `gemma3:12b`, `gemma3:4b`, and `gemma3:1b` (alongside other local models).

A single bounded local `POST /api/generate` used the already installed `gemma3:1b`:

| Field | Observed value |
| --- | --- |
| Prompt | `Reply with exactly YUSUF_OS_LOCAL_SMOKE_OK` |
| Temperature | `0` |
| Completion cap | `8` tokens |
| Result status | `done: true`, `done_reason: length` |
| Safe response excerpt | `YUSUF_OS_LOCAL_` |
| Total duration | `19,205,697,100 ns` |
| Load duration | `18,968,502,400 ns` |
| Prompt tokens | `24` |
| Completion tokens | `8` |
| Cost | `UNAVAILABLE` by construction; not rendered as zero |

The short response is expected: the deliberately small token cap stopped it at length. The daemon
reported usage fields directly; no token count or cost was synthesized by Yusuf OS.

## OpenAI — IMPLEMENTED / NOT LIVE-VALIDATED

`OPENAI_API_KEY` was absent at validation time. `OpenAIProvider` reads only that exact environment
variable and its conditional live smoke remained skipped. No OpenAI request was attempted.

## Regression evidence

`server/__tests__/yusufOS/modelRouting/OllamaProvider.test.js` and
`server/__tests__/yusufOS/modelRouting/OpenAIProvider.test.js`: **25 passed, 1 skipped**.
