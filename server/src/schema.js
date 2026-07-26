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
    .max(15),
});

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
  return { ok: true, data: result.data };
}
