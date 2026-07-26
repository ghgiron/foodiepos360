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
import AssetManagementList from './components/assetManagementList';
import SupplierManagementList from './components/supplierManagementList';
import ClientManagement from './components/clientManagement';
import { db } from './db/localDb';
import { SplashScreen } from './components/SplashScreen';
import { seedDatabase } from './db/seedData';
import { eventBus } from './events/eventBus';
import { processOrderPaidInventory } from './db/inventoryEngine';
import { handleComandaClosure } from './services/reservationService';
import { startFirebaseSync } from './services/firebaseSync';
import './App.css';

type ActiveTab =
  | 'SALON'
  | 'KDS'
  | 'ORDER'
  | 'INVENTORY_DASHBOARD'
  | 'INVENTORY_ONBOARDING'
  | 'INVENTORY_ALERTS'
  | 'INVENTORY_RECEIPTS'
  | 'BAR_INVENTORY'
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

  return <AppContent />;
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('SALON');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [opacityClass, setOpacityClass] = useState<string>('opacity-0');
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editItemType, setEditItemType] = useState<string | null>(null);

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

  // Sync accordion expansion with active tab
  useEffect(() => {
    if (['INVENTORY_DASHBOARD', 'INVENTORY_ONBOARDING', 'INVENTORY_ALERTS', 'INVENTORY_RECEIPTS', 'ASSET_MANAGEMENT', 'SUPPLIER_MANAGEMENT'].includes(activeTab)) {
      setIsInventoryMenuExpanded(true);
    }
  }, [activeTab]);

  // Theme states (light/dark) from context
  const { theme, toggleTheme } = useTheme();

  // Start Firebase sync when AppContent mounts
  useEffect(() => {
    const unsubscribeSync = startFirebaseSync();
    return () => {
      unsubscribeSync();
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
          <div className="w-9 h-9 bg-[var(--accent-purple)] rounded-xl flex items-center justify-center text-white font-black text-xl shadow-md">
            <span className="material-symbols-outlined text-lg font-bold">restaurant</span>
          </div>
          <div>
            <span className="text-md font-black text-[var(--text-primary)] tracking-tight leading-none block">Foodie POS</span>
            <span className="text-[9px] text-[var(--text-muted)] font-bold tracking-wider uppercase mt-1 block">THE DIGITAL MAITRE'D</span>
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
            className={`w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 transition-all cursor-pointer relative ${
              activeTab === 'FINANCIAL_DASHBOARD'
                ? 'bg-[var(--accent-purple)] text-[var(--text-primary)] font-bold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] font-semibold'
            }`}
          >
            {activeTab === 'FINANCIAL_DASHBOARD' && (
              <span className="absolute left-0 top-3 bottom-3 w-1 bg-[var(--text-primary)] rounded-r"></span>
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
            className={`w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 transition-all cursor-pointer relative ${
              activeTab === 'SALON'
                ? 'bg-[var(--accent-purple)] text-[var(--text-primary)] font-bold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] font-semibold'
            }`}
          >
            {activeTab === 'SALON' && (
              <span className="absolute left-0 top-3 bottom-3 w-1 bg-[var(--text-primary)] rounded-r"></span>
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
            className={`w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 transition-all cursor-pointer relative ${
              activeTab === 'CLIENTS'
                ? 'bg-[var(--accent-purple)] text-[var(--text-primary)] font-bold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] font-semibold'
            }`}
          >
            {activeTab === 'CLIENTS' && (
              <span className="absolute left-0 top-3 bottom-3 w-1 bg-[var(--text-primary)] rounded-r"></span>
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
            className={`w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 transition-all cursor-pointer relative ${
              activeTab === 'KDS'
                ? 'bg-[var(--accent-purple)] text-[var(--text-primary)] font-bold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] font-semibold'
            }`}
          >
            {activeTab === 'KDS' && (
              <span className="absolute left-0 top-3 bottom-3 w-1 bg-[var(--text-primary)] rounded-r"></span>
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
            className={`w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 transition-all cursor-pointer relative ${
              activeTab === 'BAR_INVENTORY'
                ? 'bg-[var(--accent-purple)] text-[var(--text-primary)] font-bold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] font-semibold'
            }`}
          >
            {activeTab === 'BAR_INVENTORY' && (
              <span className="absolute left-0 top-3 bottom-3 w-1 bg-[var(--text-primary)] rounded-r"></span>
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
              className={`w-full text-left rounded-xl px-4 py-3 flex items-center justify-between transition-all cursor-pointer relative ${
                ['INVENTORY_DASHBOARD', 'INVENTORY_ONBOARDING', 'INVENTORY_ALERTS', 'INVENTORY_RECEIPTS', 'ASSET_MANAGEMENT'].includes(activeTab)
                  ? 'bg-[var(--accent-purple)] text-[var(--text-primary)] font-bold shadow-md shadow-[var(--accent-purple)]/20'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] font-semibold'
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
              <div className="pl-6 pr-2 py-4 mt-1 space-y-1 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-glow)]">
                <button
                  onClick={() => {
                    setActiveTab('INVENTORY_DASHBOARD');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left rounded-lg py-2 px-3 text-[11px] font-bold transition-all cursor-pointer flex items-center border ${
                    activeTab === 'INVENTORY_DASHBOARD' || activeTab === 'INVENTORY_ONBOARDING' || activeTab === 'ASSET_MANAGEMENT'
                      ? 'text-[var(--accent-purple)] font-black bg-[var(--accent-purple)]/15 border-[var(--accent-purple)]/25 backdrop-blur-md shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)]/50 border-transparent'
                  }`}
                >
                  Gestión de Inventario
                </button>

                <button
                  onClick={() => {
                    setActiveTab('INVENTORY_RECEIPTS');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left rounded-lg py-2 px-3 text-[11px] font-bold transition-all cursor-pointer flex items-center border ${
                    activeTab === 'INVENTORY_RECEIPTS'
                      ? 'text-[var(--accent-purple)] font-black bg-[var(--accent-purple)]/15 border-[var(--accent-purple)]/25 backdrop-blur-md shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)]/50 border-transparent'
                  }`}
                >
                  Entradas (Compras)
                </button>

                <button
                  onClick={() => {
                    setActiveTab('INVENTORY_ALERTS');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left rounded-lg py-2 px-3 text-[11px] font-bold transition-all cursor-pointer flex items-center border ${
                    activeTab === 'INVENTORY_ALERTS'
                      ? 'text-[var(--accent-purple)] font-black bg-[var(--accent-purple)]/15 border-[var(--accent-purple)]/25 backdrop-blur-md shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)]/50 border-transparent'
                  }`}
                >
                  Alertas de Stock
                </button>

                <button
                  onClick={() => {
                    setActiveTab('ASSET_MANAGEMENT');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left rounded-lg py-2 px-3 text-[11px] font-bold transition-all cursor-pointer flex items-center border ${
                    activeTab === 'ASSET_MANAGEMENT'
                      ? 'text-[var(--accent-purple)] font-black bg-[var(--accent-purple)]/15 border-[var(--accent-purple)]/25 backdrop-blur-md shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)]/50 border-transparent'
                  }`}
                >
                  Gestión de Activos
                </button>

                <button
                  onClick={() => {
                    setActiveTab('SUPPLIER_MANAGEMENT');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left rounded-lg py-2 px-3 text-[11px] font-bold transition-all cursor-pointer flex items-center border ${
                    activeTab === 'SUPPLIER_MANAGEMENT'
                      ? 'text-[var(--accent-purple)] font-black bg-[var(--accent-purple)]/15 border-[var(--accent-purple)]/25 backdrop-blur-md shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)]/50 border-transparent'
                  }`}
                >
                  Proveedores
                </button>

                <button
                  onClick={() => {
                    toast('Módulo de Lista de Precios en desarrollo.', { icon: '🚧' });
                  }}
                  className="w-full text-left rounded-lg py-2 px-3 text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)]/50 transition-all cursor-pointer flex items-center gap-2"
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
            className={`w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 transition-all cursor-pointer relative ${
              activeTab === 'RECIPES'
                ? 'bg-[var(--accent-purple)] text-[var(--text-primary)] font-bold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] font-semibold'
            }`}
          >
            {activeTab === 'RECIPES' && (
              <span className="absolute left-0 top-3 bottom-3 w-1 bg-[var(--text-primary)] rounded-r"></span>
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
      <div className="px-2 pt-4 border-t border-[var(--border-glow)]">
        <span className="text-[10px] text-[var(--text-muted)] font-bold block">SEDE PRINCIPAL</span>
        <span className="text-[9px] text-[var(--text-muted)] font-medium block">Malibu Gastrobar</span>
      </div>
    </>
  );



  return (
    <div className={`flex h-screen w-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)] font-sans transition-opacity duration-500 ease-in-out ${opacityClass}`}>
      {/* Desktop Sidebar (hidden on mobile) */}
      <aside className="hidden md:flex w-64 bg-[var(--bg-surface)] border-r border-[var(--border-glow)] flex-col py-6 px-4 h-full select-none z-30 shrink-0 justify-between transition-receitly">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Sidebar overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 md:hidden flex transition-all"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <aside
            className="w-64 bg-[var(--bg-surface)] flex flex-col py-6 px-4 h-full justify-between select-none border-r border-[var(--border-glow)] transition-receitly"
            onClick={(e) => e.stopPropagation()}
          >
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area with Fixed Top Bar */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Header Search Bar */}
        <header className="h-16 border-b border-[var(--border-glow)] bg-[var(--bg-surface)] px-8 flex items-center justify-between gap-4 z-20 shrink-0 transition-receitly">
          <div className="flex items-center gap-2 shrink-0">
            {/* Mobile Hamburger menu */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center mr-1"
            >
              <span className="material-symbols-outlined text-lg">menu</span>
            </button>
          </div>

          {/* Search container taking up the middle area */}
          <div className="flex-1 flex justify-end">
            <OmniSearch
              onSelectRecipe={handleSelectRecipe}
              onSelectInventoryItem={handleSelectInventory}
            />
          </div>

          {/* Quick Info & User Profile */}
          <div className="flex items-center gap-5 shrink-0">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-500 dark:hover:text-white transition-colors cursor-pointer flex items-center justify-center"
              title="Toggle Light/Dark Theme"
            >
              <span className="material-symbols-outlined text-xl">
                {theme === 'light' ? 'dark_mode' : 'light_mode'}
              </span>
            </button>
            <button className="relative p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">notifications</span>
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[var(--accent-pink)] rounded-full border-2 border-[var(--bg-surface)]"></span>
            </button>
            <button 
              onClick={() => setActiveTab('SETTINGS')}
              className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-xl">settings</span>
            </button>
            <div className="w-8 h-8 rounded-full overflow-hidden cursor-pointer border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center">
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

          {activeTab === 'INVENTORY_DASHBOARD' && (
            <InventoryDashboard 
              onIngreso={() => {
                setEditItemId(null);
                setEditItemType(null);
                setActiveTab('INVENTORY_ONBOARDING');
              }} 
              onEditItem={(itemId, type) => {
                setEditItemId(itemId);
                setEditItemType(type);
                setActiveTab('INVENTORY_ONBOARDING');
              }}
              onNavigateToAlerts={(filter) => {
                setAlertsInitialFilter(filter);
                setActiveTab('INVENTORY_ALERTS');
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
                setActiveTab('INVENTORY_DASHBOARD');
              }}
            />
          )}

          {activeTab === 'INVENTORY_ALERTS' && (
            <InventoryAlerts 
              initialFilter={alertsInitialFilter}
              onClearFilter={() => setAlertsInitialFilter(null)}
            />
          )}

          {activeTab === 'INVENTORY_RECEIPTS' && (
            <PurchaseOrderForm />
          )}

          {activeTab === 'BAR_INVENTORY' && (
            <BarInventory />
          )}

          {activeTab === 'FINANCIAL_DASHBOARD' && (
            <FinancialDashboard />
          )}

          {activeTab === 'RECIPES' && (
            <RecipeBook
              initialRecipeId={searchNav.id}
              initialView={searchNav.view || undefined}
              onClearNav={() => setSearchNav({ id: '', view: null })}
            />
          )}

          {activeTab === 'SETTINGS' && (
            <SettingsPanel />
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
      <Toaster 
        toastOptions={{
          style: {
            background: theme === 'dark' ? '#1e293b' : '#ffffff',
            color: theme === 'dark' ? '#f8fafc' : '#0f172a',
            border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
          }
        }}
      />
    </div>
  );
}

export default App;
