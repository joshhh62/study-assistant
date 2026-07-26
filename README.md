# Study Assistant

Paste your notes, or just name a topic. An LLM turns it into flashcards and a quiz — flip through cards, take the quiz, and retest whatever you got wrong.

Built for the Flam frontend internship assignment (Study Assistant option).

## What this is

A small React app with a thin Express backend that proxies calls to an LLM. The model returns **structured JSON** (not chat text), which the frontend parses and renders as interactive, stateful components — flippable flashcards and a scored multiple-choice quiz. It is deliberately not a chatbot.

## Setup

Requirements: Node 18+.

```bash
npm install
npm start
```

`npm install` installs the root, `client/`, and `server/` dependencies (via a `postinstall` hook). `npm start` runs the Express API (port 3001) and the Vite dev server (port 5173) together, with `/api/*` proxied from the client to the server. Open **http://localhost:5173**.

### Using a real LLM

By default the server runs in **mock mode** (see `server/.env`) so you can try the app immediately with no API key. To use a real model:

1. Get a free key at [console.groq.com/keys](https://console.groq.com/keys).
2. In `server/.env`, set `GROQ_API_KEY=your-key` and clear `MOCK_MODE=` (leave it blank).
3. Restart `npm start`.

The key never reaches the browser — the frontend only ever calls `/api/generate` on the same origin; the server holds the key and makes the outbound call.

### Testing failure handling without a real API key

`server/.env`'s `MOCK_MODE` has three settings, useful for exercising the app's error paths on demand:

| Value | Behavior |
|---|---|
| `true` | Always returns a valid canned study set (happy path). |
| `flaky` | First attempt returns malformed output; the server's built-in retry fixes it on attempt 2. |
| `broken` | Always returns malformed output, so the request fails even after the retry — exercises the "show an error, let the user retry" UI path. |

## Architecture

```
client/   Vite + React frontend
server/   Express API — the only thing that talks to the LLM
```

- `server/src/llmClient.js` — calls Groq's OpenAI-compatible chat completions endpoint with `response_format: json_object`, strips markdown fences the model sometimes adds anyway, parses, and validates against a schema. On invalid output, it retries **once** with a fresh call before giving up.
- `server/src/schema.js` — a Zod schema for the exact shape the frontend expects, plus a hand-written check that each quiz question's `correctIndex` actually falls inside its own `options` array (Zod alone can't express that cross-field constraint).
- `server/src/index.js` — the one route, `POST /api/generate`. Validates input, bounds the request to 25s, maps internal error codes to HTTP status + a user-facing message.
- `client/src/App.jsx` — owns request state (`idle | loading | success | error`) and the stale-response guard (see below).
- `client/src/components/` — `InputScreen`, `Flashcards`, `Quiz`, plus small `LoadingState`/`ErrorState` pieces.

## Handling bad AI output

This was the main point of the assignment, so specifically:

- **Malformed JSON / wrong shape**: the backend parses and validates every model response against a Zod schema before it ever reaches the frontend. If it fails, the server retries the model call once with the same prompt. If it fails again, the frontend gets a clean error message, never raw garbage or a crash.
- **correctIndex out of range**: schema-valid but semantically broken output (an answer index pointing outside its own options list) is caught by an explicit post-validation check, not just trusted because it parsed.
- **Slow responses**: the server aborts the upstream call after 25s and returns a `504` with a clear message rather than hanging the request.
- **Failed/empty input**: empty or oversized input is rejected client-adjacent (in the route handler) before any model call is made.
- **Stale responses**: if you submit a second request before the first one returns (or hit "Start over"), the in-flight request is aborted via `AbortController`, and an incrementing `requestId` ref means even if a late response arrived anyway, `App.jsx` would ignore it rather than overwrite newer state. This is in `client/src/App.jsx`'s `submit()`.
- **No crashes**: every failure path (network error, non-2xx, unparseable JSON, schema mismatch, timeout) resolves to a specific error message and a "Try again" button — never an unhandled exception or a blank screen.

## Known limitations

- Only one provider is wired up (Groq). Swapping providers means editing `llmClient.js`'s `getRawContent` — the schema/validation/retry layer is provider-agnostic, but there's no config-driven adapter for OpenAI/Gemini/etc. yet.
- No persistence — refreshing the page loses your current study set. "Save and reload sessions" was a stretch goal, not implemented.
- No streaming — the full response is generated server-side before anything renders. Simpler to reason about, but a loading spinner is the only feedback during generation.
- The one retry on invalid output is a flat retry with the same prompt, not a corrective retry that tells the model what it got wrong. A corrective retry (feeding the parse/validation error back to the model) would likely have a higher success rate.
- Deploy: not deployed yet (optional per the assignment) — runs locally via `npm start`. See "Deploying" below if you want to.
- No automated test suite (unit/e2e) — verification so far is manual + the mock-mode paths described above.

## AI usage note

This project was built with substantial help from Claude (Anthropic's AI assistant), used as a coding agent: scaffolding the project structure, implementing the backend proxy and schema validation, building the React components, and writing this README, based on the assignment brief and my direction/review throughout.

**Before submitting, make sure you can actually explain and defend every part of this** — the interview explicitly tests that (demo, code walkthrough, live bug fix, live feature add). Read through `server/src/llmClient.js` and `client/src/App.jsx` in particular; the stale-response guard and the retry-once logic are the parts most likely to come up.

## Time spent

_Fill in your actual time before submitting_ — the brief asks for total time spent including review. As a starting point: the initial build (scaffold → backend → input screen → flashcards → quiz → mobile pass → README) took a few focused hours with AI assistance. Add whatever time you spend reading, testing, and adjusting it yourself.

## Deploying (optional)

Not done here, but the shape would be: deploy `server/` as a small Node service (Render/Fly/Railway) with `GROQ_API_KEY` set as an environment secret, and `client/` as a static build (`npm run build` in `client/`) on Vercel/Netlify, with its API calls pointed at the deployed server's URL instead of the Vite dev proxy.

## Screen recording

_Add a link here before submitting_ — a short recording showing: entering a topic, generating, flipping through flashcards, taking the quiz, and hitting an error state (e.g. with `MOCK_MODE=broken`) to show the failure handling working.
