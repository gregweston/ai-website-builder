import { Redis } from '@upstash/redis';

// Persistent store for finished pages submitted to the class gallery,
// backed by Upstash Redis — survives server restarts, redeploys, and
// free-tier spin-down, unlike the rest of this app's in-memory state.
// Redis.fromEnv() reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
const redis = Redis.fromEnv();

const SUBMISSIONS_SET_KEY = 'gallery:submissions';
const submissionKey = (sessionId) => `gallery:submission:${sessionId}`;

// Keyed by sessionId — one entry per student, resubmitting overwrites.
export async function addSubmission(sessionId, { studentName, html }) {
  const entry = {
    id: sessionId,
    studentName,
    html,
    submittedAt: new Date().toISOString()
  };
  await redis.set(submissionKey(sessionId), entry);
  await redis.sadd(SUBMISSIONS_SET_KEY, sessionId);
  return entry;
}

export async function listSubmissions() {
  const ids = await redis.smembers(SUBMISSIONS_SET_KEY);
  if (ids.length === 0) return [];

  const entries = await Promise.all(ids.map((id) => redis.get(submissionKey(id))));
  return entries
    .filter(Boolean)
    .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
}
