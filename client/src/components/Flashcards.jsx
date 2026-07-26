import { useEffect, useState, useCallback } from "react";

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Flashcards({ cards }) {
  const [deck, setDeck] = useState(cards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [knownMap, setKnownMap] = useState({}); // card id -> true (known) | false (still learning)
  const [reviewMode, setReviewMode] = useState(false);

  const total = deck.length;
  const current = deck[index];

  const goTo = useCallback(
    (newIndex) => {
      setFlipped(false);
      setIndex(((newIndex % total) + total) % total);
    },
    [total]
  );

  const next = useCallback(() => goTo(index + 1), [index, goTo]);
  const prev = useCallback(() => goTo(index - 1), [index, goTo]);

  function mark(known) {
    setKnownMap((m) => ({ ...m, [current.id]: known }));
    if (index < total - 1) next();
  }

  function shuffle() {
    setDeck((d) => shuffleArray(d));
    setIndex(0);
    setFlipped(false);
  }

  function startReview() {
    const unknownCards = cards.filter((c) => knownMap[c.id] !== true);
    if (unknownCards.length === 0) return;
    setDeck(shuffleArray(unknownCards));
    setIndex(0);
    setFlipped(false);
    setReviewMode(true);
  }

  function exitReview() {
    setDeck(cards);
    setIndex(0);
    setFlipped(false);
    setReviewMode(false);
  }

  // Left/Right to navigate, Space/Enter to flip. Skipped while focus is in
  // a text field so it doesn't fight with the input screen.
  useEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  if (!current) return null;

  const knownCount = Object.values(knownMap).filter((v) => v === true).length;
  const seenCount = Object.keys(knownMap).length;
  const unknownCount = cards.length - knownCount;
  const allSeen = seenCount >= cards.length;

  return (
    <div className="flashcards">
      <div className="flashcards__meta">
        <span>
          {index + 1} / {total}
          {reviewMode ? " (review)" : ""}
        </span>
        <span>{knownCount} known</span>
      </div>

      <button
        type="button"
        className={`flashcard ${flipped ? "flashcard--flipped" : ""}`}
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Showing answer, click to show question" : "Showing question, click to reveal answer"}
      >
        <div className="flashcard__inner">
          <div className="flashcard__face flashcard__face--front">{current.front}</div>
          <div className="flashcard__face flashcard__face--back">{current.back}</div>
        </div>
      </button>

      <div className="flashcards__nav">
        <button type="button" className="btn btn--secondary" onClick={prev}>
          ‹ Prev
        </button>
        <button type="button" className="btn btn--secondary" onClick={next}>
          Next ›
        </button>
      </div>

      <div className="flashcards__mark">
        <button type="button" className="btn btn--bad" onClick={() => mark(false)}>
          Still learning
        </button>
        <button type="button" className="btn btn--good" onClick={() => mark(true)}>
          Got it
        </button>
      </div>

      <div className="flashcards__footer">
        <button type="button" className="btn btn--secondary" onClick={shuffle}>
          Shuffle
        </button>
        {allSeen && !reviewMode && unknownCount > 0 && (
          <button type="button" className="btn btn--primary" onClick={startReview}>
            Review {unknownCount} you missed
          </button>
        )}
        {reviewMode && (
          <button type="button" className="btn btn--secondary" onClick={exitReview}>
            Exit review
          </button>
        )}
      </div>
    </div>
  );
}
