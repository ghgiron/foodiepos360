// src/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore } from 'firebase/firestore';
import { getFirebaseConfig } from './config/firebaseConfig';

const firebaseConfig = getFirebaseConfig();

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with persistent cache for robust offline-first functionality
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  // If Firestore is already initialized in current tab, reuse existing instance
  firestoreInstance = getFirestore(app);
}

export const firestore = firestoreInstance;
