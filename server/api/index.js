// Vercel serverless entrypoint. Vercel auto-detects any file under api/ as a
// function; this one just re-exports the real Express app from src/index.js
// so there's a single source of truth for routes/middleware — local dev
// (npm start) and the Vercel deployment run the exact same app. See
// vercel.json for the rewrite that sends every request here.
export { default } from "../src/index.js";
