// src/config/firebaseConfig.ts
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../firebase';

export interface FirebaseAppConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export const STORAGE_FIREBASE_CONFIG_KEY = 'foodie_firebase_config';

export const DEFAULT_FIREBASE_CONFIG: FirebaseAppConfig = {
  apiKey: "AIzaSyAD69zAkMd0m_BKGFRGgjMTvEGBV20dYho",
  authDomain: "foodiepos360.firebaseapp.com",
  projectId: "foodiepos360",
  storageBucket: "foodiepos360.firebasestorage.app",
  messagingSenderId: "667508544399",
  appId: "1:667508544399:web:c7d0135569380435bfb1fa"
};

/**
 * Retrieves the active Firebase configuration with hierarchical precedence:
 * 1. LocalStorage override ('foodie_firebase_config')
 * 2. Vite environment variables (VITE_FIREBASE_*)
 * 3. Default fallback configuration
 */
export function getFirebaseConfig(): FirebaseAppConfig {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_FIREBASE_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.projectId && parsed.apiKey) {
          return { ...DEFAULT_FIREBASE_CONFIG, ...parsed };
        }
      }
    } catch (e) {
      console.warn('[FirebaseConfig] Failed to parse custom config from localStorage:', e);
    }
  }

  return {
    apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey,
    authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
    projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId,
    storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket,
    messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
    appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId
  };
}

/**
 * Saves custom Firebase credentials to localStorage.
 */
export function saveFirebaseConfig(config: Partial<FirebaseAppConfig>): void {
  if (typeof window === 'undefined') return;
  const current = getFirebaseConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(STORAGE_FIREBASE_CONFIG_KEY, JSON.stringify(updated));
}

/**
 * Resets Firebase config back to environment/default settings.
 */
export function resetFirebaseConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_FIREBASE_CONFIG_KEY);
}

export interface FirestoreHealthResult {
  ok: boolean;
  projectId: string;
  latencyMs: number;
  message: string;
  errorCode?: string;
  errorDetails?: string;
}

/**
 * Performs a real health-check ping against Cloud Firestore.
 */
export async function checkFirestoreHealth(): Promise<FirestoreHealthResult> {
  const config = getFirebaseConfig();
  const startTime = Date.now();

  try {
    const healthDocRef = doc(firestore, '_health_check', 'ping');
    
    // Add 4-second timeout to avoid hanging indefinitely if network/cloud rejects
    const fetchPromise = getDoc(healthDocRef);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), 4000);
    });

    await Promise.race([fetchPromise, timeoutPromise]);
    const latencyMs = Date.now() - startTime;

    return {
      ok: true,
      projectId: config.projectId,
      latencyMs,
      message: `Conexión con Firestore exitosa (${latencyMs}ms). Base de datos activa en proyecto "${config.projectId}".`
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const msg = String(err?.message || err || '');
    const code = String(err?.code || '');

    console.warn('[FirestoreHealthCheck] Ping failed:', err);

    if (msg.includes('TIMEOUT')) {
      return {
        ok: false,
        projectId: config.projectId,
        latencyMs,
        errorCode: 'TIMEOUT',
        message: `Tiempo de espera agotado al conectar con Firestore (proyecto: "${config.projectId}"). Verifica tu conexión o que la base de datos esté creada.`
      };
    }

    if (msg.includes('5 NOT_FOUND') || code.includes('not-found') || msg.includes('NOT_FOUND')) {
      return {
        ok: false,
        projectId: config.projectId,
        latencyMs,
        errorCode: 'NOT_FOUND',
        message: `Base de datos no encontrada en Google Cloud (5 NOT_FOUND). Asegúrate de crear la base de datos Firestore en https://console.firebase.google.com/project/${config.projectId}/firestore.`
      };
    }

    if (msg.includes('permission-denied') || code.includes('permission-denied') || msg.includes('PERMISSION_DENIED')) {
      return {
        ok: false,
        projectId: config.projectId,
        latencyMs,
        errorCode: 'PERMISSION_DENIED',
        message: `Permisos insuficientes en Firestore (PERMISSION_DENIED). Configura las reglas de seguridad en la consola de Firebase para permitir lectura y escritura.`
      };
    }

    return {
      ok: false,
      projectId: config.projectId,
      latencyMs,
      errorCode: code || 'UNKNOWN_ERROR',
      message: `Error al conectar con Firestore: ${msg}`
    };
  }
}
