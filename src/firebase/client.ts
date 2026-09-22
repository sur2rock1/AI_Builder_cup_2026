import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getAI, getGenerativeModel, GoogleAIBackend, type AI } from 'firebase/ai';
import firebaseConfig from '../../firebase-config.json';

const config = {
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
  measurementId: firebaseConfig.measurementId,
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;
let ai: AI | undefined;

export function getFirebaseApp() {
  if (!app) app = initializeApp(config);
  return app;
}

export function getFirebaseAuth() {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

export function getFirebaseDb() {
  if (!db) db = getFirestore(getFirebaseApp());
  return db;
}

export function getFirebaseStorage() {
  if (!storage) storage = getStorage(getFirebaseApp());
  return storage;
}

/** Firebase AI Logic (Gemini Developer API via Firebase). */
export function getFirebaseAI() {
  if (!ai) {
    ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  }
  return ai;
}

export function getGeminiModel(model = 'gemini-flash-latest') {
  return getGenerativeModel(getFirebaseAI(), { model });
}

export { config as firebaseWebConfig };
