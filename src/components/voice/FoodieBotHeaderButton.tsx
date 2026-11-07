// src/components/voice/FoodieBotHeaderButton.tsx
import React from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { useVoiceCopilot } from '../../context/VoiceCopilotContext';

interface FoodieBotHeaderButtonProps {
  className?: string;
}

export const FoodieBotHeaderButton: React.FC<FoodieBotHeaderButtonProps> = ({ className = '' }) => {
  const copilot = useVoiceCopilot();
  const isOpen = copilot?.isOpen ?? false;

  return (
    <button
      type="button"
      onClick={() => copilot?.toggleOpen()}
      className={`relative p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center btn-press group ${
        isOpen
          ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/30 ring-2 ring-purple-400/40'
          : 'text-slate-500 hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40'
      } ${className}`}
      title="Foodie Bot (Asistente de Voz IA)"
      aria-label="Foodie Bot (Asistente de Voz IA)"
      aria-expanded={isOpen}
    >
      <div className="relative flex items-center justify-center">
        <Bot className="w-5 h-5 transition-transform group-hover:scale-110" />
        
        {/* Subtle decorative sparkle indicator */}
        <Sparkles 
          className={`w-2.5 h-2.5 absolute -top-1 -right-1.5 transition-opacity ${
            isOpen ? 'text-amber-300 opacity-100 animate-pulse' : 'text-purple-500 opacity-0 group-hover:opacity-100'
          }`} 
        />
      </div>

      {/* Mode Badge indicator if open */}
      {isOpen && copilot?.mode && (
        <span className="sr-only">Foodie Bot Activo</span>
      )}
    </button>
  );
};

export default FoodieBotHeaderButton;
