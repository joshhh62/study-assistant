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
      { id: "f5", front: "What is idempotency?", back: "A property where repeating an operation has the same effect as doing it once." },
    ],
    quiz: [
      {
        id: "q1",
        question: "Which hook lets you run code after React commits a render?",
        options: ["useState", "useEffect", "useMemo", "useRef"],
        correctIndex: 1,
        explanation: "useEffect is specifically designed to run side effects after the DOM has been updated, unlike useState/useMemo/useRef which don't run code post-commit.",
      },
      {
        id: "q2",
        question: "What's the time complexity of binary search on a sorted array?",
        options: ["O(n)", "O(n log n)", "O(log n)", "O(1)"],
        correctIndex: 2,
        explanation: "Binary search halves the remaining search space on every comparison, so the number of steps grows logarithmically with input size.",
      },
      {
        id: "q3",
        question: "A closure keeps access to...",
        options: ["Only global variables", "Its outer function's variables", "Nothing after the outer function returns", "The DOM"],
        correctIndex: 1,
        explanation: "A closure retains a live reference to the variables in the scope where it was created, even after that outer function has finished running.",
      },
      {
        id: "q4",
        question: "Which of these best describes a race condition?",
        options: [
          "A syntax error caught at compile time",
          "An outcome that depends on the unpredictable timing of concurrent operations",
          "A memory leak from unclosed resources",
          "An infinite loop",
        ],
        correctIndex: 1,
        explanation: "Race conditions happen when correctness depends on which of several concurrent operations happens to finish first, which isn't guaranteed.",
      },
      {
        id: "q5",
        question: "Which HTTP method is expected to be idempotent?",
        options: ["POST", "PUT", "CONNECT", "PATCH"],
        correctIndex: 1,
        explanation: "PUT is defined by the HTTP spec to fully replace a resource, so sending the same PUT twice leaves the resource in the same state as sending it once.",
      },
      {
        id: "q6",
        question: "What does useMemo primarily help with?",
        options: [
          "Persisting state across unmounts",
          "Memoizing an expensive computed value between renders",
          "Running side effects",
          "Directly mutating the DOM",
        ],
        correctIndex: 1,
        explanation: "useMemo caches the result of a computation and only recalculates it when its dependencies change, avoiding redundant work on re-renders.",
      },
      {
        id: "q7",
        question: "What is the worst-case time complexity of quicksort?",
        options: ["O(n log n)", "O(n)", "O(n^2)", "O(log n)"],
        correctIndex: 2,
        explanation: "Quicksort degrades to O(n^2) when the chosen pivot repeatedly produces very unbalanced partitions, such as on an already-sorted array with a naive pivot choice.",
      },
      {
        id: "q8",
        question: "Which term describes code that produces the same output given the same input, with no side effects?",
        options: ["Idempotent", "Pure", "Asynchronous", "Recursive"],
        correctIndex: 1,
        explanation: "A pure function's output depends only on its inputs and it doesn't modify any external state, making it predictable and easy to test.",
      },
      {
        id: "q9",
        question: "What is a deadlock?",
        options: [
          "Two or more processes each waiting on a resource the other holds, so neither proceeds",
          "A process that uses too much CPU",
          "A function that never returns a value",
          "A network request that times out",
        ],
        correctIndex: 0,
        explanation: "A deadlock is a circular wait: each process holds a resource another needs and won't release it, so all of them stall permanently.",
      },
      {
        id: "q10",
        question: "In Big-O notation, what does O(1) describe?",
        options: [
          "An operation that always takes constant time regardless of input size",
          "An operation that scales linearly with input size",
          "An operation that never completes",
          "An operation that halves the input each step",
        ],
        correctIndex: 0,
        explanation: "O(1) means the runtime doesn't grow with the size of the input — for example, accessing an array element by index.",
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
