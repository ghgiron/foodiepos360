// src/firebase.ts
import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAD69zAkMd0m_BKGFRGgjMTvEGBV20dYho",
  authDomain: "foodiepos360.firebaseapp.com",
  projectId: "foodiepos360",
  storageBucket: "foodiepos360.firebasestorage.app",
  messagingSenderId: "667508544399",
  appId: "1:667508544399:web:c7d0135569380435bfb1fa"
};

export const app = initializeApp(firebaseConfig);

// Initialize Firestore with persistent cache for robust offline-first functionality
export const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
