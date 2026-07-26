// Minimal, dependency-free test for storage.js's pure logic (session CRUD
// + Leitner-box spaced repetition). No test framework — just a localStorage
// shim and assertions, run directly with `node`. Not exhaustive, but covers
// the parts with no fast UI feedback loop to eyeball during a demo (box
// advancement over "days", due-ordering, corrupted-storage recovery).
//
// Run: npm run test:storage  (from client/)

global.localStorage = (() => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

const {
  createSession, listSessions, getSession, updateSessionStudySet,
  deleteSession, recordCardReview, orderCardsBySchedule, dueCardCount, boxLabel,
} = await import("./storage.js");

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  passed++;
  console.log("OK:", msg);
}

const studySet = {
  topic: "Photosynthesis",
  flashcards: [
    { id: "f1", front: "Q1", back: "A1" },
    { id: "f2", front: "Q2", back: "A2" },
  ],
  quiz: [{ id: "q1", question: "?", options: ["a", "b"], correctIndex: 0, explanation: "e" }],
};

const session = createSession(studySet);
assert(session.id.startsWith("s_"), "session gets an id");
assert(listSessions().length === 1, "session shows up in list");
assert(getSession(session.id).topic === "Photosynthesis", "getSession returns it");
assert(dueCardCount(studySet, session.schedule) === 2, "both cards due on fresh session");

const afterReview1 = recordCardReview(session.id, "f1", true);
assert(afterReview1.schedule.f1.box === 1, "Got it advances box to 1");
assert(afterReview1.schedule.f1.dueAt > Date.now(), "box 1 card is due in the future");

const afterReview2 = recordCardReview(session.id, "f2", false);
assert(afterReview2.schedule.f2.box === 0, "Still learning keeps box 0");
assert(afterReview2.schedule.f2.dueAt <= Date.now() + 1, "box 0 card due ~now");

const ordered = orderCardsBySchedule(studySet, afterReview2.schedule);
assert(ordered[0].id === "f2", "struggling/due card sorts first: " + ordered.map((c) => c.id).join(","));
assert(dueCardCount(studySet, afterReview2.schedule) === 1, "only f2 due now after review");
assert(boxLabel(0) === "New" && boxLabel(1) === "1 day", "boxLabel human strings");

const refinedSet = { ...studySet, flashcards: [...studySet.flashcards, { id: "f3", front: "Q3", back: "A3" }] };
const afterRefine = updateSessionStudySet(session.id, refinedSet);
assert(afterRefine.schedule.f1.box === 1, "existing card schedule preserved through refine");
assert(afterRefine.schedule.f3.box === 0, "new card from refine starts at box 0");
assert(afterRefine.studySet.flashcards.length === 3, "refined set persisted");

localStorage.setItem("study-assistant:sessions:v1", "not json{{{");
assert(listSessions().length === 0, "corrupted storage treated as empty, no throw");

localStorage.clear();
const s2 = createSession(studySet);
deleteSession(s2.id);
assert(listSessions().length === 0, "deleteSession removes it");

console.log(`\n${passed} assertions passed.`);
