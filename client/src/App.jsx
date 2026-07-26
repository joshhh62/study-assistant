import { useRef, useState, useCallback } from "react";
import { generateStudySet, refineStudySet, ApiError } from "./api";
import * as storage from "./storage";
import InputScreen from "./components/InputScreen";
import ResultsView from "./components/ResultsView";
import "./App.css";

export default function App() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [session, setSession] = useState(null); // { id, topic, studySet, schedule, createdAt, updatedAt }
  const [errorMessage, setErrorMessage] = useState(null);
  const [sessions, setSessions] = useState(() => storage.listSessions());

  // Refine has its own, separate request state from the main generate flow
  // on purpose: a refine that's loading or fails should never blank out or
  // replace the study set the user already has on screen.
  const [refineStatus, setRefineStatus] = useState("idle"); // idle | loading | error
  const [refineError, setRefineError] = useState(null);

  // Guards against a stale response overwriting a newer one. Every submit
  // gets an incrementing id; a response is only applied if it's still the
  // most recent request. Paired with AbortController so the superseded
  // network request (and backend work) is actually cancelled, not just
  // ignored client-side. Separate ids/controllers for generate vs refine
  // since they can be in flight independently.
  const requestIdRef = useRef(0);
  const abortRef = useRef(null);
  const refineRequestIdRef = useRef(0);
  const refineAbortRef = useRef(null);

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
      const newSession = storage.createSession(data);
      setSession(newSession);
      setSessions(storage.listSessions());
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
    refineAbortRef.current?.abort();
    requestIdRef.current += 1; // invalidate any in-flight request
    refineRequestIdRef.current += 1;
    setStatus("idle");
    setSession(null);
    setErrorMessage(null);
    setRefineStatus("idle");
    setRefineError(null);
    setInput("");
  }, []);

  const openSession = useCallback((id) => {
    const s = storage.getSession(id);
    if (!s) return;
    setSession(s);
    setStatus("success");
    setErrorMessage(null);
    setRefineStatus("idle");
    setRefineError(null);
  }, []);

  const removeSession = useCallback((id) => {
    storage.deleteSession(id);
    setSessions(storage.listSessions());
  }, []);

  const handleRefine = useCallback(
    async (instruction) => {
      if (!session || refineStatus === "loading") return;

      refineAbortRef.current?.abort();
      const controller = new AbortController();
      refineAbortRef.current = controller;
      const requestId = ++refineRequestIdRef.current;

      setRefineStatus("loading");
      setRefineError(null);

      try {
        const data = await refineStudySet(session.studySet, instruction, { signal: controller.signal });
        if (requestId !== refineRequestIdRef.current) return;
        const updated = storage.updateSessionStudySet(session.id, data);
        setSession(updated);
        setSessions(storage.listSessions());
        setRefineStatus("idle");
      } catch (err) {
        if (err.name === "AbortError") return;
        if (requestId !== refineRequestIdRef.current) return;
        const message = err instanceof ApiError ? err.message : "Something unexpected happened. Try again.";
        setRefineError(message);
        setRefineStatus("error");
      }
    },
    [session, refineStatus]
  );

  // Persists a flashcard review to the spaced-repetition schedule (see
  // storage.js) and refreshes both the active session and the sessions
  // list (so "N due" badges in history stay accurate).
  const handleCardReview = useCallback(
    (cardId, known) => {
      if (!session) return;
      const updated = storage.recordCardReview(session.id, cardId, known);
      if (updated) {
        setSession(updated);
        setSessions(storage.listSessions());
      }
    },
    [session]
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Study Assistant</h1>
        <p>Paste your notes, or just name a topic. Get flashcards and a quiz.</p>
      </header>

      <main className="app-main">
        {status === "success" && session ? (
          <ResultsView
            session={session}
            onStartOver={reset}
            onRefine={handleRefine}
            refineStatus={refineStatus}
            refineError={refineError}
            onCardReview={handleCardReview}
          />
        ) : (
          <InputScreen
            input={input}
            onInputChange={setInput}
            onSubmit={submit}
            status={status}
            errorMessage={errorMessage}
            sessions={sessions}
            onOpenSession={openSession}
            onDeleteSession={removeSession}
          />
        )}
      </main>
    </div>
  );
}
