import { useRef, useState, useCallback } from "react";
import { generateStudySet, ApiError } from "./api";
import InputScreen from "./components/InputScreen";
import ResultsView from "./components/ResultsView";
import "./App.css";

export default function App() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [studySet, setStudySet] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Guards against a stale response overwriting a newer one. Every submit
  // gets an incrementing id; a response is only applied if it's still the
  // most recent request. Paired with AbortController so the superseded
  // network request (and backend work) is actually cancelled, not just
  // ignored client-side.
  const requestIdRef = useRef(0);
  const abortRef = useRef(null);

  const submit = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed || status === "loading") return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setStatus("loading");
    setErrorMessage(null);

    try {
      const data = await generateStudySet(trimmed, { signal: controller.signal });
      if (requestId !== requestIdRef.current) return; // a newer request already took over
      setStudySet(data);
      setStatus("success");
    } catch (err) {
      if (err.name === "AbortError") return; // cancelled on purpose (superseded or start-over)
      if (requestId !== requestIdRef.current) return;
      const message = err instanceof ApiError ? err.message : "Something unexpected happened. Try again.";
      setErrorMessage(message);
      setStatus("error");
    }
  }, [status]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    requestIdRef.current += 1; // invalidate any in-flight request
    setStatus("idle");
    setStudySet(null);
    setErrorMessage(null);
    setInput("");
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Study Assistant</h1>
        <p>Paste your notes, or just name a topic. Get flashcards and a quiz.</p>
      </header>

      <main className="app-main">
        {status === "success" && studySet ? (
          <ResultsView studySet={studySet} onStartOver={reset} />
        ) : (
          <InputScreen
            input={input}
            onInputChange={setInput}
            onSubmit={submit}
            status={status}
            errorMessage={errorMessage}
          />
        )}
      </main>
    </div>
  );
}
