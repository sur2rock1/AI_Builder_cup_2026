/**
 * Household demo: one parent, two child logins (Maya, Ada).
 * Parent stays signed in; child Auth users are created with Admin.
 * Lumen is the tutor, not a login.   npx --yes tsx scripts/seed-auth.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { initFirebaseAdmin, admin } from '../src/firebase/admin';
import { getOrCreateLearner } from '../src/adaptive/learnerStore';
import { ensureExampleProgram } from '../src/curriculum/programStore';

const PASSWORD = 'LumenCup2026!';

const PARENT = { email: 'parent@lumen.app', name: 'Parent' };

const STUDENTS = [
  { email: 'maya@lumen.app', name: 'Maya', grade: 'Secondary 2 (Grade 8)', studentId: 'student_maya_demo' },
  { email: 'ada@lumen.app', name: 'Ada', grade: 'Primary 6 (Grade 6)', studentId: 'student_ada_demo' },
];

async function upsertUser(email: string, displayName: string) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { password: PASSWORD, emailVerified: true, displayName });
    console.log('Updated', email, user.uid);
    return user;
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') throw err;
    const user = await admin.auth().createUser({
      email, password: PASSWORD, displayName, emailVerified: true,
    });
    console.log('Created', email, user.uid);
    return user;
  }
}

async function main() {
  const app = initFirebaseAdmin();
  if (!app || !admin.apps.length) {
    throw new Error('Firebase Admin did not initialize. Check serviceAccount.json');
  }

  const parent = await upsertUser(PARENT.email, PARENT.name);
  await admin.firestore().collection('users').doc(parent.uid).set({
    email: PARENT.email,
    displayName: PARENT.name,
    role: 'parent',
    createdAt: Date.now(),
  }, { merge: true });
  console.log('  parent role →', parent.uid);

  for (const s of STUDENTS) {
    const user = await upsertUser(s.email, s.name);
    await admin.firestore().collection('users').doc(user.uid).set({
      email: s.email,
      displayName: s.name,
      role: 'learner',
      parentUid: parent.uid,
      createdAt: Date.now(),
    }, { merge: true });
    getOrCreateLearner(s.studentId, s.name, s.grade, user.uid, parent.uid, s.email);
    await admin.firestore().collection('learners').doc(s.studentId).set({
      studentId: s.studentId,
      name: s.name,
      grade: s.grade,
      email: s.email,
      ownerUid: user.uid,
      parentUid: parent.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      subjects: {},
      globalInsights: [],
    }, { merge: true });
    await ensureExampleProgram(s.studentId, s.grade);
    console.log('  learner', s.name, '→', s.studentId, 'parent', parent.uid);
  }

  console.log('\nParent creates child logins. Kids sign in themselves. Lumen is the tutor.');
  console.log(`  Parent  ${PARENT.email}  /  ${PASSWORD}`);
  for (const s of STUDENTS) {
    console.log(`  ${s.name.padEnd(6)} ${s.email}  /  ${PASSWORD}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
