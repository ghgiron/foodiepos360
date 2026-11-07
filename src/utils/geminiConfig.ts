// src/utils/geminiConfig.ts

export const GEMINI_API_KEY_STORAGE_KEY = 'foodie_gemini_api_key';
export const GROQ_API_KEY_STORAGE_KEY = 'foodie_groq_api_key';
export const AI_PROVIDER_STORAGE_KEY = 'foodie_ai_provider';
export const VOICE_COPILOT_VOICE_STORAGE_KEY = 'foodie_copilot_voice_enabled';

export type AIProvider = 'auto' | 'gemini' | 'groq';

/**
 * Retrieves the active Gemini API Key from Vite env or localStorage.
 */
export function getGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY);
    if (localKey && localKey.trim()) return localKey.trim();
  }
  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }
  return '';
}

/**
 * Persists the user Gemini API key to localStorage.
 */
export function setGeminiApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (!key || !key.trim()) {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    } else {
      localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key.trim());
    }
  }
}

/**
 * Checks if a Gemini API key is configured.
 */
export function hasGeminiApiKey(): boolean {
  return getGeminiApiKey().length > 0;
}

/**
 * Retrieves the active Groq API Key from Vite env or localStorage.
 */
export function getGroqApiKey(): string {
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem(GROQ_API_KEY_STORAGE_KEY);
    if (localKey && localKey.trim()) return localKey.trim();
  }
  const envKey = (import.meta as any).env?.VITE_GROQ_API_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }
  return '';
}

/**
 * Persists the user Groq API key to localStorage.
 */
export function setGroqApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (!key || !key.trim()) {
      localStorage.removeItem(GROQ_API_KEY_STORAGE_KEY);
    } else {
      localStorage.setItem(GROQ_API_KEY_STORAGE_KEY, key.trim());
    }
  }
}

/**
 * Checks if a Groq API key is configured.
 */
export function hasGroqApiKey(): boolean {
  return getGroqApiKey().length > 0;
}

/**
 * Checks if at least one AI provider key is configured (Gemini or Groq).
 */
export function hasAnyAiApiKey(): boolean {
  return hasGeminiApiKey() || hasGroqApiKey();
}

/**
 * Gets the selected AI provider ('auto' | 'gemini' | 'groq').
 */
export function getActiveAIProvider(): AIProvider {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
    if (stored === 'gemini' || stored === 'groq' || stored === 'auto') {
      return stored;
    }
  }
  return 'auto';
}

/**
 * Persists the selected AI provider to localStorage.
 */
export function setActiveAIProvider(provider: AIProvider): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(AI_PROVIDER_STORAGE_KEY, provider);
  }
}

/**
 * Audio voice feedback preference.
 */
export function isVoiceFeedbackEnabled(): boolean {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(VOICE_COPILOT_VOICE_STORAGE_KEY) !== 'false';
  }
  return true;
}

export function setVoiceFeedbackEnabled(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(VOICE_COPILOT_VOICE_STORAGE_KEY, enabled ? 'true' : 'false');
  }
}
