export default function ResultsView({ studySet, onStartOver }) {
  // Placeholder — flashcards/quiz UI comes next. Confirms the input ->
  // loading -> success wiring works end to end before building the
  // interactive views on top of it.
  return (
    <div className="results-view">
      <button type="button" className="btn btn--secondary" onClick={onStartOver}>
        ← Start over
      </button>
      <h2>{studySet.topic}</h2>
      <p>{studySet.flashcards.length} flashcards, {studySet.quiz.length} quiz questions.</p>
    </div>
  );
}
