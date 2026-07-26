import { useState } from "react";

const QUICK_ACTIONS = [
  { label: "Make it harder", instruction: "Make the quiz questions and flashcards noticeably harder and more advanced." },
  { label: "Make it easier", instruction: "Make the quiz questions and flashcards simpler and more beginner-friendly." },
  { label: "Add 3 more questions", instruction: "Add 3 more quiz questions covering different aspects of this topic." },
];

// Follow-up prompts that edit the existing study set instead of
// regenerating from scratch. Deliberately has its own loading/error
// state (passed in as props) rather than sharing App's main status —
// a failed or in-flight refine should never blank out the study set
// the user already has.
export default function RefineBar({ onRefine, status, errorMessage }) {
  const [text, setText] = useState("");
  const isLoading = status === "loading";

  function submit(instruction) {
    const trimmed = instruction.trim();
    if (!trimmed || isLoading) return;
    onRefine(trimmed);
    setText("");
  }

  return (
    <div className="refine-bar">
      <div className="refine-bar__quick">
        {QUICK_ACTIONS.map((qa) => (
          <button
            type="button"
            key={qa.label}
            className="chip"
            disabled={isLoading}
            onClick={() => submit(qa.instruction)}
          >
            {qa.label}
          </button>
        ))}
      </div>
      <form
        className="refine-bar__form"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <input
          type="text"
          className="refine-bar__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Refine this set — e.g. "focus more on part 2"'
          disabled={isLoading}
          aria-label="Refine this study set"
        />
        <button type="submit" className="btn btn--secondary" disabled={isLoading || !text.trim()}>
          {isLoading ? "Refining…" : "Refine"}
        </button>
      </form>
      {status === "error" && <p className="refine-bar__error">{errorMessage}</p>}
    </div>
  );
}
