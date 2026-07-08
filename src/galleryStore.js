// In-memory store for finished pages submitted to the class gallery. Every
// function here is async even though the in-memory implementation has
// nothing to actually await — that way every caller already treats this as
// a network-backed store, so swapping the internals for a real external
// store later (Redis, Postgres, etc.) only touches this one file.
const submissions = new Map(); // keyed by sessionId — one entry per student, resubmitting overwrites

export async function addSubmission(sessionId, { studentName, html }) {
  const entry = {
    id: sessionId,
    studentName,
    html,
    submittedAt: new Date().toISOString()
  };
  submissions.set(sessionId, entry);
  return entry;
}

export async function listSubmissions() {
  return Array.from(submissions.values()).sort(
    (a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)
  );
}
