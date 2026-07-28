import { z } from "zod";

// The exact shape we require the model to return. Anything that doesn't
// match this gets treated as "bad output" and triggers the retry/error
// path in llmClient.js — it never reaches the frontend as-is.
export const StudySetSchema = z.object({
  topic: z.string().min(1).max(200),
  flashcards: z
    .array(
      z.object({
        id: z.string().min(1),
        front: z.string().min(1).max(300),
        back: z.string().min(1).max(800),
      })
    )
    .min(3)
    .max(20),
  quiz: z
    .array(
      z.object({
        id: z.string().min(1),
        question: z.string().min(1).max(400),
        options: z.array(z.string().min(1)).min(2).max(6),
        correctIndex: z.number().int().min(0),
        explanation: z.string().min(1).max(500),
      })
    )
    .min(3)
    .max(25),
});

// Catch-all options ("All of the above", "None of the above", "Both A and
// C", etc.) let the model dodge writing real distractors — most often as
// its lazy go-to for "make this harder". Matched loosely (case/whitespace
// insensitive) so we reject the whole response and force the one retry
// llmClient.js already does, rather than let this reach the UI.
const LAZY_OPTION_PATTERNS = [
  /^all of the (above|following|these)\.?$/i,
  /^none of the (above|following|these)\.?$/i,
  /^all( of the)? options?( (are|is))? correct\.?$/i,
  /^none( of the options)?( (are|is))? correct\.?$/i,
  /^both\s+[a-e]\s+and\s+[a-e]\.?$/i, // e.g. "Both A and C"
];
const isLazyOption = (opt) => LAZY_OPTION_PATTERNS.some((re) => re.test(opt.trim()));

// zod validates correctIndex is a non-negative int, but it can't validate
// "correctIndex is actually inside the options array" on its own — do that
// by hand, and fail closed (reject the whole set) rather than let the UI
// render an out-of-range answer.
export function validateStudySet(candidate) {
  const result = StudySetSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const badQuestion = result.data.quiz.find((q) => q.correctIndex >= q.options.length);
  if (badQuestion) {
    return { ok: false, error: `quiz question "${badQuestion.id}" has correctIndex out of range` };
  }
  const lazyQuestion = result.data.quiz.find((q) => q.options.some(isLazyOption));
  if (lazyQuestion) {
    return {
      ok: false,
      error: `quiz question "${lazyQuestion.id}" uses a catch-all option (e.g. "All of the above") instead of a self-contained answer`,
    };
  }
  return { ok: true, data: result.data };
}
