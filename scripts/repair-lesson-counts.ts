// One-off repair: lessons and minutes per subject were never counted (incrementSessionCount had no caller until 2026-10-17).
// Recomputes sessionCount / totalMinutes / lastSession from the stored session summaries. Safe to run again.
//   npx tsx scripts/repair-lesson-counts.ts
import { getRepo } from '../src/adaptive/repo/index.ts';
const repo = getRepo();
for (const p of await repo.listProfiles()) {
  let changed = false;
  for (const [sid, sub] of Object.entries(p.subjects || {})) {
    const lessons = (p.sessionSummaries || []).filter((s) => (s.conceptsTouched || []).some((c) => c.startsWith(sid)));
    if (!lessons.length) continue;
    const mins = lessons.reduce((n, s) => n + (s.minutes ?? Math.max(1, Math.round(((s.endedAt || 0) - (s.startedAt || 0)) / 60000))), 0);
    const last = Math.max(...lessons.map((s) => s.endedAt || 0));
    if (sub.sessionCount < lessons.length || sub.totalMinutes < mins || (sub.lastSession || 0) < last) {
      console.log(`${p.name} / ${sub.subjectLabel}: lessons ${sub.sessionCount} -> ${Math.max(sub.sessionCount, lessons.length)}, minutes ${sub.totalMinutes} -> ${Math.max(sub.totalMinutes, mins)}`);
      sub.sessionCount = Math.max(sub.sessionCount, lessons.length);
      sub.totalMinutes = Math.max(sub.totalMinutes, mins);
      sub.lastSession = Math.max(sub.lastSession || 0, last);
      changed = true;
    }
  }
  if (changed) await repo.saveProfile(p);
}
