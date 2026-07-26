// Local-only persistence for saved study sessions, plus a lightweight
// Leitner-box spaced-repetition schedule for flashcards within each
// session. Nothing here talks to the backend — it's browser storage only,
// so sessions are per-device/per-browser, which is an acceptable trade-off
// for this project (see README limitations).

const STORAGE_KEY = "study-assistant:sessions:v1";
const MAX_SESSIONS = 30;

// Leitner boxes 0-4. Box 0 = "still learning" / never reviewed -> due
// immediately. Each "Got it" review advances a box (longer gap before it's
// due again); any "Still learning" answer drops the card back to box 0.
const BOX_INTERVALS_MS = [
  0, // box 0: due immediately
  1000 * 60 * 60 * 24, // box 1: 1 day
  1000 * 60 * 60 * 24 * 3, // box 2: 3 days
  1000 * 60 * 60 * 24 * 7, // box 3: 7 days
  1000 * 60 * 60 * 24 * 14, // box 4: 14 days (max)
];

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupted value (manual edit, old schema, etc.) shouldn't crash the
    // app — treat it as "no saved sessions" rather than throwing.
    return [];
  }
}

function writeAll(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Quota exceeded or storage disabled (private browsing) — fail
    // silently. Sessions just won't persist this time; nothing to crash.
  }
}

function makeId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function initialSchedule(studySet) {
  const schedule = {};
  const now = Date.now();
  for (const card of studySet.flashcards) {
    schedule[card.id] = { box: 0, dueAt: now };
  }
  return schedule;
}

export function listSessions() {
  return readAll()
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id) {
  return readAll().find((s) => s.id === id) || null;
}

// Creates and persists a new session from a freshly generated study set.
export function createSession(studySet) {
  const now = Date.now();
  const session = {
    id: makeId(),
    topic: studySet.topic,
    studySet,
    schedule: initialSchedule(studySet),
    createdAt: now,
    updatedAt: now,
  };
  writeAll([session, ...readAll()].slice(0, MAX_SESSIONS));
  return session;
}

// After a refine, the study set's content changes (cards added/edited) —
// swap it in and extend the schedule for any new card ids, leaving
// existing cards' review progress untouched.
export function updateSessionStudySet(id, studySet) {
  const sessions = readAll();
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  const now = Date.now();
  const schedule = { ...(sessions[idx].schedule || {}) };
  for (const card of studySet.flashcards) {
    if (!schedule[card.id]) schedule[card.id] = { box: 0, dueAt: now };
  }

  const updated = { ...sessions[idx], studySet, topic: studySet.topic, schedule, updatedAt: now };
  sessions[idx] = updated;
  writeAll(sessions);
  return updated;
}

export function deleteSession(id) {
  writeAll(readAll().filter((s) => s.id !== id));
}

// Call after the user marks a flashcard known/unknown. "Got it" advances a
// box (longer interval before it's due again); "Still learning" resets to
// box 0. Persists the updated schedule and returns the new session state.
export function recordCardReview(sessionId, cardId, known) {
  const sessions = readAll();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return null;

  const schedule = { ...(sessions[idx].schedule || {}) };
  const prev = schedule[cardId] || { box: 0, dueAt: Date.now() };
  const nextBox = known ? Math.min(prev.box + 1, BOX_INTERVALS_MS.length - 1) : 0;
  schedule[cardId] = { box: nextBox, dueAt: Date.now() + BOX_INTERVALS_MS[nextBox] };

  const updated = { ...sessions[idx], schedule, updatedAt: Date.now() };
  sessions[idx] = updated;
  writeAll(sessions);
  return updated;
}

// Reorders flashcards so overdue / never-reviewed / struggling cards come
// first. Within a single fresh session everything is due "now" so this is
// a no-op visually — it matters when you reopen a saved session later and
// want to see what actually needs review first.
export function orderCardsBySchedule(studySet, schedule) {
  return [...studySet.flashcards].sort((a, b) => {
    const da = schedule?.[a.id]?.dueAt ?? 0;
    const db = schedule?.[b.id]?.dueAt ?? 0;
    return da - db;
  });
}

export function dueCardCount(studySet, schedule) {
  const now = Date.now();
  return studySet.flashcards.filter((c) => (schedule?.[c.id]?.dueAt ?? 0) <= now).length;
}

export function boxLabel(box) {
  const labels = ["New", "1 day", "3 days", "1 week", "2 weeks"];
  return labels[box] ?? "New";
}

export function formatRelativeTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
