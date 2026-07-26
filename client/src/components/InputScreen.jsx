import { useState } from "react";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import { dueCardCount, formatRelativeTime } from "../storage";

const EXAMPLES = [
  "Photosynthesis — light and dark reactions",
  "The French Revolution, causes and timeline",
  "Big-O notation and common algorithm complexities",
];

export default function InputScreen({
  input,
  onInputChange,
  onSubmit,
  status,
  errorMessage,
  sessions,
  onOpenSession,
  onDeleteSession,
}) {
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

      {status === "idle" && sessions.length > 0 && (
        <div className="session-history">
          <h3 className="session-history__title">Recent sessions</h3>
          <ul className="session-history__list">
            {sessions.map((s) => {
              const due = dueCardCount(s.studySet, s.schedule);
              return (
                <li key={s.id} className="session-history__item">
                  <button
                    type="button"
                    className="session-history__open"
                    onClick={() => onOpenSession(s.id)}
                  >
                    <span className="session-history__topic">{s.topic}</span>
                    <span className="session-history__meta">
                      {formatRelativeTime(s.updatedAt)}
                      {due > 0 && <span className="session-history__due"> · {due} due</span>}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="session-history__delete"
                    aria-label={`Delete session: ${s.topic}`}
                    onClick={() => onDeleteSession(s.id)}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
