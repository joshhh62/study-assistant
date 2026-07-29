# Study Assistant

Paste your notes, name a topic, or upload a PDF — get back 5 flashcards and a 10-question quiz you can actually use. Flip through the cards, take the quiz, retest whatever you got wrong, and see a color-coded score summary with per-question reasoning at the end. You can also refine any set with follow-up instructions, pick up saved sessions later, and let spaced repetition tell you which cards need review.

## Demo

[Demo video](https://drive.google.com/file/d/1HC5ZhGt4FiB5FCX07MnvOTQBg5LlWupd/view?usp=sharing) — entering a topic, generating a set, flipping through flashcards, taking the quiz, and the failure-handling paths in action.

## Features

- Generate flashcards and a quiz from pasted notes, a topic name, or an uploaded PDF
- Flip-card flashcards with spaced repetition (Leitner-box scheduling), so review time goes to the cards you actually struggle with
- Scored quiz with per-question explanations and a "retest what you got wrong" loop
- Refine an existing set with follow-up instructions ("make it harder", "add 3 more questions", or free text) instead of starting over
- Sessions saved locally so closing the tab doesn't lose your work
- Structured-output pipeline: the LLM's response is schema-validated and retried on failure, never trusted blindly — see [Handling bad AI output](#handling-bad-ai-output)

## What this is

A small React app with a thin Express backend that proxies calls to an LLM. The model returns **structured JSON** (not chat text), which the frontend parses and renders as interactive, stateful components — flippable flashcards and a scored multiple-choice quiz. It's deliberately not a chatbot.

## Setup

Requirements: Node 18+.

```bash
npm install
npm start
```

`npm install` installs the root, `client/`, and `server/` dependencies, and its `postinstall` hook also creates `server/.env` from `server/.env.example` if one doesn't exist yet (with `MOCK_MODE=true`, so there's nothing to configure before the first run). `npm start` runs the Express API (port 3001) and the Vite dev server (port 5173) together, with `/api/*` proxied from the client to the server. Open **http://localhost:5173**.

### Using a real LLM

By default `server/.env` (auto-created on install) has `MOCK_MODE=true`, so the app works immediately with no API key. To use a real model:

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

- `server/src/llmClient.js` — calls Groq's OpenAI-compatible chat completions endpoint with `response_format: json_object`, strips markdown fences the model sometimes adds anyway, parses, and validates against a schema. On invalid output, it retries **once** with a fresh call before giving up. Exports `generateStudySet` (fresh generation) and `refineStudySet` (edits an existing set per an instruction) — both go through the same `attemptWithRetry`/validation pipeline, and both are also used by the PDF route below (PDF generation is just `generateStudySet` given PDF-extracted text as input).
- `server/src/schema.js` — a Zod schema for the exact shape the frontend expects, plus hand-written checks Zod alone can't express: each quiz question's `correctIndex` actually falls inside its own `options` array, and no option is a lazy catch-all like "All of the above" / "Both A and C" (the model's instructions say not to do this, but a failed schema check forces the one retry rather than trusting the prompt alone).
- `server/src/index.js` — three routes: `POST /api/generate`, `POST /api/refine`, and `POST /api/generate-pdf` (multipart upload, extracts text with `pdf-parse`, then reuses the same generation pipeline), plus `GET /api/health`. Validates input, bounds each request to 25s, maps internal error codes to HTTP status + a user-facing message.
- `client/src/App.jsx` — owns request state (`idle | loading | success | error`) for generation (shared between the text and PDF submit paths via a common `finishGenerate` helper), a *separate* `refineStatus`/`refineError` pair for the refinement loop (so a failed refine never blanks out the study set you already have), and the stale-response guards for both (see below).
- `client/src/storage.js` — localStorage-backed session persistence and Leitner-box spaced-repetition scheduling. Pure functions, unit-tested with a Node localStorage shim (see commit history).
- `client/src/components/` — `InputScreen` (+ session history list + PDF upload), `Flashcards` (+ due-first ordering), `Quiz` (+ scored summary with per-question reasoning), `RefineBar`, plus small `LoadingState`/`ErrorState` pieces.

## Handling bad AI output

LLM output is unreliable by nature, so the app is built to never trust it blindly:

- **Malformed JSON / wrong shape**: the backend parses and validates every model response against a Zod schema before it ever reaches the frontend. If it fails, the server retries the model call once with the same prompt. If it fails again, the frontend gets a clean error message, never raw garbage or a crash.
- **correctIndex out of range**: schema-valid but semantically broken output (an answer index pointing outside its own options list) is caught by an explicit post-validation check, not just trusted because it parsed.
- **Slow responses**: the server aborts the upstream call after 25s and returns a `504` with a clear message rather than hanging the request.
- **Failed/empty input**: empty or oversized input is rejected client-adjacent (in the route handler) before any model call is made.
- **Stale responses**: if you submit a second request before the first one returns (or hit "Start over"), the in-flight request is aborted via `AbortController`, and an incrementing `requestId` ref means even if a late response arrived anyway, `App.jsx` would ignore it rather than overwrite newer state. This applies separately to generate (`submit()`) and refine (`handleRefine()`) — they have independent request-id/abort refs, so a slow refine can't clobber a fresh generate or vice versa.
- **Malformed `currentSet` sent to /api/refine**: the server re-validates the study set the client sends back (it's not trusted just because the client had it) before using it in a prompt — a tampered or corrupted payload gets a 400, not a crash or a garbage refine.
- **A failed refine doesn't lose your set**: refine has its own `refineStatus`/`refineError` state, separate from the main generate flow. If it fails, the study set you had before the refine stays exactly as it was — only a specific inline error appears, nothing is replaced or blanked.
- **No crashes**: every failure path (network error, non-2xx, unparseable JSON, schema mismatch, timeout) resolves to a specific error message and a "Try again" button — never an unhandled exception or a blank screen.

## Feature notes

**PDF upload** (`POST /api/generate-pdf`, `client/src/components/PdfUpload.css`). Upload a PDF instead of pasting notes — the server extracts text server-side with `pdf-parse` (memory-only via `multer`, nothing written to disk), then runs it through the exact same generation pipeline as a text submit. Handles the realistic failure modes explicitly rather than a generic 500: non-PDF file, empty/scanned/image-only PDF (no OCR — a clear message says so instead of pretending it worked), oversized upload, and PDFs whose text is long enough that it gets truncated before hitting the LLM (surfaced to the user as a small notice, not silently).

**Refinement loop** (`client/src/components/RefineBar.jsx`, `POST /api/refine`). Follow-up instructions edit the existing set instead of regenerating from scratch — quick-action buttons ("Make it harder", "Make it easier", "Add 3 more questions") plus a free-text box for anything else. The backend prompt tells the model to preserve unchanged cards' ids and only add new ones past the existing range, so a refine reads as an edit, not a fresh generation. It has its own request state, deliberately separate from the main generate flow (`refineStatus`/`refineError` in `App.jsx`) — a failed or in-flight refine never blanks out the study set already on screen, and it gets the same stale-response guard (its own request-id ref + `AbortController`) as the initial generation.

**Save/reload sessions** (`client/src/storage.js`). Every generated (or refined) study set is saved to `localStorage`, and the input screen lists recent sessions by topic and relative time, so closing the tab doesn't lose your work. This is a real trade-off, not a full backend feature — sessions are per-browser/per-device, there's no account or sync. Storage reads/writes are wrapped in `try/catch` so a corrupted value or a full/disabled storage quota (private browsing) degrades to "no sessions" instead of crashing the app.

**Spaced repetition for flashcards** (also `storage.js`). Each flashcard gets a simple Leitner-box schedule: marking "Got it" advances a box (next review in 1 → 3 → 7 → 14 days), marking "Still learning" resets it to box 0 (due again immediately). Reopening a saved session reorders the deck so overdue/struggling cards come first — within a *fresh* session this is a no-op (everything's due "now"), which is intentional; the visible effect only shows up once you've marked some cards and come back later. Verified with `client/src/storage.test.mjs` (`npm run test:storage` from `client/`) — a small dependency-free script exercising box advancement, due-ordering, and the refine-extends-schedule-without-losing-progress case, since this logic has no UI-visible feedback loop fast enough to eyeball in a demo.

## Known limitations

- Only one provider is wired up (Groq). Swapping providers means editing `llmClient.js`'s `getRawContent` — the schema/validation/retry layer is provider-agnostic, but there's no config-driven adapter for OpenAI/Gemini/etc. yet.
- Sessions persist in `localStorage` only — per-browser, per-device, no account or sync, and cleared if the user clears site data. Real persistence would mean a backend + database.
- Spaced repetition is a simple fixed-interval Leitner system (5 boxes, 0/1/3/7/14 days), not a real algorithm like SM-2 — no per-card ease factor, no accounting for how *early* or *late* a review happens relative to when it was due.
- No streaming — the full response is generated server-side before anything renders, for both generate and refine. Simpler to reason about, but a loading spinner is the only feedback during generation.
- The one retry on invalid output is a flat retry with the same prompt, not a corrective retry that tells the model what it got wrong. A corrective retry (feeding the parse/validation error back to the model) would likely have a higher success rate.
- Refine has no undo — if an instruction produces something you don't want, there's no way back to the pre-refine set short of "Start over" (which loses the whole session, not just the last edit).
- PDF upload has no OCR — scanned/image-only PDFs return a clear "couldn't read that PDF" error rather than silently producing an empty study set. Very long PDFs are also truncated to a fixed character cap before being sent to the model (the UI tells you when this happened).
- Test coverage is one script (`client/src/storage.test.mjs`) for the spaced-repetition/session logic — no tests for the React components or the Express routes. Verification there is manual + the mock-mode paths described above.

## Deployment

Live at **[study-assistant-five-rose.vercel.app](https://study-assistant-five-rose.vercel.app)**. Both the frontend and backend run on Vercel as two separate projects from the same repo — the backend as a serverless function (`server/api/index.js` re-exports the Express app; `server/vercel.json` rewrites every request to it), the frontend as a static Vite build.

**Backend project**
- New Project → import this repo.
- Root directory: `server`
- Environment variables: `GROQ_API_KEY` (your key), `LLM_PROVIDER=groq`, `GROQ_MODEL=llama-3.3-70b-versatile`, `MOCK_MODE` left blank for real LLM calls.
- Deploy, then copy the resulting `.vercel.app` URL.

**Frontend project**
- New Project → import the same repo again as a second project.
- Root directory: `client` (Vercel auto-detects the Vite preset).
- Environment variable: `VITE_API_BASE_URL` = the backend project's URL from the step above (no trailing slash).
- Deploy.

Note: `client/src/api.js` reads `VITE_API_BASE_URL` at build time and falls back to relative `/api/...` calls (which only work via the local Vite dev proxy) when it's unset — so local dev needs no config, but a production build does need that env var set on Vercel or every request will 404.
