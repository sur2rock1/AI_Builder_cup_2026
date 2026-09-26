// ─────────────────────────────────────────────────────────────────
// File-backed learner repository. Used in tests and local dev when
// USE_FIRESTORE_LEARNERS is not set. NOT viable on Cloud Run (ephemeral
// disk) — see docs/PROJECT_STATE.md technical debt, now fixed by making
// Firestore the default in production (src/adaptive/repo/index.ts).
// ─────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import { LearnerProfile, LearningEvidence } from '../learnerModel';
import { EventFilter, LearnerRepository } from './types';

function dataDir() {
  return process.env.LEARNER_DATA_DIR || path.join(process.cwd(), 'data');
}
function profilesFile() {
  return path.join(dataDir(), 'learner-profiles.json');
}
function eventsFile(studentId: string) {
  return path.join(dataDir(), 'events', `${studentId}.json`);
}
function plansFile(studentId: string) {
  return path.join(dataDir(), 'plans', `${studentId}.json`);
}
function sessionsFile(studentId: string) {
  return path.join(dataDir(), 'sessions', `${studentId}.json`);
}

function ensureDir(p: string) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function readJson<T>(file: string, fallback: T): T {
  ensureDir(file);
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; }
}
function writeJson(file: string, data: unknown) {
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

// Bug found 2026-09-25 while seeding demo learners: learner-profiles.json
// had somehow ended up as `[]` (an array, not `{}`). readJson<Record<...>>
// returned it as-is with no shape check; saveProfile then did
// `all[studentId] = profile` — legal on an array (arrays are objects in
// JS, this just sets a non-index property) — and writeJson's
// JSON.stringify(array) silently drops any non-index property. Net
// effect: every saveProfile() call APPEARED to succeed (no thrown error,
// no rejected promise) while writing `[]` back to disk every time —
// permanently discarding every learner profile created locally, and
// making listLearners()/GET /api/learners always return an empty list.
// The existing smoke test never caught this because it always starts
// from a fresh tmp dir where the file has never been anything but a
// proper object. This helper makes an empty/missing profiles file safe
// (treated as `{}`) but refuses to silently swallow a genuinely
// non-empty array, since that would indicate real (if wrongly-shaped)
// data that must not be thrown away without someone looking at it.
function readProfiles(): Record<string, LearnerProfile> {
  const raw = readJson<unknown>(profilesFile(), {});
  if (Array.isArray(raw)) {
    if (raw.length > 0) {
      throw new Error(
        `learner-profiles.json is a non-empty array (${raw.length} items) — expected an object ` +
        'keyed by studentId. Refusing to treat it as empty and silently discard it on the next ' +
        'write; back up and inspect the file by hand before continuing.',
      );
    }
    return {};
  }
  if (typeof raw !== 'object' || raw === null) return {};
  return raw as Record<string, LearnerProfile>;
}

export class FileLearnerRepository implements LearnerRepository {
  async getProfile(studentId: string): Promise<LearnerProfile | null> {
    const all = readProfiles();
    return all[studentId] || null;
  }

  async saveProfile(profile: LearnerProfile): Promise<void> {
    const all = readProfiles();
    all[profile.studentId] = profile;
    writeJson(profilesFile(), all);
  }

  async listProfiles(): Promise<LearnerProfile[]> {
    const all = readProfiles();
    return Object.values(all);
  }

  async deleteProfile(studentId: string): Promise<void> {
    const all = readProfiles();
    delete all[studentId];
    writeJson(profilesFile(), all);
    for (const f of [eventsFile(studentId), plansFile(studentId), sessionsFile(studentId)]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  }

  async appendEvent(studentId: string, event: LearningEvidence & { eventId: string }): Promise<void> {
    const events = readJson<(LearningEvidence & { eventId: string })[]>(eventsFile(studentId), []);
    events.push(event);
    writeJson(eventsFile(studentId), events);
  }

  async listEvents(studentId: string, filter: EventFilter = {}): Promise<(LearningEvidence & { eventId: string })[]> {
    let events = readJson<(LearningEvidence & { eventId: string })[]>(eventsFile(studentId), []);
    if (filter.conceptId) events = events.filter((e) => e.conceptId === filter.conceptId);
    if (filter.limit) events = events.slice(-filter.limit);
    return events;
  }

  async savePlan(studentId: string, planVersion: string, plan: unknown): Promise<void> {
    const plans = readJson<Record<string, unknown>>(plansFile(studentId), {});
    plans[planVersion] = plan;
    writeJson(plansFile(studentId), plans);
  }

  async getLatestPlan(studentId: string, subjectId: string): Promise<{ planVersion: string; plan: unknown } | null> {
    const plans = readJson<Record<string, unknown>>(plansFile(studentId), {});
    const versions = Object.keys(plans)
      .filter((v) => v.startsWith(`${studentId}:${subjectId}:`))
      .sort((a, b) => Number(a.split(':').pop()) - Number(b.split(':').pop()));
    if (versions.length === 0) return null;
    const planVersion = versions[versions.length - 1];
    return { planVersion, plan: plans[planVersion] };
  }

  async saveSessionSummary(studentId: string, sessionId: string, summary: unknown): Promise<void> {
    const sessions = readJson<Record<string, unknown>>(sessionsFile(studentId), {});
    sessions[sessionId] = summary;
    writeJson(sessionsFile(studentId), sessions);
  }
}
