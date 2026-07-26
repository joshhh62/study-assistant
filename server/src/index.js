import "dotenv/config";
import express from "express";
import cors from "cors";
import { generateStudySet, refineStudySet, LLMError } from "./llmClient.js";
import { validateStudySet } from "./schema.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "150kb" }));

const PORT = process.env.PORT || 3001;
const REQUEST_TIMEOUT_MS = 25000;

function readConfig() {
  return {
    provider: process.env.LLM_PROVIDER || "groq",
    apiKey: process.env.GROQ_API_KEY || "",
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    // "" (falsy) means real calls; "true"/"flaky"/"broken" select a mock path.
    mockMode: process.env.MOCK_MODE || "",
  };
}

// Shared by /api/generate and /api/refine: bounds the request to
// REQUEST_TIMEOUT_MS, aborts on a real client disconnect, and maps
// LLMError codes to HTTP status + a user-facing message.
async function runLLMRequest(res, task) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("timeout")), REQUEST_TIMEOUT_MS);
  // Detect a *real* client disconnect (tab closed, request superseded and
  // aborted client-side) via res "close" firing before the response
  // finished writing. NOTE: req.on("close") is NOT safe for this — Node
  // fires it as soon as the request body is fully read, which happens
  // almost immediately, well before we're done — using it here caused
  // every request to abort itself with a false "timeout".
  res.on("close", () => {
    if (!res.writableEnded) controller.abort(new Error("client disconnected"));
  });

  try {
    const data = await task(controller.signal);
    res.json({ ok: true, data });
  } catch (err) {
    if (err.name === "AbortError" || controller.signal.aborted) {
      return res.status(504).json({ error: "timeout", message: "The model took too long to respond. Try again." });
    }
    if (err instanceof LLMError) {
      const statusByCode = { config: 500, upstream: 502, invalid_output: 502, timeout: 504 };
      return res.status(statusByCode[err.code] || 500).json({
        error: err.code,
        message:
          err.code === "invalid_output"
            ? "The model's response didn't come back in a usable shape, even after a retry. Try again, or shorten your input."
            : err.code === "config"
            ? err.message
            : "The AI provider had a problem. Try again in a moment.",
      });
    }
    console.error("Unexpected error in LLM request:", err);
    res.status(500).json({ error: "internal", message: "Something went wrong on our end." });
  } finally {
    clearTimeout(timeout);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/generate", async (req, res) => {
  const input = typeof req.body?.input === "string" ? req.body.input.trim() : "";

  if (!input) {
    return res.status(400).json({ error: "empty_input", message: "Paste some notes or a topic first." });
  }
  if (input.length > 8000) {
    return res.status(400).json({ error: "input_too_long", message: "Keep it under 8000 characters." });
  }

  await runLLMRequest(res, (signal) => generateStudySet({ input, config: readConfig(), signal }));
});

// Refinement loop: edits an existing study set per a free-text instruction
// instead of regenerating from scratch. The client sends back the set it
// currently has (so the server stays stateless) — we don't trust it blindly,
// it goes through the same schema validation as any model output before
// it's used in a prompt.
app.post("/api/refine", async (req, res) => {
  const instruction = typeof req.body?.instruction === "string" ? req.body.instruction.trim() : "";
  if (!instruction) {
    return res.status(400).json({ error: "empty_instruction", message: "Type what you'd like to change first." });
  }
  if (instruction.length > 2000) {
    return res.status(400).json({ error: "instruction_too_long", message: "Keep the instruction under 2000 characters." });
  }

  const currentSetValidation = validateStudySet(req.body?.currentSet);
  if (!currentSetValidation.ok) {
    return res.status(400).json({
      error: "invalid_current_set",
      message: "The study set you're trying to refine looks malformed on our end — try starting over.",
    });
  }

  await runLLMRequest(res, (signal) =>
    refineStudySet({ currentSet: currentSetValidation.data, instruction, config: readConfig(), signal })
  );
});

app.listen(PORT, () => {
  console.log(`Study Assistant API listening on http://localhost:${PORT}`);
  const mock = process.env.MOCK_MODE;
  if (mock) console.log(`MOCK_MODE=${mock} — not calling a real LLM.`);
});
