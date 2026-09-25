import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirebaseAuth, getFirebaseDb, getFirebaseStorage } from './client';

export type AccountRole = 'parent' | 'learner';

export async function registerWithEmail(
  email: string, password: string, displayName?: string, role: AccountRole = 'learner',
) {
  const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  if (displayName) await updateProfile(cred.user, { displayName });
  await setDoc(doc(getFirebaseDb(), 'users', cred.user.uid), {
    email,
    displayName: displayName || null,
    role,
    createdAt: serverTimestamp(),
  }, { merge: true });
  return cred.user;
}

export async function loginWithEmail(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return cred.user;
}

export async function logout() {
  await signOut(getFirebaseAuth());
}

export function watchAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

export async function getIdToken(): Promise<string | null> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/** fetch() with the signed-in Firebase ID token. */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = await getIdToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers });
}

/** Upload multimedia to the signed-in user's Storage folder. */
export async function uploadUserMedia(file: File, subpath = '') {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Must be signed in to upload media');
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const objectPath = `users/${user.uid}/media/${subpath ? subpath.replace(/\/$/, '') + '/' : ''}${Date.now()}-${safeName}`;
  const storageRef = ref(getFirebaseStorage(), objectPath);
  await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' });
  const url = await getDownloadURL(storageRef);
  return { objectPath, url };
}
