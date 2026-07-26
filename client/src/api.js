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

export function generateStudySet(input, { signal } = {}) {
  return postJson("/api/generate", { input }, signal);
}

// Refinement loop: edits an existing study set per a free-text instruction
// instead of regenerating from scratch. currentSet is sent back to the
// (stateless) server, which re-validates it before using it in a prompt.
export function refineStudySet(currentSet, instruction, { signal } = {}) {
  return postJson("/api/refine", { currentSet, instruction }, signal);
}
