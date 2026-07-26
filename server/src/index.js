import "dotenv/config";
import express from "express";
import cors from "cors";
import { generateStudySet, LLMError } from "./llmClient.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "100kb" }));

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

  // Bound how long we'll wait on the model. If the client has already
  // disconnected (they navigated away / fired a newer request and aborted
  // this one), stop work immediately instead of burning an API call.
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
    const studySet = await generateStudySet({ input, config: readConfig(), signal: controller.signal });
    res.json({ ok: true, data: studySet });
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
    console.error("Unexpected error in /api/generate:", err);
    res.status(500).json({ error: "internal", message: "Something went wrong on our end." });
  } finally {
    clearTimeout(timeout);
  }
});

app.listen(PORT, () => {
  console.log(`Study Assistant API listening on http://localhost:${PORT}`);
  const mock = process.env.MOCK_MODE;
  if (mock) console.log(`MOCK_MODE=${mock} — not calling a real LLM.`);
});
