import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
// Import the library's inner implementation directly, not the "pdf-parse"
// package entry point. That entry point (pdf-parse/index.js) has a
// module-level self-test guarded by `!module.parent` that's meant to only
// run when the package is executed directly — but under Node's ESM loader
// `module.parent` is unreliable, so the guard misfires and the self-test
// runs (and throws, since its own fixture file isn't guaranteed to be
// present) as a side effect of just importing the package. Importing the
// inner module skips that entirely and gives the exact same parse function.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { generateStudySet, refineStudySet, LLMError } from "./llmClient.js";
import { validateStudySet } from "./schema.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "150kb" }));

const PORT = process.env.PORT || 3001;
const REQUEST_TIMEOUT_MS = 25000;
const MAX_INPUT_CHARS = 8000;

// Memory storage only — no disk writes, keeping the server stateless like
// the rest of it. The file never touches disk; it's parsed straight out of
// the buffer and discarded once the request finishes.
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

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
  if (input.length > MAX_INPUT_CHARS) {
    return res.status(400).json({ error: "input_too_long", message: "Keep it under 8000 characters." });
  }

  await runLLMRequest(res, (signal) => generateStudySet({ input, config: readConfig(), signal }));
});

// Same generation pipeline as /api/generate, but the input text comes from
// an uploaded PDF instead of typed/pasted text. Once the text is extracted
// this funnels into the exact same generateStudySet() call — same prompts,
// same mock-mode behavior, same retry-on-invalid-output logic — so the two
// entry points stay 100% consistent. Extraction itself is never mocked; it
// always genuinely parses the uploaded file.
app.post("/api/generate-pdf", (req, res) => {
  pdfUpload.single("pdf")(req, res, async (uploadErr) => {
    if (uploadErr) {
      if (uploadErr.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "file_too_large", message: "PDF must be under 15MB." });
      }
      // Any other multer error (bad multipart data, unexpected field, etc.)
      // — fail clearly instead of letting it crash into a raw 500.
      console.error("PDF upload error:", uploadErr);
      return res.status(400).json({ error: "upload_failed", message: "Couldn't process the uploaded file." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "empty_input", message: "Choose a PDF file to upload first." });
    }
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "invalid_file_type", message: "Please upload a PDF file." });
    }

    let extractedText;
    try {
      const parsed = await pdfParse(req.file.buffer);
      extractedText = (parsed.text || "").trim();
    } catch (err) {
      console.error("PDF parse error:", err);
      return res.status(400).json({
        error: "pdf_parse_failed",
        message: "Couldn't read that PDF. It may be corrupted or password-protected.",
      });
    }

    // Common for scanned/image-only PDFs with no text layer — there's no
    // OCR here, so fail clearly and point the user at the manual path
    // rather than silently generating from nothing.
    if (!extractedText) {
      return res.status(400).json({
        error: "pdf_no_text",
        message:
          "Couldn't find any text in that PDF — it might be a scanned image without a text layer. Try pasting the notes directly instead.",
      });
    }

    // Matches /api/generate's input limit, but truncates instead of
    // rejecting outright — a long PDF shouldn't dead-end the user. The
    // `truncated` flag rides along in the success response so the frontend
    // can surface a small "only used the first part of your PDF" note.
    const truncated = extractedText.length > MAX_INPUT_CHARS;
    const input = truncated ? extractedText.slice(0, MAX_INPUT_CHARS) : extractedText;

    await runLLMRequest(res, async (signal) => {
      const data = await generateStudySet({ input, config: readConfig(), signal });
      return truncated ? { ...data, truncated: true } : data;
    });
  });
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

// On Vercel this module is loaded by api/index.js as a serverless function —
// there's no port to bind and Vercel calls the exported app directly per
// request. Only start a real listening server for local dev or a
// traditional always-on host.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Study Assistant API listening on http://localhost:${PORT}`);
    const mock = process.env.MOCK_MODE;
    if (mock) console.log(`MOCK_MODE=${mock} — not calling a real LLM.`);
  });
}

export default app;
