// src/components/inventory/PurchaseNavHeader.tsx

export type PurchaseSectionTab = 'INVENTORY_RECEIPTS' | 'INVENTORY_ALERTS' | 'PURCHASE_ORDERS_HISTORY';

interface PurchaseNavHeaderProps {
  activeSection: PurchaseSectionTab;
  onNavigateSection?: (section: PurchaseSectionTab) => void;
  draftCount?: number;
  criticalAlertCount?: number;
}

/**
 * [US-09C] Barra de navegación y acceso rápido entre:
 * - Entradas (Compras)
 * - Alertas de Stock
 * - Histórico de Órdenes
 * 
 * Cumple con DESIGN.md: estilo píldora rounded-full, feedback activo y WCAG AAA.
 */
export default function PurchaseNavHeader({
  activeSection,
  onNavigateSection,
  draftCount = 0,
  criticalAlertCount = 0
}: PurchaseNavHeaderProps) {
  const handleNav = (tab: PurchaseSectionTab) => {
    if (onNavigateSection) {
      onNavigateSection(tab);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('foodiepos:navigate-inventory-tab', { detail: { target: tab } })
      );
    }
  };

  const navItems = [
    {
      id: 'INVENTORY_RECEIPTS' as PurchaseSectionTab,
      label: 'Entradas (Compras)',
      icon: 'receipt_long',
      badge: null
    },
    {
      id: 'INVENTORY_ALERTS' as PurchaseSectionTab,
      label: 'Alertas de Stock',
      icon: 'warning',
      badge: criticalAlertCount > 0 ? `${criticalAlertCount} críticas` : null,
      badgeColor: 'bg-red-500/15 text-red-600 border border-red-500/30'
    },
    {
      id: 'PURCHASE_ORDERS_HISTORY' as PurchaseSectionTab,
      label: 'Histórico de Órdenes',
      icon: 'history_edu',
      badge: draftCount > 0 ? `${draftCount} activas` : null,
      badgeColor: 'bg-amber-500/15 text-amber-600 border border-amber-500/30'
    }
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
      {navItems.map(item => {
        const isActive = activeSection === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleNav(item.id)}
            className={`py-2 px-4 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 border btn-press ${
              isActive
                ? 'bg-action text-action-text border-line shadow-sm font-black'
                : 'bg-surface text-content-secondary hover:text-content hover:bg-raised border-line'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {item.icon}
            </span>
            <span>{item.label}</span>
            {item.badge && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${item.badgeColor || 'bg-slate-500/10'}`}>
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

