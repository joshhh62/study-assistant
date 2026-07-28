import { useEffect, useMemo, useState } from "react";

export default function Quiz({ questions }) {
  const [round, setRound] = useState(() => questions);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null); // option index chosen for current question
  const [locked, setLocked] = useState(false); // true once an answer has been submitted
  const [results, setResults] = useState({}); // question id -> { correct: boolean, selectedIndex: number }
  const [roundNumber, setRoundNumber] = useState(1);

  const total = round.length;
  const current = round[index];
  const finished = index >= total;

  // Resync when the underlying question set changes out from under us —
  // e.g. a refine ("make it harder", "add 3 more questions") replaces
  // studySet.quiz with a new array while this tab is still mounted. Without
  // this, `round` (only ever initialized once via useState) would keep
  // showing the old questions even though the refine succeeded.
  useEffect(() => {
    setRound(questions);
    setIndex(0);
    setSelected(null);
    setLocked(false);
    setResults({});
    setRoundNumber(1);
  }, [questions]);

  function choose(optionIndex) {
    if (locked) return;
    setSelected(optionIndex);
  }

  function submitAnswer() {
    if (selected === null || locked) return;
    const correct = selected === current.correctIndex;
    setResults((r) => ({ ...r, [current.id]: { correct, selectedIndex: selected } }));
    setLocked(true);
  }

  function next() {
    setSelected(null);
    setLocked(false);
    setIndex((i) => i + 1);
  }

  // Keyboard: number keys pick an option, Enter submits/advances.
  useEffect(() => {
    function onKey(e) {
      if (finished) return;
      const tag = e.target.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;

      if (!locked) {
        const num = Number(e.key);
        if (num >= 1 && num <= current.options.length) {
          choose(num - 1);
          return;
        }
      }
      if (e.key === "Enter") {
        if (!locked) submitAnswer();
        else next();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, selected, current, finished]);

  const wrongQuestions = useMemo(
    () => round.filter((q) => results[q.id]?.correct === false),
    [round, results]
  );
  const correctCount = round.filter((q) => results[q.id]?.correct === true).length;
  const scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  function retestWrong() {
    if (wrongQuestions.length === 0) return;
    setRound(wrongQuestions);
    setIndex(0);
    setSelected(null);
    setLocked(false);
    setResults({});
    setRoundNumber((n) => n + 1);
  }

  function restartAll() {
    setRound(questions);
    setIndex(0);
    setSelected(null);
    setLocked(false);
    setResults({});
    setRoundNumber(1);
  }

  if (finished) {
    return (
      <div className="quiz quiz--summary">
        <p className="quiz__score-percent">{scorePercent}%</p>
        <p className="quiz__score">
          {correctCount} / {total} correct{roundNumber > 1 ? ` (retest round ${roundNumber})` : ""}
        </p>
        <div className="quiz__summary-actions">
          {wrongQuestions.length > 0 && (
            <button type="button" className="btn btn--primary" onClick={retestWrong}>
              Retest {wrongQuestions.length} wrong answer{wrongQuestions.length === 1 ? "" : "s"}
            </button>
          )}
          <button type="button" className="btn btn--secondary" onClick={restartAll}>
            Restart full quiz
          </button>
        </div>
        {wrongQuestions.length === 0 && <p className="quiz__perfect">All correct this round.</p>}

        <div className="quiz__review">
          <h3 className="quiz__review-title">Answer summary</h3>
          {round.map((q, i) => {
            const result = results[q.id];
            const isCorrect = result?.correct === true;
            const yourAnswer = result ? q.options[result.selectedIndex] : null;
            const correctAnswer = q.options[q.correctIndex];
            return (
              <div
                key={q.id}
                className={`quiz__review-item ${isCorrect ? "quiz__review-item--correct" : "quiz__review-item--wrong"}`}
              >
                <p className="quiz__review-question">
                  <span className="quiz__review-badge">{isCorrect ? "Correct" : "Wrong"}</span>
                  {i + 1}. {q.question}
                </p>
                {!isCorrect && (
                  <p className="quiz__review-your-answer">Your answer: {yourAnswer}</p>
                )}
                <p className="quiz__review-correct-answer">Correct answer: {correctAnswer}</p>
                <p className="quiz__review-explanation">{q.explanation}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="quiz">
      <div className="quiz__meta">
        <span>
          Question {index + 1} / {total}
          {roundNumber > 1 ? ` (retest round ${roundNumber})` : ""}
        </span>
      </div>

      <p className="quiz__question">{current.question}</p>

      <div className="quiz__options">
        {current.options.map((option, i) => {
          const isSelected = selected === i;
          const isCorrect = i === current.correctIndex;
          let stateClass = "";
          if (locked) {
            if (isCorrect) stateClass = "quiz-option--correct";
            else if (isSelected) stateClass = "quiz-option--incorrect";
          } else if (isSelected) {
            stateClass = "quiz-option--selected";
          }
          return (
            <button
              type="button"
              key={i}
              className={`quiz-option ${stateClass}`}
              onClick={() => choose(i)}
              disabled={locked}
            >
              <span className="quiz-option__key">{i + 1}</span>
              {option}
            </button>
          );
        })}
      </div>

      {locked && (
        <div className={`quiz__feedback ${selected === current.correctIndex ? "quiz__feedback--good" : "quiz__feedback--bad"}`}>
          <p>{selected === current.correctIndex ? "Correct." : "Not quite."}</p>
          <p className="quiz__explanation">{current.explanation}</p>
        </div>
      )}

      <div className="quiz__actions">
        {!locked ? (
          <button type="button" className="btn btn--primary" onClick={submitAnswer} disabled={selected === null}>
            Submit
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={next}>
            {index + 1 === total ? "See results" : "Next question"}
          </button>
        )}
      </div>
    </div>
  );
}
