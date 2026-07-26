// Canned response used when MOCK_MODE=true. Lets you develop and demo the
// full frontend flow (loading -> render -> flashcards -> quiz -> retest)
// without spending real API calls or needing a key yet.
export function buildMockStudySet(topic) {
  return {
    topic: topic.slice(0, 60) || "Mock topic",
    flashcards: [
      { id: "f1", front: "What is a closure?", back: "A function bundled with references to its surrounding lexical scope." },
      { id: "f2", front: "What does React's useEffect do?", back: "Runs a side effect after render, and optionally cleans it up." },
      { id: "f3", front: "What is Big-O of binary search?", back: "O(log n)." },
      { id: "f4", front: "What is a race condition?", back: "When output depends on the unpredictable timing/order of events." },
    ],
    quiz: [
      {
        id: "q1",
        question: "Which hook lets you run code after React commits a render?",
        options: ["useState", "useEffect", "useMemo", "useRef"],
        correctIndex: 1,
        explanation: "useEffect runs after the DOM has been updated.",
      },
      {
        id: "q2",
        question: "What's the time complexity of binary search on a sorted array?",
        options: ["O(n)", "O(n log n)", "O(log n)", "O(1)"],
        correctIndex: 2,
        explanation: "Binary search halves the search space each step.",
      },
      {
        id: "q3",
        question: "A closure keeps access to...",
        options: ["Only global variables", "Its outer function's variables", "Nothing after the outer function returns", "The DOM"],
        correctIndex: 1,
        explanation: "Closures retain references to variables in their defining scope.",
      },
    ],
  };
}

// Mock version of a refinement: makes a visible, deterministic change so
// MOCK_MODE=true can exercise the refine loop without a real key. Appends
// one new card/question referencing the instruction, and tags the topic,
// so it's obvious in the UI that a refine actually happened.
export function buildMockRefinedStudySet(currentSet, instruction) {
  const nextFlashcardId = `f${currentSet.flashcards.length + 1}-refined`;
  const nextQuizId = `q${currentSet.quiz.length + 1}-refined`;
  return {
    ...currentSet,
    topic: currentSet.topic.includes("(refined") ? currentSet.topic : `${currentSet.topic} (refined)`,
    flashcards: [
      ...currentSet.flashcards,
      {
        id: nextFlashcardId,
        front: "Mock refinement applied",
        back: `Instruction was: "${instruction}"`,
      },
    ],
    quiz: [
      ...currentSet.quiz,
      {
        id: nextQuizId,
        question: `Which instruction was just applied to this set?`,
        options: [instruction.slice(0, 60), "Nothing changed", "The set was deleted", "A new topic was generated"],
        correctIndex: 0,
        explanation: "This question was added by the mock refinement to prove the loop works.",
      },
    ],
  };
}

// A deliberately malformed response, used by MOCK_MODE=broken to exercise
// the error-handling path end to end (see server/src/llmClient.js).
export function buildMockBrokenPayload() {
  return "```json\n{ \"topic\": \"broken\", \"flashcards\": [ { \"front\": \"missing id and back\" } ] }\n```";
}
