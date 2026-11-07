// src/hooks/useVoiceRecognition.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { isVoiceFeedbackEnabled } from '../utils/geminiConfig';

interface UseVoiceRecognitionOptions {
  onFinalTranscript?: (text: string) => void;
  lang?: string;
  silenceTimeoutMs?: number; // Configurable silence debounce (default 1600ms for fast conversational turnaround)
}

export function useVoiceRecognition({ 
  onFinalTranscript, 
  lang = 'es-ES',
  silenceTimeoutMs = 1600
}: UseVoiceRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);

  const recognitionRef = useRef<any>(null);
  const audioAnimationRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const accumulatedTranscriptRef = useRef<string>('');
  const isListeningRef = useRef<boolean>(false);
  const onFinalTranscriptRef = useRef(onFinalTranscript);

  // Keep callback ref updated
  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setSilenceCountdown(null);
  }, []);

  const dispatchFullTranscript = useCallback(() => {
    clearSilenceTimer();
    const fullText = accumulatedTranscriptRef.current.trim();
    if (fullText) {
      console.log('[useVoiceRecognition] Dispatched consolidated speech transcript:', fullText);
      setTranscript(fullText);
      setInterimTranscript('');
      accumulatedTranscriptRef.current = '';
      if (onFinalTranscriptRef.current) {
        onFinalTranscriptRef.current(fullText);
      }
    }
  }, [clearSilenceTimer]);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    // Only set timer if there's actual speech accumulated
    if (accumulatedTranscriptRef.current.trim() || isListeningRef.current) {
      silenceTimerRef.current = setTimeout(() => {
        if (accumulatedTranscriptRef.current.trim()) {
          console.log(`[useVoiceRecognition] Silence of ${silenceTimeoutMs}ms detected. Auto-submitting prompt...`);
          dispatchFullTranscript();
        }
      }, silenceTimeoutMs);
    }
  }, [clearSilenceTimer, dispatchFullTranscript, silenceTimeoutMs]);

  // Audio wave animation for UI visualizer
  const startAudioWaveSimulation = useCallback(() => {
    const animate = () => {
      // Dynamic organic wave level
      const level = Math.sin(Date.now() / 140) * 0.4 + 0.6;
      setAudioLevel(Number(level.toFixed(2)));
      audioAnimationRef.current = requestAnimationFrame(animate);
    };
    audioAnimationRef.current = requestAnimationFrame(animate);
  }, []);

  const stopAudioWaveSimulation = useCallback(() => {
    if (audioAnimationRef.current) {
      cancelAnimationFrame(audioAnimationRef.current);
      audioAnimationRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Initialize SpeechRecognition with continuous listening and pause handling
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      setError('Tu navegador no soporta reconocimiento de voz nativo (SpeechRecognition). Puedes usar el teclado para comunicarte con el Copilot.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true; // Continuous listening across pauses
    recognition.interimResults = true; // Show live provisional results
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      setError(null);
      setInterimTranscript('');
      startAudioWaveSimulation();
    };

    recognition.onresult = (event: any) => {
      let currentFinal = '';
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          currentFinal += item[0].transcript + ' ';
        } else {
          currentInterim += item[0].transcript;
        }
      }

      if (currentFinal.trim()) {
        accumulatedTranscriptRef.current = (accumulatedTranscriptRef.current + ' ' + currentFinal).trim();
        setTranscript(accumulatedTranscriptRef.current);
      }

      setInterimTranscript(currentInterim);

      // Reset the silence debounce timer whenever speech activity is received
      resetSilenceTimer();
    };

    recognition.onerror = (event: any) => {
      console.warn('[SpeechRecognition Error]', event.error);
      if (event.error === 'not-allowed') {
        setError('Permiso de micrófono denegado. Permite el acceso al micrófono en tu navegador.');
        setIsListening(false);
        isListeningRef.current = false;
        clearSilenceTimer();
        stopAudioWaveSimulation();
      } else if (event.error === 'no-speech') {
        // In continuous mode, no-speech is normal during pauses; do not treat as fatal error
      } else {
        setError(`Audio: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // If user didn't explicitly stop and we were listening, keep recognition active
      if (isListeningRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // Ignore if already active or cannot restart immediately
        }
      }
      setIsListening(false);
      isListeningRef.current = false;
      stopAudioWaveSimulation();
    };

    recognitionRef.current = recognition;

    return () => {
      clearSilenceTimer();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      stopAudioWaveSimulation();
    };
  }, [lang, startAudioWaveSimulation, stopAudioWaveSimulation, resetSilenceTimer, clearSilenceTimer]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;
    setError(null);
    setTranscript('');
    setInterimTranscript('');
    accumulatedTranscriptRef.current = '';
    clearSilenceTimer();

    // Stop speaking if assistant is currently talking
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    try {
      isListeningRef.current = true;
      recognitionRef.current.start();
    } catch (e: any) {
      console.warn('Recognition start caught error, retrying restart:', e);
      try {
        recognitionRef.current.abort();
        setTimeout(() => {
          if (isListeningRef.current) {
            recognitionRef.current?.start();
          }
        }, 150);
      } catch {}
    }
  }, [isListening, clearSilenceTimer]);

  const stopListening = useCallback((triggerDispatch: boolean = true) => {
    isListeningRef.current = false;
    clearSilenceTimer();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
    stopAudioWaveSimulation();

    if (triggerDispatch && accumulatedTranscriptRef.current.trim()) {
      dispatchFullTranscript();
    }
  }, [clearSilenceTimer, stopAudioWaveSimulation, dispatchFullTranscript]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening(true);
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Text-To-Speech function with natural voice detection
  const speakText = useCallback((text: string) => {
    if (!isVoiceFeedbackEnabled() || !window.speechSynthesis || !text) return;

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*_#`]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    utterance.rate = 1.05; // Slightly conversational pace
    utterance.pitch = 1.0;

    // Pick a natural Spanish voice if available
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => 
      v.lang.startsWith('es') && (
        v.name.includes('Google') || 
        v.name.includes('Paulina') || 
        v.name.includes('Jorge') || 
        v.name.includes('Monica') || 
        v.name.includes('Natural') ||
        v.name.includes('Sabina') ||
        v.name.includes('Helena')
      )
    );
    if (esVoice) {
      utterance.voice = esVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [lang]);

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    error,
    audioLevel,
    isSpeaking,
    silenceCountdown,
    startListening,
    stopListening,
    toggleListening,
    speakText,
    stopSpeaking,
    setTranscript,
    dispatchFullTranscript
  };
}
