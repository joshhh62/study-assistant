// Thin wrapper around the backend endpoints. Kept separate from components
// so the fetch/abort/parsing logic has one home.

// In local dev, Vite's proxy (see vite.config.js) forwards relative "/api/*"
// calls to the Express server, so the default empty base works with no
// config. Once frontend and backend are deployed as two separate services
// (e.g. Vercel + Render), there's no proxy in production — set
// VITE_API_BASE_URL to the deployed backend's URL (in Vercel's project env
// vars) and this picks it up at build time.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// Shared by every request path below: turns a fetch Response into either
// the server's `data` payload or a thrown ApiError, matching the server's
// {ok:true, data} / non-2xx {error, message} response shape. One home for
// this so postJson and postFormData don't duplicate it.
async function parseResponse(res) {
  let body;
  try {
    body = await res.json();
  } catch {
    throw new ApiError("The server sent back something unreadable.", "bad_response");
  }

  if (!res.ok || !body.ok) {
    throw new ApiError(body.message || "Something went wrong.", body.error || "unknown");
  }

  return body.data;
}

async function postJson(path, payload, signal) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err; // let callers distinguish cancellation
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", "network");
  }

  return parseResponse(res);
}

// Sibling to postJson for multipart bodies (file uploads) — fetch sets the
// multipart Content-Type + boundary itself when given a FormData body, so
// this must NOT set a Content-Type header manually.
async function postFormData(path, formData, signal) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      body: formData,
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", "network");
  }

  return parseResponse(res);
}

export function generateStudySet(input, { signal } = {}) {
  return postJson("/api/generate", { input }, signal);
}

// Same generation pipeline as generateStudySet, but sends a PDF file
// (multipart/form-data, field name "pdf") for the server to extract text
// from before running it through the identical LLM pipeline.
export function generateStudySetFromPdf(file, { signal } = {}) {
  const formData = new FormData();
  formData.append("pdf", file);
  return postFormData("/api/generate-pdf", formData, signal);
}

// Refinement loop: edits an existing study set per a free-text instruction
// instead of regenerating from scratch. currentSet is sent back to the
// (stateless) server, which re-validates it before using it in a prompt.
export function refineStudySet(currentSet, instruction, { signal } = {}) {
  return postJson("/api/refine", { currentSet, instruction }, signal);
}
