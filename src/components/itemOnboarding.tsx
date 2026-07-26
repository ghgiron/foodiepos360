// src/components/itemOnboarding.tsx
import React, { useState } from 'react';
import InventoryOnboardingForm from './inventoryOnboardingForm';
import SupplyOnboardingForm from './supplyOnboardingForm';

interface ItemOnboardingProps {
  onBack: () => void;
  editItemId?: string | null;
  editItemType?: string | null;
}

type OnboardingType = 'PRODUCT' | 'INGREDIENT' | 'PACKAGING' | 'ASSET' | null;

const ItemOnboarding = React.memo(function ItemOnboarding({ onBack, editItemId, editItemType }: ItemOnboardingProps) {
  const [activeForm, setActiveForm] = useState<OnboardingType>(
    (editItemType as OnboardingType) || null
  );

  const handleSelectCard = (type: OnboardingType) => {
    setActiveForm(type);
  };

  return (
    <div className="p-8 space-y-8 transition-receitly font-sans text-slate-800 dark:text-slate-200 min-h-screen text-left">
      {activeForm ? (
        activeForm === 'PACKAGING' ? (
          <SupplyOnboardingForm editItemId={editItemId} onBack={onBack} />
        ) : (
          <InventoryOnboardingForm type={activeForm} editItemId={editItemId} onBack={onBack} />
        )
      ) : (
        <div className="space-y-6">
          {/* Top navigation for Selection Screen */}
          <div className="flex flex-col gap-2 pb-4 border-b border-slate-200 dark:border-slate-850">
            <button
              onClick={onBack}
              className="text-slate-505 dark:text-slate-500 hover:text-[var(--accent-purple)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:underline cursor-pointer border-none bg-transparent self-start"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              REGRESAR AL INVENTARIO
            </button>

            <h2 className="text-xl font-headline font-black text-slate-900 dark:text-white mt-1">
              Nuevo Elemento de Inventario
            </h2>
            <p className="text-slate-500 font-semibold text-xs leading-relaxed">
              Selecciona la categoría del recurso que deseas crear:
            </p>
          </div>

          {/* Grid Selection */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Producto Unico */}
            <div
              onClick={() => handleSelectCard('PRODUCT')}
              className="group cursor-pointer bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex items-start gap-4"
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-[var(--accent-purple)]/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="w-12 h-12 shrink-0 bg-[var(--accent-purple)]/10 dark:bg-[var(--accent-purple)]/20 rounded-xl flex items-center justify-center text-[var(--accent-purple)] shadow-inner">
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>liquor</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Producto Único</h3>
                <p className="text-slate-505 dark:text-slate-400 text-xs leading-normal mt-1">
                  Artículos de venta directa que no requieren transformación (bebidas embotelladas, licores cerrados).
                </p>
              </div>
              <span className="material-symbols-outlined text-slate-400 group-hover:text-[var(--accent-purple)] self-center transition-colors">chevron_right</span>
            </div>

            {/* Card 2: Ingrediente / Insumo */}
            <div
              onClick={() => handleSelectCard('INGREDIENT')}
              className="group cursor-pointer bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex items-start gap-4"
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-teal-500/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="w-12 h-12 shrink-0 bg-teal-100 dark:bg-teal-950/45 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400 shadow-inner">
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Ingrediente</h3>
                <p className="text-slate-505 dark:text-slate-400 text-xs leading-normal mt-1">
                  Materia prima comprada por volumen o peso para formar recetas o subrecetas en cocina y barra.
                </p>
              </div>
              <span className="material-symbols-outlined text-slate-400 group-hover:text-teal-500 self-center transition-colors">chevron_right</span>
            </div>

            {/* Card 3: Suministros */}
            <div
              onClick={() => handleSelectCard('PACKAGING')}
              className="group cursor-pointer bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex items-start gap-4"
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="w-12 h-12 shrink-0 bg-purple-100 dark:bg-purple-950/45 rounded-xl flex items-center justify-center text-purple-650 dark:text-purple-400 shadow-inner">
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>package_2</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Suministro</h3>
                <p className="text-slate-505 dark:text-slate-400 text-xs leading-normal mt-1">
                  Suministros operativos no comestibles que impactan el costo del despacho a domicilio.
                </p>
              </div>
              <span className="material-symbols-outlined text-slate-400 group-hover:text-purple-650 self-center transition-colors">chevron_right</span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
});

export default ItemOnboarding;
