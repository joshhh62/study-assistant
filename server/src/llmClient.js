import { validateStudySet } from "./schema.js";
import { buildMockStudySet, buildMockBrokenPayload } from "./mockData.js";

const SYSTEM_PROMPT = `You are a study-material generator. Given a topic or pasted notes, return ONLY a single JSON object (no markdown fences, no prose before or after) with this exact shape:

{
  "topic": string,
  "flashcards": [{ "id": string, "front": string, "back": string }],
  "quiz": [{ "id": string, "question": string, "options": string[], "correctIndex": number, "explanation": string }]
}

Rules:
- 4-10 flashcards, 3-8 quiz questions.
- Each id must be unique within its array (e.g. "f1", "f2", "q1", "q2").
- correctIndex is a zero-based index into that question's own options array.
- Base the content on what the user actually gave you. If it's a topic name, generate accurate factual content. If it's pasted notes, generate content strictly from those notes.
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

async function callGroq({ input, apiKey, model, signal }) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: input },
      ],
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
async function getRawContent({ input, apiKey, model, provider, mockMode, attemptNumber, signal }) {
  if (mockMode === "true") {
    await new Promise((r) => setTimeout(r, 500));
    return JSON.stringify(buildMockStudySet(input));
  }
  if (mockMode === "flaky") {
    await new Promise((r) => setTimeout(r, 500));
    return attemptNumber === 1 ? buildMockBrokenPayload() : JSON.stringify(buildMockStudySet(input));
  }
  if (mockMode === "broken") {
    await new Promise((r) => setTimeout(r, 500));
    return buildMockBrokenPayload();
  }
  if (provider === "groq") {
    return callGroq({ input, apiKey, model, signal });
  }
  throw new LLMError(`Unknown LLM_PROVIDER "${provider}"`, "config");
}

// One attempt: get raw text (real model or mock), parse, validate against
// the schema. Throws LLMError with a specific code so the caller can
// decide whether a retry is worth it.
async function attemptOnce({ input, apiKey, model, provider, mockMode, attemptNumber, signal }) {
  const raw = await getRawContent({ input, apiKey, model, provider, mockMode, attemptNumber, signal });

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

// Public entry point. Retries exactly once, and only for invalid_output
// (the case where a corrective retry can plausibly help) — not for
// timeouts or upstream errors, which retrying the same request won't fix.
export async function generateStudySet({ input, config, signal }) {
  const { provider, apiKey, model, mockMode } = config;

  if (!mockMode && provider === "groq" && !apiKey) {
    throw new LLMError("GROQ_API_KEY is not set on the server. Add one to server/.env.", "config");
  }

  try {
    return await attemptOnce({ input, apiKey, model, provider, mockMode, attemptNumber: 1, signal });
  } catch (err) {
    if (err.code === "invalid_output") {
      return await attemptOnce({ input, apiKey, model, provider, mockMode, attemptNumber: 2, signal });
    }
    throw err;
  }
}

export { LLMError };
