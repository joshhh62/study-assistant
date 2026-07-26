import { useState } from "react";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";

const EXAMPLES = [
  "Photosynthesis — light and dark reactions",
  "The French Revolution, causes and timeline",
  "Big-O notation and common algorithm complexities",
];

export default function InputScreen({ input, onInputChange, onSubmit, status, errorMessage }) {
  const [touched, setTouched] = useState(false);
  const isLoading = status === "loading";
  const trimmedEmpty = input.trim().length === 0;

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (trimmedEmpty || isLoading) return;
    onSubmit(input);
  }

  // Ctrl/Cmd+Enter submits without leaving the textarea.
  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleSubmit(e);
    }
  }

  return (
    <div className="input-screen">
      <form onSubmit={handleSubmit} className="input-form">
        <label htmlFor="notes-input" className="input-label">
          Notes or topic
        </label>
        <textarea
          id="notes-input"
          className="input-textarea"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste your notes, or just type a topic like &quot;cellular respiration&quot;…"
          rows={8}
          disabled={isLoading}
          aria-invalid={touched && trimmedEmpty}
        />
        {touched && trimmedEmpty && (
          <p className="input-hint input-hint--warn">Enter some notes or a topic first.</p>
        )}

        {/* Empty state: nudge with examples until the user has typed anything */}
        {trimmedEmpty && !touched && status === "idle" && (
          <div className="input-examples">
            <span className="input-examples__label">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                type="button"
                key={ex}
                className="chip"
                onClick={() => onInputChange(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        <button type="submit" className="btn btn--primary" disabled={isLoading || trimmedEmpty}>
          {isLoading ? "Generating…" : "Generate study set"}
        </button>
        <p className="input-shortcut-hint">Tip: Ctrl/Cmd + Enter to submit</p>
      </form>

      {status === "loading" && <LoadingState />}
      {status === "error" && <ErrorState message={errorMessage} onRetry={() => onSubmit(input)} />}
    </div>
  );
}
