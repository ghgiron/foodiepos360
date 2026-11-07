import React from 'react';

interface SplashScreenProps {
  error: string | null;
  onReset: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ error, onReset }) => {
  return (
    <div className="fixed inset-0 z-[9999] flex h-screen w-screen items-center justify-center bg-canvas text-[#FAFAFF] font-sans">
      {error ? (
        <div className="flex flex-col items-center justify-center text-center p-8 max-w-md bg-surface border border-rose-500/30 rounded-2xl shadow-2xl shadow-rose-950/20 animate-fade-in space-y-4 m-4">
          <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-500 mb-2 border border-rose-500/20">
            <span className="material-symbols-outlined text-4xl font-bold">database_off</span>
          </div>
          
          <h2 className="text-xl font-black text-rose-400 tracking-wider uppercase">Fallo de Inicialización</h2>
          
          <p className="text-[#C5C9DB] text-xs font-semibold leading-relaxed">
            No se pudo cargar o validar el esquema de la base de datos local IndexedDB. 
            Esto puede deberse a cambios recientes en la estructura de tablas.
          </p>

          <div className="p-4 bg-black/40 rounded-xl w-full border border-white/5 text-left max-h-40 overflow-y-auto">
            <p className="text-[11px] font-mono text-rose-300 break-all">{error}</p>
          </div>

          <div className="w-full pt-2">
            <button
              type="button"
              onClick={onReset}
              className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-6 py-3 rounded-xl shadow-lg shadow-rose-600/20 active:scale-[0.98] transition-all cursor-pointer border-none"
            >
              <span className="material-symbols-outlined text-sm font-bold">delete_forever</span>
              Limpiar Caché y Recargar
            </button>
            <p className="text-[10px] text-[#7F849E] font-medium mt-2">
              Esto borrará la base de datos IndexedDB corrupta y volverá a semillarla desde cero.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 text-center animate-fade-in">
          {/* Loading Logo */}
          <div className="w-20 h-20 bg-[#8F63F4] rounded-3xl flex items-center justify-center text-white font-black text-4xl shadow-xl shadow-purple-500/20 relative animate-pulse">
            <span className="material-symbols-outlined text-3xl font-bold">restaurant</span>
            <div className="absolute inset-0 rounded-3xl border-2 border-[#8F63F4] animate-ping opacity-30"></div>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-widest text-[#FAFAFF] uppercase">INICIALIZANDO FOODIE POS 360</h2>
            <p className="text-[#7F849E] text-xs font-bold uppercase tracking-widest animate-pulse">
              Cargando fuente de datos IndexedDB y verificando esquema...
            </p>
          </div>

          {/* Spinner */}
          <div className="w-12 h-12 relative flex items-center justify-center mt-2">
            <span className="material-symbols-outlined text-4xl animate-spin text-[#8F63F4]">sync</span>
          </div>
        </div>
      )}
    </div>
  );
};
