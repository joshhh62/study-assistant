import { validateStudySet } from "./schema.js";
import { buildMockStudySet, buildMockRefinedStudySet, buildMockBrokenPayload } from "./mockData.js";

const GENERATE_SYSTEM_PROMPT = `You are a study-material generator. Given a topic or pasted notes, return ONLY a single JSON object (no markdown fences, no prose before or after) with this exact shape:

{
  "topic": string,
  "flashcards": [{ "id": string, "front": string, "back": string }],
  "quiz": [{ "id": string, "question": string, "options": string[], "correctIndex": number, "explanation": string }]
}

Rules:
- Generate exactly 5 flashcards and exactly 10 quiz questions. Not fewer, not more.
- Each id must be unique within its array (e.g. "f1", "f2", "q1", "q2").
- correctIndex is a zero-based index into that question's own options array.
- Every quiz question's "explanation" must be a substantive 1-2 sentence reason the correct answer is correct (not just restating the answer) — it is shown to the user as the reasoning behind that answer.
- Base the content on what the user actually gave you. If it's a topic name, generate accurate factual content. If it's pasted notes, generate content strictly from those notes.
- Never use "All of the above", "None of the above", "Both A and B", or any other option that refers to the other options instead of standing on its own. Every option, including the correct one, must be a specific, self-contained statement. To make a question harder, use options that are conceptually close, subtly wrong, or require careful reasoning to rule out — not a catch-all option.
- Vary which option index is correct across questions — do not make the same position (e.g. always the last option) correct every time. Mix it up so correctIndex is genuinely unpredictable across the quiz.
- Output must be valid JSON parseable by JSON.parse. Nothing else.`;

// Used by the refinement loop: the model edits an existing set rather than
// generating from scratch. Same output contract as GENERATE_SYSTEM_PROMPT
// so it goes through the exact same schema validation and retry path.
const REFINE_SYSTEM_PROMPT = `You are a study-material editor. You will be given the user's CURRENT study set as JSON and an INSTRUCTION describing a change to make. Apply the instruction and return ONLY a single JSON object (no markdown fences, no prose before or after) with this exact shape:

{
  "topic": string,
  "flashcards": [{ "id": string, "front": string, "back": string }],
  "quiz": [{ "id": string, "question": string, "options": string[], "correctIndex": number, "explanation": string }]
}

Rules:
- Preserve cards/questions the instruction doesn't ask you to change, including their original ids.
- Any new cards/questions get new ids that don't collide with existing ones (e.g. if f1..f5 already exist, new ones start at f6).
- correctIndex is a zero-based index into that question's own options array.
- Every quiz question's "explanation" must be a substantive 1-2 sentence reason the correct answer is correct.
- Keep exactly 5 flashcards and exactly 10 quiz questions after the edit, unless the instruction explicitly asks for a different count (e.g. "add 3 more questions").
- Never use "All of the above", "None of the above", "Both A and B", or any other option that refers to the other options instead of standing on its own — this applies even when the instruction is "make it harder" or "make it easier". Every option, including the correct one, must be a specific, self-contained statement. To make a question harder, rewrite the distractors to be conceptually close, subtly wrong, or require careful reasoning — never fall back on a catch-all option as the "hard" version.
- Vary which option index is correct across questions — do not make the same position (e.g. always the last option) correct every time. Mix it up so correctIndex is genuinely unpredictable across the quiz.
- If the instruction is unrelated to studying this topic, make the smallest reasonable change and don't invent unrelated content.
- Output must be valid JSON parseable by JSON.parse. Nothing else.`;

class LLMError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // "timeout" | "upstream" | "invalid_output" | "config"
  }
}

// Strips common wrapping the model adds despite instructions not to
// (markdown code fences being the big one) before we attempt JSON.parse.
function extractJsonPayload(raw) {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) text = fenceMatch[1].trim();
  return text;
}

function buildRefineUserMessage(currentSet, instruction) {
  return `Current study set:\n${JSON.stringify(currentSet)}\n\nInstruction: ${instruction}`;
}

async function callGroq({ messages, apiKey, model, signal }) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new LLMError(`Groq API returned ${res.status}: ${body.slice(0, 300)}`, "upstream");
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new LLMError("Groq response had no message content", "upstream");
  return content;
}

// Mock modes, used with MOCK_MODE in server/.env so the frontend's full
// failure-handling path can be exercised without a real API key:
//   "true"   - always returns a valid study set (happy path)
//   "flaky"  - first attempt returns malformed output, retry succeeds
//              (proves the one-retry-on-invalid-output logic actually works)
//   "broken" - always returns malformed output (proves the "still bad
//              after retry" path surfaces a clean error to the user)
// `kind` distinguishes a fresh generate from a refine of an existing set,
// since mock output differs (refine needs to visibly edit currentSet).
async function getRawContent({ kind, input, currentSet, instruction, apiKey, model, provider, mockMode, attemptNumber, signal }) {
  const mockResult = () =>
    kind === "refine" ? buildMockRefinedStudySet(currentSet, instruction) : buildMockStudySet(input);

  if (mockMode === "true") {
    await new Promise((r) => setTimeout(r, 500));
    return JSON.stringify(mockResult());
  }
  if (mockMode === "flaky") {
    await new Promise((r) => setTimeout(r, 500));
    return attemptNumber === 1 ? buildMockBrokenPayload() : JSON.stringify(mockResult());
  }
  if (mockMode === "broken") {
    await new Promise((r) => setTimeout(r, 500));
    return buildMockBrokenPayload();
  }
  if (provider === "groq") {
    const messages =
      kind === "refine"
        ? [
            { role: "system", content: REFINE_SYSTEM_PROMPT },
            { role: "user", content: buildRefineUserMessage(currentSet, instruction) },
          ]
        : [
            { role: "system", content: GENERATE_SYSTEM_PROMPT },
            { role: "user", content: input },
          ];
    return callGroq({ messages, apiKey, model, signal });
  }
  throw new LLMError(`Unknown LLM_PROVIDER "${provider}"`, "config");
}

// One attempt: get raw text (real model or mock), parse, validate against
// the schema. Throws LLMError with a specific code so the caller can
// decide whether a retry is worth it.
async function attemptOnce(params) {
  const raw = await getRawContent(params);

  const jsonText = extractJsonPayload(raw);
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new LLMError("Model output was not valid JSON", "invalid_output");
  }

  const validation = validateStudySet(parsed);
  if (!validation.ok) {
    throw new LLMError(`Model output failed schema validation: ${validation.error}`, "invalid_output");
  }
  return validation.data;
}

// Shared retry wrapper: exactly one retry, and only for invalid_output
// (the case where a corrective retry can plausibly help) — not for
// timeouts or upstream errors, which retrying the same request won't fix.
async function attemptWithRetry(baseParams) {
  try {
    return await attemptOnce({ ...baseParams, attemptNumber: 1 });
  } catch (err) {
    if (err.code === "invalid_output") {
      return await attemptOnce({ ...baseParams, attemptNumber: 2 });
    }
    throw err;
  }
}

function assertConfigured(config) {
  const { provider, apiKey, mockMode } = config;
  if (!mockMode && provider === "groq" && !apiKey) {
    throw new LLMError("GROQ_API_KEY is not set on the server. Add one to server/.env.", "config");
  }
}

export async function generateStudySet({ input, config, signal }) {
  assertConfigured(config);
  const { provider, apiKey, model, mockMode } = config;
  return attemptWithRetry({ kind: "generate", input, apiKey, model, provider, mockMode, signal });
}

// Refines an existing, already-validated study set per a free-text
// instruction. Reuses the exact same parse/validate/retry pipeline as
// generateStudySet, so a bad refinement response fails the same safe way.
export async function refineStudySet({ currentSet, instruction, config, signal }) {
  assertConfigured(config);
  const { provider, apiKey, model, mockMode } = config;
  return attemptWithRetry({ kind: "refine", currentSet, instruction, apiKey, model, provider, mockMode, signal });
}

export { LLMError };
