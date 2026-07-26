import { useState } from "react";
import Flashcards from "./Flashcards";
import Quiz from "./Quiz";

export default function ResultsView({ studySet, onStartOver }) {
  const [tab, setTab] = useState("flashcards");

  return (
    <div className="results-view">
      <div className="results-view__header">
        <button type="button" className="btn btn--secondary" onClick={onStartOver}>
          ← Start over
        </button>
        <h2 className="results-view__topic">{studySet.topic}</h2>
      </div>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "flashcards"}
          className={`tab ${tab === "flashcards" ? "tab--active" : ""}`}
          onClick={() => setTab("flashcards")}
        >
          Flashcards ({studySet.flashcards.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "quiz"}
          className={`tab ${tab === "quiz" ? "tab--active" : ""}`}
          onClick={() => setTab("quiz")}
        >
          Quiz ({studySet.quiz.length})
        </button>
      </div>

      {tab === "flashcards" ? (
        <Flashcards cards={studySet.flashcards} />
      ) : (
        <Quiz questions={studySet.quiz} />
      )}
    </div>
  );
}
