import { useState } from "react";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import { dueCardCount, formatRelativeTime } from "../storage";
import "./PdfUpload.css";

const EXAMPLES = [
  "Photosynthesis — light and dark reactions",
  "The French Revolution, causes and timeline",
  "Big-O notation and common algorithm complexities",
];

export default function InputScreen({
  input,
  onInputChange,
  onSubmit,
  onSubmitPdf,
  status,
  errorMessage,
  sessions,
  onOpenSession,
  onDeleteSession,
}) {
  const [touched, setTouched] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  // Tracks which form last fired, so the shared ErrorState's "Try again"
  // retries the right thing instead of always re-submitting the textarea
  // (which could be empty if the PDF form is what actually failed).
  const [lastSubmitKind, setLastSubmitKind] = useState("text");
  const isLoading = status === "loading";
  const trimmedEmpty = input.trim().length === 0;

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (trimmedEmpty || isLoading) return;
    setLastSubmitKind("text");
    onSubmit(input);
  }

  // Ctrl/Cmd+Enter submits without leaving the textarea.
  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleSubmit(e);
    }
  }

  function handlePdfChange(e) {
    setPdfFile(e.target.files?.[0] || null);
  }

  function handlePdfSubmit(e) {
    e.preventDefault();
    if (!pdfFile || isLoading) return;
    setLastSubmitKind("pdf");
    onSubmitPdf(pdfFile);
  }

  function handleRetry() {
    if (lastSubmitKind === "pdf" && pdfFile) {
      onSubmitPdf(pdfFile);
    } else {
      onSubmit(input);
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

      {/* Alternate entry point into the same generate action — hidden while
          a request (from either form) is already in flight. */}
      {!isLoading && (
        <div className="pdf-upload">
          <div className="pdf-upload__divider">
            <span>or upload a PDF</span>
          </div>
          <form onSubmit={handlePdfSubmit} className="pdf-upload__form">
            <label htmlFor="pdf-input" className="btn btn--secondary pdf-upload__label">
              {pdfFile ? "Choose a different PDF" : "Choose a PDF file"}
            </label>
            <input
              id="pdf-input"
              type="file"
              accept="application/pdf"
              className="pdf-upload__input"
              onChange={handlePdfChange}
              disabled={isLoading}
            />
            {pdfFile && (
              <div className="pdf-upload__selected">
                <span className="pdf-upload__filename">{pdfFile.name}</span>
                <button type="submit" className="btn btn--primary">
                  Generate from PDF
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {status === "loading" && <LoadingState />}
      {status === "error" && <ErrorState message={errorMessage} onRetry={handleRetry} />}

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
