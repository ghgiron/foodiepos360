import { useState, useEffect } from 'react';
import { useTheme } from './context/ThemeContext';
import toast, { Toaster } from 'react-hot-toast';
import SalonDeck from './components/salonDeck';
import KdsDisplay from './components/kdsDisplay';
import OrderTaking from './components/orderTaking';
import InventoryAlerts from './components/inventoryAlerts';
import PurchaseOrderForm from './components/purchaseOrderForm';
import BarInventory from './components/barInventory';
import FinancialDashboard from './components/financialDashboard';
import RecipeBook from './components/recipeBook';
import OmniSearch from './components/OmniSearch';
import SettingsPanel from './components/settingsPanel';
import InventoryDashboard from './components/inventoryDashboard';
import ItemOnboarding from './components/itemOnboarding';
import InventoryItemDetail from './components/InventoryItemDetail';
import InventoryLayout from './components/inventory/InventoryLayout';
import AssetManagementList from './components/assetManagementList';
import SupplierManagementList from './components/supplierManagementList';
import ClientManagement from './components/clientManagement';
import ListaDePrecios from './components/inventory/ListaDePrecios';
import { db } from './db/localDb';
import { SplashScreen } from './components/SplashScreen';
import { seedDatabase } from './db/seedData';
import { eventBus } from './events/eventBus';
import { processOrderPaidInventory, autoMigrateBranchStock } from './db/inventoryEngine';
import { handleComandaClosure } from './services/reservationService';
import { startFirebaseSync, pullDataFromFirestore } from './services/syncService';
import { SyncStatusBadge } from './components/SyncStatusBadge';
import { VoiceCopilotProvider } from './context/VoiceCopilotContext';
import FoodieBotHeaderButton from './components/voice/FoodieBotHeaderButton';
import VoiceCopilotWidget from './components/voice/VoiceCopilotWidget';
import './App.css';

type ActiveTab =
  | 'SALON'
  | 'KDS'
  | 'ORDER'
  | 'INVENTORY_DASHBOARD'
  | 'INVENTORY_ONBOARDING'
  | 'INVENTORY_ITEM_DETAIL'
  | 'INVENTORY_ALERTS'
  | 'INVENTORY_RECEIPTS'
  | 'BAR_INVENTORY'
  | 'PRICE_LIST'
  | 'FINANCIAL_DASHBOARD'
  | 'RECIPES'
  | 'SETTINGS'
  | 'ASSET_MANAGEMENT'
  | 'SUPPLIER_MANAGEMENT'
  | 'CLIENTS';

function App() {
  const [isDbReady, setIsDbReady] = useState<boolean>(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function initialize() {
      try {
        setInitError(null);
        await db.open();
        const tables = db.tables.map(t => t.name);
        if (!tables.includes('reservas')) {
          throw new Error("Esquema desincronizado: Falta la tabla 'reservas'");
        }
        await seedDatabase();
        await autoMigrateBranchStock();
        if (isMounted) {
          setIsDbReady(true);
        }
      } catch (err: any) {
        console.error('Error al inicializar la base de datos local:', err);
        if (isMounted) {
          setInitError(err?.message || String(err) || 'Error desconocido al inicializar la base de datos.');
        }
      }
    }
    initialize();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleResetDatabase = async () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('foodiepos_db_initialized');
        localStorage.removeItem('foodiepos_seeded');
      }
      await db.delete();
      window.location.reload();
    } catch (err) {
      console.error("Fallo al borrar la base de datos local:", err);
      window.location.reload();
    }
  };

  if (!isDbReady) {
    return <SplashScreen error={initError} onReset={handleResetDatabase} />;
  }

  return (
    <VoiceCopilotProvider>
      <AppContent />
    </VoiceCopilotProvider>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('SALON');
  const [navigationOrigin, setNavigationOrigin] = useState<ActiveTab>('INVENTORY_DASHBOARD');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [opacityClass, setOpacityClass] = useState<string>('opacity-0');
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editItemType, setEditItemType] = useState<string | null>(null);
  const [viewItemId, setViewItemId] = useState<string | null>(null);

  // Search Navigation states
  const [searchNav, setSearchNav] = useState<{ id: string; view: 'detail' | 'create_recipe' | 'create_subrecipe' | null }>({
    id: '',
    view: null
  });

  // Mobile sidebar states
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Inventory sidebar menu state
  const [isInventoryMenuExpanded, setIsInventoryMenuExpanded] = useState<boolean>(false);

  // Alerts filtering state passed between Dashboard and Alerts Console
  const [alertsInitialFilter, setAlertsInitialFilter] = useState<{ level?: 'Crítico' | 'Bajo' | 'ALL'; type?: 'Stock' | 'Vencimiento' | 'Mantenimiento' | 'ALL' } | null>(null);

  // Purchase Order Draft state for transferring suggested items from alerts to receipt form
  const [purchaseOrderDraft, setPurchaseOrderDraft] = useState<{
    supplierId?: string;
    items?: any[];
  } | null>(null);

  // Sync accordion expansion with active tab
  useEffect(() => {
    if (['INVENTORY_DASHBOARD', 'INVENTORY_ONBOARDING', 'INVENTORY_ALERTS', 'INVENTORY_RECEIPTS', 'ASSET_MANAGEMENT', 'SUPPLIER_MANAGEMENT'].includes(activeTab)) {
      setIsInventoryMenuExpanded(true);
    }
  }, [activeTab]);

  // Handle global copilot navigation to onboarding forms and settings
  useEffect(() => {
    const handleCopilotNav = (e: any) => {
      if (e?.detail?.target === 'SETTINGS') {
        setSelectedTable(null);
        setActiveTab('SETTINGS');
        return;
      }
      setSelectedTable(null);
      setNavigationOrigin('INVENTORY_DASHBOARD');
      setActiveTab('INVENTORY_ONBOARDING');
      setIsInventoryMenuExpanded(true);
    };

    const handleOpenSettings = () => {
      setSelectedTable(null);
      setActiveTab('SETTINGS');
    };

    window.addEventListener('copilot-navigate', handleCopilotNav);
    window.addEventListener('open-settings', handleOpenSettings);
    return () => {
      window.removeEventListener('copilot-navigate', handleCopilotNav);
      window.removeEventListener('open-settings', handleOpenSettings);
    };
  }, []);

  // Theme states (light/dark + glass effect) from context
  const { theme, toggleTheme, glassEnabled, toggleGlass } = useTheme();

  // Start Firebase sync & auto-hydration when AppContent mounts
  useEffect(() => {
    const unsubscribeSync = startFirebaseSync();

    // Auto-hydration pull from cloud on boot
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      pullDataFromFirestore({ logActivity: false })
        .then((stats) => {
          if (stats.success && stats.totalPulled > 0) {
            toast.success(`Datos sincronizados con la nube (${stats.totalPulled} registros actualizados)`, {
              id: 'boot-sync',
              duration: 3000
            });
          }
        })
        .catch((err) => {
          console.warn('[AppContent] Background boot sync warning:', err);
        });
    }

    const handleNavRecipes = () => setActiveTab('RECIPES');
    window.addEventListener('foodiepos:navigate-recipes', handleNavRecipes);

    return () => {
      unsubscribeSync();
      window.removeEventListener('foodiepos:navigate-recipes', handleNavRecipes);
    };
  }, []);

  // 1. Subscribe to OrderPaid domain event once on mount
  useEffect(() => {
    const handleOrderPaid = async (payload: any) => {
      try {
        await processOrderPaidInventory(payload);
        console.log('[AppContent] Inventory successfully deducted for paid order:', payload.orderId);
      } catch (err) {
        console.error('[AppContent] Failed to process inventory deduction for order:', err);
      }
    };

    eventBus.on('OrderPaid', handleOrderPaid);

    return () => {
      eventBus.off('OrderPaid', handleOrderPaid);
    };
  }, []);

  // 2. Smooth opacity transition once mounted
  useEffect(() => {
    const timer = setTimeout(() => {
      setOpacityClass('opacity-100');
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  // Transition to order taking flow for a specific table
  const handleSelectTable = (tableName: string, zoneName: string) => {
    setSelectedTable(tableName);
    setSelectedZone(zoneName);
    setActiveTab('ORDER');
  };

  // Callback when order is submitted or cancelled
  const handleOrderFinished = async () => {
    if (selectedTable) {
      try {
        await handleComandaClosure(selectedTable);
      } catch (err) {
        console.error('Error handling comanda closure for reservation:', err);
      }
    }
    setSelectedTable(null);
    setActiveTab('SALON');
  };

  // OmniSearch navigation callbacks
  const handleSelectRecipe = (id: string, isSub: boolean) => {
    setSearchNav({ id, view: isSub ? 'create_subrecipe' : 'detail' });
    setActiveTab('RECIPES');
  };

  const handleSelectInventory = (id: string) => {
    setActiveTab('INVENTORY_DASHBOARD');
    setTimeout(() => {
      // Dispatch custom event to highlight item
      window.dispatchEvent(new CustomEvent('highlight-inventory-item', { detail: { id } }));
    }, 100);
  };

  const renderSidebarContent = () => (
    <>
      <div>
        {/* Logo & Brand Header */}
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="w-9 h-9 bg-action text-action-text rounded-lg flex items-center justify-center font-black text-xl shadow-sm border border-line">
            <span className="material-symbols-outlined text-lg font-bold">restaurant</span>
          </div>
          <div>
            <span className="text-md font-black text-content tracking-tight leading-none block">Foodie POS</span>
            <span className="text-[9px] text-content-tertiary font-bold tracking-wider uppercase mt-1 block">THE DIGITAL MAITRE'D</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1" aria-label="Navegación Principal">
          {/* Dashboard */}
          <button
            aria-label="Navegar al Dashboard Financiero"
            aria-current={activeTab === 'FINANCIAL_DASHBOARD' ? 'page' : undefined}
            onClick={() => {
              setSelectedTable(null);
              setActiveTab('FINANCIAL_DASHBOARD');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full text-left rounded-lg px-4 py-3 flex items-center gap-3 transition-all cursor-pointer relative btn-press ${
              activeTab === 'FINANCIAL_DASHBOARD'
                ? 'bg-action text-action-text font-bold shadow-sm'
                : 'text-content-secondary hover:bg-raised hover:text-content font-semibold'
            }`}
          >
            {activeTab === 'FINANCIAL_DASHBOARD' && (
              <span className="absolute left-0 top-3 bottom-3 w-1 bg-action-text rounded-r"></span>
            )}
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: activeTab === 'FINANCIAL_DASHBOARD' ? "'FILL' 1" : undefined }}>dashboard</span>
            <span className="text-xs font-semibold">Dashboard</span>
          </button>

          {/* Pedidos */}
          <button
            aria-label="Navegar al Plano de Salón y Pedidos"
            aria-current={activeTab === 'SALON' ? 'page' : undefined}
            onClick={() => {
              setSelectedTable(null);
              setActiveTab('SALON');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full text-left rounded-lg px-4 py-3 flex items-center gap-3 transition-all cursor-pointer relative btn-press ${
              activeTab === 'SALON'
                ? 'bg-action text-action-text font-bold shadow-sm'
                : 'text-content-secondary hover:bg-raised hover:text-content font-semibold'
            }`}
          >
            {activeTab === 'SALON' && (
              <span className="absolute left-0 top-3 bottom-3 w-1 bg-action-text rounded-r"></span>
            )}
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: activeTab === 'SALON' ? "'FILL' 1" : undefined }}>deck</span>
            <span className="text-xs font-semibold">Pedidos</span>
          </button>

          {/* Clientes */}
          <button
            aria-label="Navegar al Módulo de Clientes"
            aria-current={activeTab === 'CLIENTS' ? 'page' : undefined}
            onClick={() => {
              setSelectedTable(null);
              setActiveTab('CLIENTS');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full text-left rounded-lg px-4 py-3 flex items-center gap-3 transition-all cursor-pointer relative btn-press ${
              activeTab === 'CLIENTS'
                ? 'bg-action text-action-text font-bold shadow-sm'
                : 'text-content-secondary hover:bg-raised hover:text-content font-semibold'
            }`}
          >
            {activeTab === 'CLIENTS' && (
              <span className="absolute left-0 top-3 bottom-3 w-1 bg-action-text rounded-r"></span>
            )}
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: activeTab === 'CLIENTS' ? "'FILL' 1" : undefined }}>group</span>
            <span className="text-xs font-semibold">Clientes</span>
          </button>

          {/* Cocina */}
          <button
            aria-label="Navegar a la Pantalla de Cocina KDS"
            aria-current={activeTab === 'KDS' ? 'page' : undefined}
            onClick={() => {
              setSelectedTable(null);
              setActiveTab('KDS');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full text-left rounded-lg px-4 py-3 flex items-center gap-3 transition-all cursor-pointer relative btn-press ${
              activeTab === 'KDS'
                ? 'bg-action text-action-text font-bold shadow-sm'
                : 'text-content-secondary hover:bg-raised hover:text-content font-semibold'
            }`}
          >
            {activeTab === 'KDS' && (
              <span className="absolute left-0 top-3 bottom-3 w-1 bg-action-text rounded-r"></span>
            )}
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: activeTab === 'KDS' ? "'FILL' 1" : undefined }}>skillet</span>
            <span className="text-xs font-semibold">Cocina</span>
          </button>

          {/* Bar */}
          <button
            aria-label="Navegar al Inventario de Bar"
            aria-current={activeTab === 'BAR_INVENTORY' ? 'page' : undefined}
            onClick={() => {
              setSelectedTable(null);
              setActiveTab('BAR_INVENTORY');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full text-left rounded-lg px-4 py-3 flex items-center gap-3 transition-all cursor-pointer relative btn-press ${
              activeTab === 'BAR_INVENTORY'
                ? 'bg-action text-action-text font-bold shadow-sm'
                : 'text-content-secondary hover:bg-raised hover:text-content font-semibold'
            }`}
          >
            {activeTab === 'BAR_INVENTORY' && (
              <span className="absolute left-0 top-3 bottom-3 w-1 bg-action-text rounded-r"></span>
            )}
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: activeTab === 'BAR_INVENTORY' ? "'FILL' 1" : undefined }}>liquor</span>
            <span className="text-xs font-semibold">Bar</span>
          </button>

          {/* Inventario collapsible accordion menu */}
          <div className="space-y-1">
            <button
              aria-label="Alternar menú de Inventario"
              aria-expanded={isInventoryMenuExpanded}
              onClick={() => {
                setIsInventoryMenuExpanded(!isInventoryMenuExpanded);
                const isInventoryTab = ['INVENTORY_DASHBOARD', 'INVENTORY_ONBOARDING', 'INVENTORY_ALERTS', 'INVENTORY_RECEIPTS', 'ASSET_MANAGEMENT'].includes(activeTab);
                if (!isInventoryTab) {
                  setActiveTab('INVENTORY_DASHBOARD');
                }
              }}
              className={`w-full text-left rounded-lg px-4 py-3 flex items-center justify-between transition-all cursor-pointer relative btn-press ${
                ['INVENTORY_DASHBOARD', 'INVENTORY_ONBOARDING', 'INVENTORY_ALERTS', 'INVENTORY_RECEIPTS', 'ASSET_MANAGEMENT'].includes(activeTab)
                  ? 'bg-action text-action-text font-bold shadow-sm'
                  : 'text-content-secondary hover:bg-raised hover:text-content font-semibold'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg">inventory_2</span>
                <span className="text-xs font-semibold">Inventario</span>
              </div>
              <span className="material-symbols-outlined text-sm font-bold">
                {isInventoryMenuExpanded ? 'expand_more' : 'chevron_right'}
              </span>
            </button>

            {/* Submenu links */}
            {isInventoryMenuExpanded && (
              <div className="pl-4 pr-2 py-3 mt-1 space-y-1 bg-canvas/60 rounded-lg border border-line">
                <button
                  onClick={() => {
                    setActiveTab('INVENTORY_DASHBOARD');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left rounded-sm py-2 px-3 text-[11px] font-bold transition-all cursor-pointer flex items-center border ${
                    activeTab === 'INVENTORY_DASHBOARD'
                      ? 'text-content font-black bg-[var(--bg-selected)] border-line shadow-sm'
                      : 'text-content-secondary hover:text-content hover:bg-raised border-transparent'
                  }`}
                >
                  Dashboard Inventario
                </button>

                <button
                  onClick={() => {
                    setEditItemId(null);
                    setEditItemType(null);
                    setActiveTab('INVENTORY_ONBOARDING');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left rounded-sm py-2 px-3 text-[11px] font-bold transition-all cursor-pointer flex items-center border ${
                    activeTab === 'INVENTORY_ONBOARDING' && !editItemId
                      ? 'text-content font-black bg-[var(--bg-selected)] border-line shadow-sm'
                      : 'text-content-secondary hover:text-content hover:bg-raised border-transparent'
                  }`}
                >
                  Nuevo elemento
                </button>

                <button
                  onClick={() => {
                    setActiveTab('INVENTORY_RECEIPTS');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left rounded-sm py-2 px-3 text-[11px] font-bold transition-all cursor-pointer flex items-center border ${
                    activeTab === 'INVENTORY_RECEIPTS'
                      ? 'text-content font-black bg-[var(--bg-selected)] border-line shadow-sm'
                      : 'text-content-secondary hover:text-content hover:bg-raised border-transparent'
                  }`}
                >
                  Entradas (Compras)
                </button>

                <button
                  onClick={() => {
                    setActiveTab('INVENTORY_ALERTS');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left rounded-sm py-2 px-3 text-[11px] font-bold transition-all cursor-pointer flex items-center border ${
                    activeTab === 'INVENTORY_ALERTS'
                      ? 'text-content font-black bg-[var(--bg-selected)] border-line shadow-sm'
                      : 'text-content-secondary hover:text-content hover:bg-raised border-transparent'
                  }`}
                >
                  Alertas de Stock
                </button>

                <button
                  onClick={() => {
                    setActiveTab('ASSET_MANAGEMENT');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left rounded-sm py-2 px-3 text-[11px] font-bold transition-all cursor-pointer flex items-center border ${
                    activeTab === 'ASSET_MANAGEMENT'
                      ? 'text-content font-black bg-[var(--bg-selected)] border-line shadow-sm'
                      : 'text-content-secondary hover:text-content hover:bg-raised border-transparent'
                  }`}
                >
                  Gestión de Activos
                </button>

                <button
                  onClick={() => {
                    setActiveTab('SUPPLIER_MANAGEMENT');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left rounded-sm py-2 px-3 text-[11px] font-bold transition-all cursor-pointer flex items-center border ${
                    activeTab === 'SUPPLIER_MANAGEMENT'
                      ? 'text-content font-black bg-[var(--bg-selected)] border-line shadow-sm'
                      : 'text-content-secondary hover:text-content hover:bg-raised border-transparent'
                  }`}
                >
                  Proveedores
                </button>

                <button
                  onClick={() => {
                    setSelectedTable(null);
                    setActiveTab('PRICE_LIST');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left rounded-sm py-2 px-3 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-2 border ${
                    activeTab === 'PRICE_LIST'
                      ? 'text-content font-black bg-[var(--bg-selected)] border-line shadow-sm'
                      : 'text-content-secondary hover:text-content hover:bg-raised border-transparent'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  Lista de precios
                </button>
              </div>
            )}
          </div>

          {/* Recetas */}
          <button
            onClick={() => {
              setSelectedTable(null);
              setActiveTab('RECIPES');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full text-left rounded-lg px-4 py-3 flex items-center gap-3 transition-all cursor-pointer relative btn-press ${
              activeTab === 'RECIPES'
                ? 'bg-action text-action-text font-bold shadow-sm'
                : 'text-content-secondary hover:bg-raised hover:text-content font-semibold'
            }`}
          >
            {activeTab === 'RECIPES' && (
              <span className="absolute left-0 top-3 bottom-3 w-1 bg-action-text rounded-r"></span>
            )}
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: activeTab === 'RECIPES' ? "'FILL' 1" : undefined }}>receipt_long</span>
            <span className="text-xs font-semibold">Recetas</span>
          </button>
        </nav>

        {/* Nuevo Pedido Button */}
        <div className="mt-8 px-1">
          <button
            onClick={() => {
              handleSelectTable('Mesa Rápida', 'Salón Principal');
              setIsMobileMenuOpen(false);
            }}
            className="btn-receitly w-full uppercase tracking-wider text-xs"
          >
            Nuevo pedido
          </button>
        </div>
      </div>

      {/* Simple Footer/Tenant Info */}
      <div className="px-2 pt-4 border-t border-line">
        <span className="text-[10px] text-content-secondary font-bold block">SEDE PRINCIPAL</span>
        <span className="text-[9px] text-content-tertiary font-medium block">Malibu Gastrobar</span>
      </div>
    </>
  );



  return (
    <div className={`flex h-screen w-screen overflow-hidden bg-canvas text-content font-sans transition-opacity duration-500 ease-in-out ${opacityClass}`}>
      {/* Desktop Sidebar (hidden on mobile) */}
      <aside className="hidden md:flex w-64 glass bg-surface border-r border-line flex-col py-6 px-4 h-full select-none z-30 shrink-0 justify-between transition-receitly">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Sidebar overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-overlay backdrop-blur-sm z-50 md:hidden flex transition-all"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <aside
            className="w-64 glass bg-surface flex flex-col py-6 px-4 h-full justify-between select-none border-r border-line transition-receitly"
            onClick={(e) => e.stopPropagation()}
          >
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area with Fixed Top Bar */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Header Search Bar */}
        <header className="h-16 border-b border-line glass bg-surface px-8 flex items-center justify-between gap-4 z-20 shrink-0 transition-receitly">
          <div className="flex items-center gap-2 shrink-0">
            {/* Mobile Hamburger menu */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-1.5 rounded-sm border border-line text-content-secondary hover:bg-raised hover:text-content flex items-center justify-center mr-1"
              aria-label="Abrir menú lateral"
            >
              <span className="material-symbols-outlined text-lg">menu</span>
            </button>
          </div>

          {/* Search container taking up the middle area */}
          <div className="flex-1 flex items-center justify-end gap-3">
            <SyncStatusBadge />
            <OmniSearch
              onSelectRecipe={handleSelectRecipe}
              onSelectInventoryItem={handleSelectInventory}
            />
          </div>

          {/* Quick Info & User Profile */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Foodie Bot AI Assistant */}
            <FoodieBotHeaderButton />

            {/* Theme (Dark/Light) & Glass Effect Quick Controls */}
            <div className="flex items-center gap-1 bg-canvas border border-line rounded-full p-1">
              <button
                onClick={toggleTheme}
                className="px-2.5 py-1 rounded-full text-content-secondary hover:text-content hover:bg-raised transition-colors cursor-pointer flex items-center gap-1.5 text-[11px] font-bold"
                title={theme === 'light' ? 'Cambiar a Modo Oscuro' : 'Cambiar a Modo Claro'}
                aria-label="Toggle Light/Dark Theme"
              >
                <span className="material-symbols-outlined text-base">
                  {theme === 'light' ? 'dark_mode' : 'light_mode'}
                </span>
                <span className="hidden sm:inline">{theme === 'light' ? 'Claro' : 'Oscuro'}</span>
              </button>

              <button
                onClick={toggleGlass}
                aria-pressed={glassEnabled}
                className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold ${
                  glassEnabled
                    ? 'bg-action text-action-text shadow-xs'
                    : 'text-content-tertiary hover:text-content hover:bg-raised'
                }`}
                title={glassEnabled ? 'Efecto Glass Activado (clic para desactivar)' : 'Efecto Glass Desactivado (clic para activar)'}
                aria-label="Alternar efecto Glass"
              >
                <span className="material-symbols-outlined text-sm">
                  {glassEnabled ? 'blur_on' : 'blur_off'}
                </span>
                <span className="hidden sm:inline">Glass</span>
              </button>
            </div>

            <button
              className="relative p-1.5 text-content-secondary hover:text-content transition-colors cursor-pointer flex items-center justify-center rounded-full hover:bg-raised"
              aria-label="Notificaciones"
            >
              <span className="material-symbols-outlined text-xl">notifications</span>
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-danger rounded-full border-2 border-surface"></span>
            </button>
            <button 
              onClick={() => setActiveTab('SETTINGS')}
              className="p-1.5 text-content-secondary hover:text-content transition-colors cursor-pointer flex items-center justify-center rounded-full hover:bg-raised"
              aria-label="Configuración"
            >
              <span className="material-symbols-outlined text-xl">settings</span>
            </button>
            <div className="w-8 h-8 rounded-full overflow-hidden cursor-pointer border border-line shadow-sm flex items-center justify-center">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&h=100&q=80"
                alt="User Avatar"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </header>

        {/* Tab Content (Fills remaining height) */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'SALON' && (
            <SalonDeck
              onSelectTable={handleSelectTable}
              selectedZone={selectedZone}
              setSelectedZone={setSelectedZone}
            />
          )}

          {activeTab === 'KDS' && (
            <KdsDisplay />
          )}

          {activeTab === 'ORDER' && (
            <OrderTaking 
              selectedTableName={selectedTable || 'Mesa Rápida'}
              selectedZoneName={selectedZone || 'Salón Principal'}
              onOrderSubmitted={handleOrderFinished}
              onCancel={handleOrderFinished}
            />
          )}

          {['INVENTORY_DASHBOARD', 'INVENTORY_ITEM_DETAIL', 'INVENTORY_ONBOARDING', 'INVENTORY_ALERTS', 'INVENTORY_RECEIPTS', 'BAR_INVENTORY', 'PRICE_LIST'].includes(activeTab) && (
            <InventoryLayout activeContext={activeTab === 'INVENTORY_ONBOARDING' ? 'ONBOARDING' : 'DASHBOARD'}>
              {activeTab === 'INVENTORY_DASHBOARD' && (
                <InventoryDashboard 
                  onIngreso={() => {
                    setNavigationOrigin('INVENTORY_DASHBOARD');
                    setEditItemId(null);
                    setEditItemType(null);
                    setActiveTab('INVENTORY_ONBOARDING');
                  }} 
                  onEditItem={(itemId, type) => {
                    setNavigationOrigin('INVENTORY_DASHBOARD');
                    setEditItemId(itemId);
                    setEditItemType(type);
                    setActiveTab('INVENTORY_ONBOARDING');
                  }}
                  onViewItem={(itemId) => {
                    setNavigationOrigin('INVENTORY_DASHBOARD');
                    setViewItemId(itemId);
                    setActiveTab('INVENTORY_ITEM_DETAIL');
                  }}
                  onNavigateToAlerts={(filter) => {
                    setAlertsInitialFilter(filter);
                    setActiveTab('INVENTORY_ALERTS');
                  }}
                />
              )}

              {activeTab === 'INVENTORY_ITEM_DETAIL' && viewItemId && (
                <InventoryItemDetail
                  itemId={viewItemId}
                  onBack={() => {
                    setViewItemId(null);
                    setActiveTab(navigationOrigin === 'INVENTORY_ONBOARDING' ? 'INVENTORY_ONBOARDING' : 'INVENTORY_DASHBOARD');
                  }}
                  onEdit={(itemId, type) => {
                    setNavigationOrigin('INVENTORY_ITEM_DETAIL');
                    setEditItemId(itemId);
                    setEditItemType(type);
                    setActiveTab('INVENTORY_ONBOARDING');
                  }}
                />
              )}

              {activeTab === 'INVENTORY_ONBOARDING' && (
                <ItemOnboarding 
                  editItemId={editItemId}
                  editItemType={editItemType}
                  onBack={() => {
                    setEditItemId(null);
                    setEditItemType(null);
                    if (navigationOrigin === 'INVENTORY_ITEM_DETAIL' && viewItemId) {
                      setActiveTab('INVENTORY_ITEM_DETAIL');
                    } else {
                      setActiveTab(navigationOrigin === 'INVENTORY_ONBOARDING' ? 'INVENTORY_ONBOARDING' : 'INVENTORY_DASHBOARD');
                    }
                  }}
                  onEditItem={(itemId, type) => {
                    setNavigationOrigin('INVENTORY_ONBOARDING');
                    setEditItemId(itemId);
                    setEditItemType(type);
                  }}
                  onViewItem={(itemId) => {
                    setNavigationOrigin('INVENTORY_ONBOARDING');
                    setViewItemId(itemId);
                    setActiveTab('INVENTORY_ITEM_DETAIL');
                  }}
                />
              )}

              {activeTab === 'INVENTORY_ALERTS' && (
                <InventoryAlerts 
                  initialFilter={alertsInitialFilter}
                  onClearFilter={() => setAlertsInitialFilter(null)}
                  onNavigateToPurchaseOrder={(draft) => {
                    setPurchaseOrderDraft(draft);
                    setActiveTab('INVENTORY_RECEIPTS');
                  }}
                />
              )}

              {activeTab === 'INVENTORY_RECEIPTS' && (
                <PurchaseOrderForm 
                  initialSupplierId={purchaseOrderDraft?.supplierId}
                  initialItems={purchaseOrderDraft?.items}
                  onComplete={() => setPurchaseOrderDraft(null)}
                />
              )}

              {activeTab === 'BAR_INVENTORY' && (
                <BarInventory />
              )}

              {activeTab === 'PRICE_LIST' && (
                <ListaDePrecios 
                  onIngreso={() => {
                    setNavigationOrigin('INVENTORY_DASHBOARD');
                    setEditItemId(null);
                    setEditItemType(null);
                    setActiveTab('INVENTORY_ONBOARDING');
                  }}
                  onNavigateToRecipes={() => {
                    setActiveTab('RECIPES');
                  }}
                  onEditItem={(itemId) => {
                    setNavigationOrigin('INVENTORY_DASHBOARD');
                    setEditItemId(itemId);
                    setEditItemType(null);
                    setActiveTab('INVENTORY_ONBOARDING');
                  }}
                />
              )}
            </InventoryLayout>
          )}

          {activeTab === 'FINANCIAL_DASHBOARD' && (
            <FinancialDashboard onNavigateToRecipes={() => setActiveTab('RECIPES')} />
          )}

          {activeTab === 'RECIPES' && (
            <RecipeBook
              initialRecipeId={searchNav.id}
              initialView={searchNav.view || undefined}
              onClearNav={() => setSearchNav({ id: '', view: null })}
            />
          )}

          {activeTab === 'SETTINGS' && (
            <SettingsPanel onNavigateToDashboard={() => setActiveTab('SALON')} />
          )}

          {activeTab === 'ASSET_MANAGEMENT' && (
            <AssetManagementList />
          )}

          {activeTab === 'SUPPLIER_MANAGEMENT' && (
            <SupplierManagementList />
          )}

          {activeTab === 'CLIENTS' && (
            <ClientManagement />
          )}
        </div>
      </div>
      {/* Global Non-Invasive Foodie Bot Lateral Drawer */}
      <VoiceCopilotWidget />

      <Toaster 
        toastOptions={{
          style: {
            background: theme === 'dark' ? '#171717' : '#FFFFFF',
            color: theme === 'dark' ? '#FAFAFA' : '#0A0A0A',
            border: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid #D4D4D4',
          }
        }}
      />
    </div>
  );
}

export default App;
