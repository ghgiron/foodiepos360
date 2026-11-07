// src/services/aiProviderService.ts
import { GoogleGenAI } from '@google/genai';
import { 
  getGeminiApiKey, 
  getGroqApiKey, 
  hasGeminiApiKey, 
  hasGroqApiKey, 
  getActiveAIProvider 
} from '../utils/geminiConfig';
import { 
  buildSystemInstruction, 
  cleanJsonOutput, 
  sanitizeExtraction 
} from './geminiCopilotService';
import type { 
  VoiceIngredientExtraction, 
  CopilotContextData, 
  CopilotMessage 
} from '../types/voiceCopilot';
import { safeParseJson, testGroqApiKey as groqServiceTestGroqApiKey } from './groqCopilotService';

export const TIMEOUT_MS = 15000; // 15s maximum timeout

export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODELS_ENDPOINT = 'https://api.groq.com/openai/v1/models';
export const GROQ_CANDIDATE_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant'
];

export const GEMINI_CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest'
];

/**
 * Executes a promise-generating factory within an AbortController timeout of max 10s.
 * Throws a clean 'TIMEOUT_EXCEEDED' error if the operation exceeds the deadline.
 */
export async function runWithAbortTimeout<T>(
  promiseFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  let timer: any = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new Error('TIMEOUT_EXCEEDED'));
      const err = new Error('TIMEOUT_EXCEEDED');
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);
  });

  try {
    const operationPromise = promiseFactory(controller.signal);
    const result = await Promise.race([operationPromise, timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (err: any) {
    clearTimeout(timer);
    if (
      controller.signal.aborted || 
      err?.name === 'AbortError' || 
      err?.name === 'TimeoutError' || 
      err?.message === 'TIMEOUT_EXCEEDED' || 
      String(err).includes('aborted')
    ) {
      const timeoutError = new Error('TIMEOUT_EXCEEDED');
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw err;
  }
}

/**
 * Builds standard conversation prompt with recent history and form context.
 */
export function formatConversationPrompt(
  userPrompt: string,
  context: CopilotContextData,
  chatHistory: CopilotMessage[] = []
): string {
  const isDirectEntry = /\b(\d+|\$|compr[éeó]|kilos?|litros?|gramos?|unidades?|botellas?|paquetes?|pesos|cost[óo])\b/i.test(userPrompt);
  const maxHistoryTurns = isDirectEntry ? -2 : -4;

  const previousTurns = chatHistory
    .filter(m => m.sender === 'user' || m.sender === 'assistant')
    .slice(maxHistoryTurns)
    .map(m => `${m.sender === 'user' ? 'Usuario' : 'Copiloto'}: ${m.text}`)
    .join('\n');

  const currentFormContext = (context.currentFormState && !isDirectEntry)
    ? `\nValores actuales en formulario: ${JSON.stringify(context.currentFormState)}`
    : '';

  return `${previousTurns ? `Historial reciente:\n${previousTurns}\n\n` : ''}${currentFormContext}Mensaje del usuario: "${userPrompt}"`;
}

/**
 * Calls Google Gemini Flash models with the given prompt and abort signal.
 */
export async function callGemini(
  userPrompt: string,
  context: CopilotContextData,
  chatHistory: CopilotMessage[] = [],
  signal?: AbortSignal
): Promise<VoiceIngredientExtraction> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildSystemInstruction(context);
  const fullPrompt = formatConversationPrompt(userPrompt, context, chatHistory);

  let lastError: any = null;

  for (const model of GEMINI_CANDIDATE_MODELS) {
    if (signal?.aborted) {
      throw new Error('TIMEOUT_EXCEEDED');
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents: fullPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      });

      const rawText = cleanJsonOutput(response.text || '{}');
      const parsed = JSON.parse(rawText);
      return sanitizeExtraction(parsed, context, userPrompt);
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError' || err?.message === 'TIMEOUT_EXCEEDED') {
        throw new Error('TIMEOUT_EXCEEDED');
      }

      console.warn(`[Foodie Voice Copilot] Gemini model "${model}" failed:`, err?.message || err);
      lastError = err;

      const errorStr = (err?.message || String(err) || '').toUpperCase();
      if (
        errorStr.includes('API KEY NOT VALID') ||
        errorStr.includes('API_KEY_INVALID') || 
        errorStr.includes('INVALID API KEY') ||
        errorStr.includes('PERMISSION_DENIED') ||
        (errorStr.includes('INVALID_ARGUMENT') && errorStr.includes('KEY')) ||
        (err?.status === 400 && errorStr.includes('KEY')) ||
        err?.status === 401 ||
        err?.status === 403
      ) {
        throw new Error('API_KEY_INVALID');
      }

      // If quota exceeded, break to allow fallback immediately
      if (errorStr.includes('QUOTA') || errorStr.includes('RESOURCE_EXHAUSTED') || err?.status === 429) {
        break;
      }
    }
  }

  throw lastError || new Error('MODEL_GENERATION_FAILED');
}

/**
 * Calls Groq Cloud (Llama 3.3 / Llama 3.1) with structured JSON response and abort signal.
 */
export async function callGroq(
  userPrompt: string,
  context: CopilotContextData,
  chatHistory: CopilotMessage[] = [],
  signal?: AbortSignal
): Promise<VoiceIngredientExtraction> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const systemInstruction = buildSystemInstruction(context);
  const fullPrompt = formatConversationPrompt(userPrompt, context, chatHistory);

  let lastError: any = null;

  for (const model of GROQ_CANDIDATE_MODELS) {
    if (signal?.aborted) {
      throw new Error('TIMEOUT_EXCEEDED');
    }

    try {
      const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${fullPrompt}\n\nResponde estrictamente en formato JSON.` }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 2048
        }),
        signal
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('GROQ_KEY_INVALID');
        }
        if (response.status === 429) {
          console.warn(`[Groq Cloud] Model ${model} rate-limited (429)`);
          lastError = new Error('GROQ_QUOTA_EXCEEDED');
          continue;
        }
        const errText = await response.text();
        throw new Error(`Groq HTTP ${response.status}: ${errText}`);
      }

      const json = await response.json();
      const rawText = json?.choices?.[0]?.message?.content || '{}';
      const parsed = safeParseJson(rawText);
      return sanitizeExtraction(parsed, context, userPrompt);
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError' || err?.message === 'TIMEOUT_EXCEEDED') {
        throw new Error('TIMEOUT_EXCEEDED');
      }

      console.warn(`[Foodie Voice Copilot] Groq model "${model}" failed:`, err?.message || err);
      lastError = err;
      if (err?.message === 'GROQ_KEY_INVALID') {
        throw err;
      }
    }
  }

  throw lastError || new Error('GROQ_GENERATION_FAILED');
}

/**
 * Unified multi-provider Copilot orchestrator with:
 * 1. 10s AbortController timeout.
 * 2. Provider selection ('auto' | 'gemini' | 'groq').
 * 3. Automatic failover: if Gemini fails with 429/network, attempts Groq (and vice-versa).
 */
export async function processAiCopilotPrompt(
  userPrompt: string,
  context: CopilotContextData,
  chatHistory: CopilotMessage[] = []
): Promise<VoiceIngredientExtraction> {
  const provider = getActiveAIProvider();
  const hasGemini = hasGeminiApiKey();
  const hasGroq = hasGroqApiKey();

  if (!hasGemini && !hasGroq) {
    throw new Error('NO_API_KEY');
  }

  // Helper to determine if an error qualifies for automatic failover
  const isRecoverableError = (err: any) => {
    const msg = String(err?.message || err?.detail || err || '').toUpperCase();
    return (
      msg.includes('QUOTA') || 
      msg.includes('429') || 
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('FETCH') ||
      msg.includes('NETWORK') ||
      msg.includes('FAILED TO FETCH') ||
      msg.includes('MODEL_GENERATION_FAILED') ||
      msg.includes('GROQ_GENERATION_FAILED') ||
      msg.includes('503') ||
      msg.includes('500') ||
      msg.includes('400') ||
      msg.includes('OVERLOADED')
    );
  };

  // Execution with 10s maximum timeout wrapped in AbortController
  return runWithAbortTimeout(async (signal) => {
    // 1. Groq chosen explicitly
    if (provider === 'groq') {
      try {
        return await callGroq(userPrompt, context, chatHistory, signal);
      } catch (err: any) {
        if (err?.message === 'TIMEOUT_EXCEEDED' || signal.aborted) throw err;
        if (hasGemini && isRecoverableError(err)) {
          console.warn('[AI Provider] Groq failed. Failing over to Google Gemini Flash...');
          return await callGemini(userPrompt, context, chatHistory, signal);
        }
        throw err;
      }
    }

    // 2. Gemini chosen explicitly
    if (provider === 'gemini') {
      try {
        return await callGemini(userPrompt, context, chatHistory, signal);
      } catch (err: any) {
        if (err?.message === 'TIMEOUT_EXCEEDED' || signal.aborted) throw err;
        if (hasGroq && isRecoverableError(err)) {
          console.warn('[AI Provider] Gemini failed. Failing over to Groq Cloud (Llama)...');
          return await callGroq(userPrompt, context, chatHistory, signal);
        }
        throw err;
      }
    }

    // 3. 'auto' mode: Prioritize Gemini if available; failover to Groq if error occurs
    if (hasGemini) {
      try {
        return await callGemini(userPrompt, context, chatHistory, signal);
      } catch (err: any) {
        if (err?.message === 'TIMEOUT_EXCEEDED' || signal.aborted) throw err;
        if (hasGroq && isRecoverableError(err)) {
          console.warn('[AI Provider] Gemini failed in auto mode. Failing over to Groq Cloud (Llama)...');
          return await callGroq(userPrompt, context, chatHistory, signal);
        }
        throw err;
      }
    }

    // 4. Auto mode without Gemini key: use Groq directly
    return await callGroq(userPrompt, context, chatHistory, signal);
  }, TIMEOUT_MS);
}

/**
 * Tests an API Key against Groq Cloud by executing a real minimal ping against active models.
 * Delegates to groqCopilotService for unified multi-candidate fallback.
 */
export async function testGroqApiKey(key: string): Promise<{ success: boolean; message: string; details?: any; activeModel?: string }> {
  return await groqServiceTestGroqApiKey(key);
}
