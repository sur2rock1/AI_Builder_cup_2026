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

export class FileLearnerRepository implements LearnerRepository {
  async getProfile(studentId: string): Promise<LearnerProfile | null> {
    const all = readJson<Record<string, LearnerProfile>>(profilesFile(), {});
    return all[studentId] || null;
  }

  async saveProfile(profile: LearnerProfile): Promise<void> {
    const all = readJson<Record<string, LearnerProfile>>(profilesFile(), {});
    all[profile.studentId] = profile;
    writeJson(profilesFile(), all);
  }

  async listProfiles(): Promise<LearnerProfile[]> {
    const all = readJson<Record<string, LearnerProfile>>(profilesFile(), {});
    return Object.values(all);
  }

  async deleteProfile(studentId: string): Promise<void> {
    const all = readJson<Record<string, LearnerProfile>>(profilesFile(), {});
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
