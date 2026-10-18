// A learner repository for tests: stores in the local file repo, but checks every write with Google's own
// Firestore validator after the same cleaning the Firestore repository applies (src/adaptive/repo/firestore.ts).
import { Firestore } from '@google-cloud/firestore';

export async function installValidatingRepo() {
  const { FileLearnerRepository } = await import('../../src/adaptive/repo/file.ts');
  const { setRepoForTests } = await import('../../src/adaptive/repo/index.ts');
  const { toFirestoreData } = await import('../../src/adaptive/repo/firestore.ts');
  const validator = new Firestore({ projectId: 'validate-only' });
  const failures = [];
  let checked = 0;
  const validate = (kind, data) => {
    checked++;
    try { validator.batch().set(validator.collection('v').doc('v'), toFirestoreData(data)); }
    catch (e) { failures.push(`${kind}: ${String(e.message).split('\n')[0].slice(0, 200)}`); }
    const bytes = Buffer.byteLength(JSON.stringify(toFirestoreData(data)));
    if (bytes > 1_000_000) failures.push(`${kind}: document is ${bytes} bytes (Firestore limit 1 MiB)`);
  };
  const inner = new FileLearnerRepository();
  setRepoForTests({
    getProfile: (id) => inner.getProfile(id),
    listProfiles: () => inner.listProfiles(),
    deleteProfile: (id) => inner.deleteProfile(id),
    listEvents: (id, f) => inner.listEvents(id, f),
    getLatestPlan: (id, s) => inner.getLatestPlan(id, s),
    listTranscripts: (id, l) => inner.listTranscripts(id, l),
    saveProfile: (p) => { validate('saveProfile', p); return inner.saveProfile(p); },
    appendEvent: (id, e) => { validate('appendEvent', e); return inner.appendEvent(id, e); },
    savePlan: (id, v, p) => { validate('savePlan', p); return inner.savePlan(id, v, p); },
    saveSessionSummary: (id, s, x) => { validate('saveSessionSummary', x); return inner.saveSessionSummary(id, s, x); },
    saveTranscript: (id, s, x) => { validate('saveTranscript', x); return inner.saveTranscript(id, s, x); },
  });
  return { inner, failures, get checked() { return checked; } };
}
