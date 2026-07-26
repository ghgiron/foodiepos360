import { useState, useMemo } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';

export default function FinancialDashboard() {
  // Rent and admin costs for Rent Lease Effort Rate (David Penagos)
  const [rentCanon, setRentCanon] = useState<number>(4500000); // 4.5M COP
  const [adminFees, setAdminFees] = useState<number>(500000);  // 500K COP
  const [occupancyVat, setOccupancyVat] = useState<number>(855000); // 19% VAT of canon
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // Time filter state
  const [timeFilter, setTimeFilter] = useState<'hoy' | 'semana' | 'mes' | 'rango'>('hoy');

  // Fetch KDS tickets, recipes, and inventory items from Dexie SSoT
  const allTickets = useLiveQuery(() => db.kdsOrderTickets.toArray()) || [];
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];
  const operationalLosses = useLiveQuery(() => db.operationalLosses.toArray()) || [];

  // 1. DYNAMIC CALCULATIONS & TAX BASE RULE
  const calculations = useMemo(() => {
    let grossSales = 0;
    let cogs = 0;
    let totalPrepTime = 0;
    let totalPrepCount = 0;
    let totalBarTime = 0;
    let totalBarCount = 0;

    let kitchenInPrep = 0;
    let kitchenReady = 0;
    let barInPrep = 0;
    let barReady = 0;
    let barPending = 0;

    allTickets.forEach(ticket => {
      // Monitor counts
      ticket.items.forEach(item => {
        const recipe = recipes.find(r => r.id === item.recipeId);
        const sellPrice = recipe ? recipe.sellPrice : (item.category === 'BAR' ? 16000 : 38000);
        const costPrice = recipe ? recipe.costPrice : (item.category === 'BAR' ? 4500 : 13000);
        
        grossSales += sellPrice * item.quantity;
        cogs += costPrice * item.quantity;

        // KPI times calculation
        if (item.category === 'BAR') {
          totalBarTime += 8 * item.quantity; // mock average stay
          totalBarCount += item.quantity;
          if (item.status === 'PENDING') barPending += item.quantity;
          else if (item.status === 'COMPLETED') barReady += item.quantity;
          else barInPrep += item.quantity;
        } else {
          totalPrepTime += 12 * item.quantity; // mock average prep
          totalPrepCount += item.quantity;
          if (item.status === 'COMPLETED') kitchenReady += item.quantity;
          else kitchenInPrep += item.quantity;
        }
      });
    });

    // David Penagos Tax Deduction Rule: Ventas Netas = Ventas Brutas - 8% (Impoconsumo)
    const TAX_RATE = 0.08;
    const netSales = grossSales * (1 - TAX_RATE);
    const netUtility = netSales - cogs;
    const cmvRate = netSales > 0 ? (cogs / netSales) * 100 : 0;

    // Rent Lease Effort Rate calculation
    const totalRentCost = rentCanon + adminFees + occupancyVat;
    // Calculated based on monthly projection
    const monthlyNetSales = netSales > 0 ? netSales * 15 : 184200 * 0.92; 
    const leaseEffortRate = monthlyNetSales > 0 ? (totalRentCost / monthlyNetSales) * 100 : 0;

    return {
      netSales,
      cogs,
      netUtility,
      cmvRate,
      leaseEffortRate,
      kitchenInPrep,
      kitchenReady,
      barInPrep,
      barReady,
      barPending,
      avgPrepTime: totalPrepCount > 0 ? Math.round(totalPrepTime / totalPrepCount) : 12,
      avgBarTime: totalBarCount > 0 ? Math.round(totalBarTime / totalBarCount) : 8,
    };
  }, [allTickets, recipes, rentCanon, adminFees, occupancyVat]);

  // Adjust values based on active time filter (multiplying values to simulate filter impact)
  const filterMultiplier = useMemo(() => {
    switch (timeFilter) {
      case 'semana': return 7;
      case 'mes': return 30;
      default: return 1;
    }
  }, [timeFilter]);

  // Match the high fidelity mockup values as a perfect fallback if DB is not populated
  const displayNetSales = useMemo(() => {
    if (calculations.netSales > 0) {
      return Math.round(calculations.netSales * filterMultiplier);
    }
    return 12450 * filterMultiplier;
  }, [calculations.netSales, filterMultiplier]);

  const displayUtility = useMemo(() => {
    if (calculations.netSales > 0) {
      return Math.round(calculations.netUtility * filterMultiplier);
    }
    return 4120 * filterMultiplier;
  }, [calculations.netUtility, filterMultiplier]);

  const displayAccumulatedMonth = useMemo(() => {
    if (calculations.netSales > 0) {
      return Math.round(calculations.netSales * 15);
    }
    return 184200;
  }, [calculations.netSales]);

  const displayLosses = useMemo(() => {
    const sum = operationalLosses.reduce((acc, loss) => acc + (loss.cost || 0), 0);
    if (sum > 0) {
      return Math.round(sum * filterMultiplier);
    }
    return 350 * filterMultiplier; // Fallback mock value
  }, [operationalLosses, filterMultiplier]);

  const displayLossesList = useMemo(() => {
    if (operationalLosses.length > 0) {
      return [...operationalLosses].sort((a, b) => new Date(b.cancelledAt).getTime() - new Date(a.cancelledAt).getTime());
    }
    return [
      {
        id: 'mock-1',
        ticketId: 'T-1002',
        recipeId: 'r-1',
        name: 'Hamburguesa Gourmet',
        quantity: 1,
        cost: 13000,
        reason: 'Error de comanda',
        cancelledAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        waiterId: 'Mesero Juan'
      },
      {
        id: 'mock-2',
        ticketId: 'T-1005',
        recipeId: 'r-2',
        name: 'Sushi Roll Especial',
        quantity: 2,
        cost: 18000,
        reason: 'Cliente insatisfecho',
        cancelledAt: new Date(Date.now() - 3600000 * 5).toISOString(),
        waiterId: 'Mesera Maria'
      }
    ];
  }, [operationalLosses]);

  // Dynamic Platos Estrella (BCG Matrix Grid)
  const starsToDisplay = useMemo(() => {
    const defaultStars = [
      { name: 'Hamburguesa Gourmet', orders: 42, img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80' },
      { name: 'Sushi Roll Especial', orders: 38, img: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Tacos al Pastor', orders: 31, img: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Pasta Carbonara', orders: 28, img: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=400&q=80' },
      { name: 'Ensalada César', orders: 24, img: 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?auto=format&fit=crop&w=400&q=80' }
    ];

    const dbStars = recipes.filter(r => r.bcgClassification === 'ESTRELLA');

    const result = [];
    for (let i = 0; i < 5; i++) {
      if (dbStars[i]) {
        const mockOrderCount = 45 - i * 4;
        result.push({
          name: dbStars[i].name,
          orders: mockOrderCount,
          img: dbStars[i].name.toLowerCase().includes('gin')
            ? 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80'
            : dbStars[i].name.toLowerCase().includes('burrata')
            ? 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?auto=format&fit=crop&w=400&q=80'
            : defaultStars[i % defaultStars.length].img
        });
      } else {
        result.push(defaultStars[result.length]);
      }
    }
    return result;
  }, [recipes]);

  // Reactive Stock alerts columns
  const stockAlerts = useMemo(() => {
    // Critical: theoreticalStock <= stockMinLimit
    const criticalDb = inventoryItems.filter(item => item.theoreticalStock <= item.stockMinLimit);
    const criticalItem = criticalDb[0]
      ? `${criticalDb[0].name} - ${Math.round(criticalDb[0].theoreticalStock)} ${criticalDb[0].countUnit} restantes`
      : 'Hamburguesa Pícara - 2 restantes';

    // Low stock: theoreticalStock <= stockMinLimit * 1.5
    const lowStockDb = inventoryItems.filter(item => 
      item.theoreticalStock > item.stockMinLimit && 
      item.theoreticalStock <= item.stockMinLimit * 1.5
    );
    const lowStockItem = lowStockDb[0]
      ? `${lowStockDb[0].name} - ${Math.round(lowStockDb[0].theoreticalStock)} ${lowStockDb[0].countUnit} restantes`
      : 'Aceite de Oliva - 5L restantes';

    return {
      critical: criticalItem,
      low: lowStockItem,
      expiring: 'Salmón Fresco - Vence mañana'
    };
  }, [inventoryItems]);

  return (
    <div className="p-8 space-y-8 transition-receitly font-sans text-slate-800 dark:text-slate-200">
      
      {/* Subheader & Date Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--text-primary)] leading-tight">Dashboard</h1>
        </div>
        <div className="flex items-center gap-1 bg-[#f0f2f6] dark:bg-[var(--card-color)] p-1 rounded-xl">
          {[
            { id: 'hoy', label: 'Hoy' },
            { id: 'semana', label: 'Semana' },
            { id: 'mes', label: 'Mes' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setTimeFilter(tab.id as any)}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                timeFilter === tab.id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button 
            onClick={() => setTimeFilter('rango')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              timeFilter === 'rango'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">calendar_today</span>
            Rango
          </button>
        </div>
      </div>

      {/* 1. HERO METRIC CARDS (Bento Style) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
        
        {/* Ventas Totales */}
        <div className="bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between shadow-sm border border-slate-100 dark:border-slate-800/80 h-44 text-[var(--text-primary)]">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Ventas Totales</span>
            <div className="flex items-center gap-0.5 text-emerald-500 dark:text-emerald-400 font-extrabold text-[10px]">
              <span className="material-symbols-outlined text-xs">trending_up</span>
              <span>+12%</span>
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight text-[var(--text-primary)]">${displayNetSales.toLocaleString('en-US')}</h2>
            <p className="text-[9px] text-[var(--text-muted)] mt-1.5 font-semibold">Meta: $15k (83%)</p>
            <div className="h-1 w-full bg-slate-100 dark:bg-slate-800/80 rounded-full mt-2.5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-pink)] w-[83%] rounded-full"></div>
            </div>
          </div>
        </div>

        {/* Utilidad Diaria */}
        <div className="bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl flex flex-col justify-between shadow-sm border border-slate-100 dark:border-slate-800/80 h-44">
          <div className="w-9 h-9 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-450 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-lg">attach_money</span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-0.5">Utilidad Diaria</span>
            <h3 className="text-2xl font-black text-[var(--text-primary)]">${displayUtility.toLocaleString('en-US')}</h3>
            <span className="text-[9px] text-emerald-500 font-extrabold block mt-2">▲ 15% vs ayer</span>
          </div>
        </div>

        {/* Acumulado Mes */}
        <div className="bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl flex flex-col justify-between shadow-sm border border-slate-100 dark:border-slate-800/80 h-44">
          <div className="w-9 h-9 bg-cyan-100 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-0.5">Acumulado Mes</span>
            <h3 className="text-2xl font-black text-[var(--text-primary)]">${displayAccumulatedMonth.toLocaleString('en-US')}</h3>
            <span className="text-[9px] text-emerald-500 font-extrabold block mt-2">▲ 0.4% vs mes anterior</span>
          </div>
        </div>

        {/* Promedio Preparacion Cocina */}
        <div className="bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl flex flex-col justify-between shadow-sm border border-slate-100 dark:border-slate-800/80 h-44">
          <div className="w-9 h-9 bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-lg">skillet</span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-0.5">Prep. Cocina (Prom)</span>
            <h3 className="text-2xl font-black text-[var(--text-primary)]">
              {calculations.avgPrepTime} <span className="text-xs font-semibold text-[var(--text-muted)]">min</span>
            </h3>
            <span className="text-[9px] text-rose-500 font-extrabold block mt-2">▲ 2 min vs ayer</span>
          </div>
        </div>

        {/* Servicio Bar Promedio */}
        <div className="bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl flex flex-col justify-between shadow-sm border border-slate-100 dark:border-slate-800/80 h-44">
          <div className="w-9 h-9 bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-405 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-lg">liquor</span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-0.5">Servicio Bar (Prom)</span>
            <h3 className="text-2xl font-black text-[var(--text-primary)]">
              {calculations.avgBarTime} <span className="text-xs font-semibold text-[var(--text-muted)]">min</span>
            </h3>
            <span className="text-[9px] text-emerald-500 font-extrabold block mt-2">▼ 1 min vs ayer</span>
          </div>
        </div>

        {/* Pérdidas por Operación */}
        <div className="bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl flex flex-col justify-between shadow-sm border border-slate-100 dark:border-slate-800/80 h-44">
          <div className="w-9 h-9 bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-lg">dangerous</span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-0.5">Pérdidas por Operación</span>
            <h3 className="text-2xl font-black text-[var(--text-primary)]">${displayLosses.toLocaleString('en-US')}</h3>
            <span className="text-[9px] text-rose-500 font-extrabold block mt-2">Mermas y cancelaciones</span>
          </div>
        </div>
      </section>

      {/* MIDDLE ROW (Gastos, Clientes, Promociones) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Gastos por Categoría */}
        <div className="bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-4">Gastos por Categoría</h4>
          <div className="space-y-3">
            {[
              { label: 'Insumos', val: '45%', color: 'bg-rose-500' },
              { label: 'Personal', val: '30%', color: 'bg-[var(--accent-purple)]' },
              { label: 'Operativos', val: '25%', color: 'bg-slate-400' }
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${item.color}`}></span>
                  <span className="text-[var(--text-secondary)]">{item.label}</span>
                </div>
                <span className="font-bold text-[var(--text-primary)]">{item.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Clientes Frecuentes */}
        <div className="bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-4">Clientes Frecuentes</h4>
          <div className="space-y-3">
            {[
              { name: 'Carlos Ruiz', val: '$840.00' },
              { name: 'Maria Elena', val: '$620.00' },
              { name: 'Juan Perez', val: '$450.00' }
            ].map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs font-semibold">
                <span className="text-[var(--text-secondary)]">{item.name}</span>
                <span className="font-extrabold text-[var(--accent-purple)]">{item.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Análisis Promociones */}
        <div className="bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-4">Análisis Promociones</h4>
          <div className="space-y-3">
            {[
              { name: 'Combo Familiar', tag: '+18% ventas' },
              { name: '2x1 Martes Cocktail', tag: '+24% tráfico' }
            ].map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs font-semibold">
                <span className="text-[var(--text-secondary)]">{item.name}</span>
                <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 font-extrabold text-[10px] px-2 py-0.5 rounded-md">
                  {item.tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. PLATOS ESTRELLA (Matriz BCG) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Platos Estrella</h3>
          <button className="text-xs font-bold text-[var(--accent-purple)] hover:underline cursor-pointer">Ver menú completo</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          {starsToDisplay.map((star, idx) => (
            <div 
              key={star.name} 
              className="bg-white dark:bg-[var(--bg-surface)] rounded-3xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between h-56 group cursor-pointer"
            >
              {/* Photo Area with overlay & badge */}
              <div className="h-32 w-full relative overflow-hidden bg-slate-100 dark:bg-[var(--bg-app)]">
                <img 
                  src={star.img} 
                  alt={star.name} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent"></div>
                <span className="absolute top-2.5 right-2.5 bg-[var(--accent-purple)] text-white text-[9px] font-black px-2.5 py-0.5 rounded-full shadow-sm">
                  TOP {idx + 1}
                </span>
              </div>

              {/* Text Area */}
              <div className="p-4 flex flex-col justify-between flex-1">
                <div>
                  <h4 className="text-xs font-black text-[var(--text-primary)] truncate">{star.name}</h4>
                  <span className="text-[10px] text-[var(--text-muted)] font-semibold block mt-0.5">{star.orders} pedidos</span>
                </div>
                {/* Horizontal popularity bar */}
                <div className="h-1 w-full bg-slate-100 dark:bg-[var(--bg-app)] rounded-full mt-2 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[var(--accent-purple)]/70 to-[var(--accent-purple)] rounded-full" 
                    style={{ width: `${Math.max(30, 100 - idx * 15)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. OPERATIONAL REAL-TIME MONITORS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Ocupación de Sala */}
        <div className="lg:col-span-3 bg-slate-50 dark:bg-[var(--bg-app)] p-6 rounded-3xl flex flex-col justify-between h-48 border border-slate-200/40 dark:border-slate-800/80">
          <div>
            <h4 className="text-sm font-black text-[var(--text-primary)]">Ocupación</h4>
            <span className="text-[9px] font-semibold text-[var(--text-muted)] block mt-0.5">Sala en tiempo real</span>
          </div>
          <div className="space-y-3.5">
            <div>
              <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-0.5">Capacidad</span>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-black text-[var(--accent-pink)] leading-none">
                  {allTickets.length > 0 ? Math.min(100, Math.round((calculations.kitchenInPrep + calculations.barInPrep) * 8 + 35)) : 85}%
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-pink)] animate-ping"></span>
              </div>
            </div>
            <div>
              <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] block">Prom. Estancia</span>
              <span className="text-md font-black text-[var(--text-secondary)]">45 min</span>
            </div>
          </div>
        </div>

        {/* Estado Cocina */}
        <div className="lg:col-span-4 bg-slate-50 dark:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-slate-100 dark:border-slate-800/80 p-6 rounded-3xl flex flex-col justify-between h-48 shadow-sm">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-black text-[var(--text-primary)]">Estado Cocina</h4>
            <span className="text-[8px] bg-[var(--accent-pink)]/15 text-[var(--accent-pink)] border border-[var(--accent-pink)]/20 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
              Muy Alta
            </span>
          </div>
          <div>
            {/* Progress bar */}
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-[var(--accent-pink)] w-[75%] rounded-full"></div>
            </div>
            {/* Counters */}
            <div className="grid grid-cols-2 gap-3.5 mt-4">
              <div className="bg-slate-100/60 dark:bg-white/5 p-2 rounded-xl text-center">
                <span className="text-xl font-black text-[var(--accent-pink)] block">
                  {calculations.netSales > 0 ? calculations.kitchenInPrep : 12}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mt-0.5">En Marcha</span>
              </div>
              <div className="bg-slate-100/60 dark:bg-white/5 p-2 rounded-xl text-center">
                <span className="text-xl font-black text-emerald-500 block">
                  {calculations.netSales > 0 ? calculations.kitchenReady : 4}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mt-0.5">Listos</span>
              </div>
            </div>
          </div>
        </div>

        {/* Estado Bar */}
        <div className="lg:col-span-5 bg-slate-50 dark:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-slate-100 dark:border-slate-800/80 p-6 rounded-3xl flex flex-col justify-between h-48 shadow-sm">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-black text-[var(--text-primary)]">Estado Bar</h4>
            <span className="text-[8px] bg-blue-500/15 text-blue-500 dark:text-blue-400 border border-blue-500/20 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
              Media
            </span>
          </div>
          <div>
            {/* Progress bar */}
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 w-[55%] rounded-full"></div>
            </div>
            {/* Counters */}
            <div className="grid grid-cols-3 gap-3.5 mt-4">
              <div className="bg-slate-100/60 dark:bg-white/5 p-2 rounded-xl text-center">
                <span className="text-xl font-black text-blue-500 dark:text-blue-400 block">
                  {calculations.netSales > 0 ? calculations.barInPrep : 8}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mt-0.5">En Marcha</span>
              </div>
              <div className="bg-slate-100/60 dark:bg-white/5 p-2 rounded-xl text-center">
                <span className="text-xl font-black text-emerald-500 block">
                  {calculations.netSales > 0 ? calculations.barReady : 3}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mt-0.5">Listos</span>
              </div>
              <div className="bg-slate-100/60 dark:bg-white/5 p-2 rounded-xl text-center">
                <span className="text-xl font-black text-yellow-500 dark:text-yellow-450 block">
                  {calculations.netSales > 0 ? calculations.barPending : 2}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mt-0.5">Pendientes</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. STOCK & HACCP ALERTS (SSoT) */}
      <section className="bg-slate-50 dark:bg-[var(--bg-app)] p-6 rounded-3xl border border-slate-200/20 dark:border-slate-800/80">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--accent-pink)]">warning</span>
            <span className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Alertas Stock</span>
          </div>
          <button className="text-xs font-bold text-[var(--text-muted)] hover:underline cursor-pointer">Ver todo</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* CRITICO */}
          <div className="p-4 bg-white dark:bg-[var(--bg-surface)] rounded-2xl flex items-center justify-between border border-slate-100 dark:border-slate-800/60 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-rose-50 dark:bg-rose-950/40 text-rose-500 rounded-lg flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-md">box</span>
              </div>
              <div className="min-w-0">
                <h5 className="text-xs font-black text-[var(--text-primary)] truncate">
                  {stockAlerts.critical.split(' - ')[0]}
                </h5>
                <span className="text-[10px] text-rose-500 font-bold block mt-0.5">
                  {stockAlerts.critical.split(' - ')[1] || '2 restantes'}
                </span>
              </div>
            </div>
            <span className="text-[8px] bg-rose-500 text-white font-black px-2 py-0.5 rounded-full uppercase shrink-0 tracking-wider">
              Crítico
            </span>
          </div>

          {/* BAJO STOCK */}
          <div className="p-4 bg-white dark:bg-[var(--bg-surface)] rounded-2xl flex items-center justify-between border border-slate-100 dark:border-slate-800/60 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] rounded-lg flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-md">box</span>
              </div>
              <div className="min-w-0">
                <h5 className="text-xs font-black text-[var(--text-primary)] truncate">
                  {stockAlerts.low.split(' - ')[0]}
                </h5>
                <span className="text-[10px] text-[var(--accent-purple)] font-bold block mt-0.5">
                  {stockAlerts.low.split(' - ')[1] || '5L restantes'}
                </span>
              </div>
            </div>
            <span className="text-[8px] bg-[var(--accent-purple)] text-white font-black px-2 py-0.5 rounded-full uppercase shrink-0 tracking-wider">
              Bajo Stock
            </span>
          </div>

          {/* POR VENCER */}
          <div className="p-4 bg-white dark:bg-[var(--bg-surface)] rounded-2xl flex items-center justify-between border border-slate-100 dark:border-slate-800/60 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 rounded-lg flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-md">timer</span>
              </div>
              <div className="min-w-0">
                <h5 className="text-xs font-black text-[var(--text-primary)] truncate">
                  {stockAlerts.expiring.split(' - ')[0]}
                </h5>
                <span className="text-[10px] text-emerald-500 font-bold block mt-0.5">
                  {stockAlerts.expiring.split(' - ')[1] || 'Vence mañana'}
                </span>
              </div>
            </div>
            <span className="text-[8px] bg-emerald-500 text-white font-black px-2 py-0.5 rounded-full uppercase shrink-0 tracking-wider">
              Por Vencer
            </span>
          </div>

        </div>
      </section>

      {/* 5. DETAILED ANALYTICS (CATEGORIES, PRODUCTS, TRENDS) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Categorías más vendidas */}
        <div className="lg:col-span-6 bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Categorías más vendidas</h4>
            <span className="material-symbols-outlined text-[var(--text-muted)] text-md">pie_chart</span>
          </div>
          <div className="space-y-4">
            {[
              { name: 'Burgers', pct: 42, color: 'bg-[var(--accent-purple)]' },
              { name: 'Drinks', pct: 28, color: 'bg-slate-800 dark:bg-slate-600' },
              { name: 'Sides', pct: 18, color: 'bg-teal-500' },
              { name: 'Desserts', pct: 12, color: 'bg-slate-300 dark:bg-slate-700' }
            ].map(cat => (
              <div key={cat.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-[var(--text-secondary)]">{cat.name}</span>
                  <span className="font-bold text-[var(--text-primary)]">{cat.pct}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-[var(--bg-app)] rounded-full overflow-hidden">
                  <div className={`h-full ${cat.color} rounded-full`} style={{ width: `${cat.pct}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Productos más vendidos */}
        <div className="lg:col-span-6 bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Productos más vendidos</h4>
            <span className="material-symbols-outlined text-[var(--text-muted)] text-md">bar_chart</span>
          </div>
          <div className="space-y-3.5">
            {[
              { name: 'Classic Burger', count: '124 uds', idxColor: 'bg-[var(--accent-purple)]' },
              { name: 'Iced Coffee', count: '88 uds', idxColor: 'bg-blue-500' },
              { name: 'French Fries', count: '86 uds', idxColor: 'bg-slate-450' }
            ].map((prod, index) => (
              <div key={prod.name} className="flex items-center justify-between p-2 rounded-xl bg-slate-50/50 dark:bg-[var(--bg-app)]/40">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-6 h-6 rounded-lg ${prod.idxColor} text-white font-black text-xs flex items-center justify-center shrink-0`}>
                    {index + 1}
                  </div>
                  <span className="text-xs font-black text-[var(--text-primary)] truncate">{prod.name}</span>
                </div>
                <span className="text-xs font-semibold text-[var(--text-muted)]">{prod.count}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TENDENCIA SEMANAL DE VENTAS */}
      <section className="bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800/80 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Tendencia semanal de ventas</h4>
            <span className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5 block">Comparativa de ingresos por día</span>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-bold">
            <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-purple)]"></span>
              <span>ESTA SEMANA</span>
            </div>
            <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
              <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700"></span>
              <span>SEMANA ANTERIOR</span>
            </div>
          </div>
        </div>

        {/* Clean SVG comparison bar chart matching the mockup shape (gaps on Jueves & Domingo) */}
        <div className="relative h-64 w-full flex flex-col justify-between">
          <div className="flex-1 flex items-end justify-between px-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            {[
              { label: 'LUN', val: 50, prev: 40 },
              { label: 'MAR', val: 62, prev: 50 },
              { label: 'MIE', val: 78, prev: 65 },
              { label: 'JUE', val: 0, prev: 0 },
              { label: 'VIE', val: 95, prev: 80 },
              { label: 'SAB', val: 110, prev: 95 },
              { label: 'DOM', val: 0, prev: 0 }
            ].map(day => (
              <div key={day.label} className="flex flex-col items-center gap-2 w-16">
                <div className="h-44 w-full flex items-end justify-center gap-1.5">
                  {day.val > 0 ? (
                    <>
                      {/* Previous week bar */}
                      <div 
                        className="w-5 bg-slate-200 dark:bg-[var(--bg-app)] rounded-t-lg transition-all" 
                        style={{ height: `${day.prev}%` }}
                      ></div>
                      {/* This week bar (Purple Malibu) */}
                      <div 
                        className="w-5 bg-[var(--accent-purple)] rounded-t-lg transition-all" 
                        style={{ height: `${day.val}%` }}
                      ></div>
                    </>
                  ) : (
                    <div className="h-1 w-12 border-b-2 border-dashed border-slate-200 dark:border-slate-800"></div>
                  )}
                </div>
                <span className="text-[10px] font-bold text-[var(--text-muted)]">{day.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. DAVID PENAGOS TAX & RENT SETTINGS */}
      <section className="bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--text-muted)]">payments</span>
            <div>
              <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Regla Financiera (David Penagos)</h4>
              <p className="text-[9px] text-[var(--text-muted)] font-semibold mt-0.5">Impoconsumo del 8% deducido. Tasa de Esfuerzo de Arriendo meta: &lt; 8%</p>
            </div>
          </div>
          <button 
            onClick={() => setShowConfig(!showConfig)}
            className="text-xs font-bold text-[var(--accent-purple)] bg-[var(--accent-purple)]/10 hover:bg-[var(--accent-purple)]/15 px-3 py-1 rounded-xl cursor-pointer transition-colors"
          >
            {showConfig ? 'Ocultar Config' : 'Ajustar Arriendo'}
          </button>
        </div>

        {showConfig && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800/80 animate-fadeIn">
            <div>
              <label className="text-[9px] font-black uppercase text-[var(--text-muted)] block mb-1">Canon Arriendo Neto (COP)</label>
              <input 
                type="number" 
                value={rentCanon}
                onChange={e => setRentCanon(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-[var(--bg-surface)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none font-bold"
              />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-[var(--text-muted)] block mb-1">Administración (COP)</label>
              <input 
                type="number" 
                value={adminFees}
                onChange={e => setAdminFees(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-[var(--bg-surface)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none font-bold"
              />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-[var(--text-muted)] block mb-1">IVA Ocupación (19% COP)</label>
              <input 
                type="number" 
                value={occupancyVat}
                onChange={e => setOccupancyVat(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-[var(--bg-surface)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none font-bold"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs font-semibold mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/85">
          <div className="flex gap-4">
            <span className="text-[var(--text-muted)]">CMV Real: <strong className="text-[var(--text-secondary)]">{calculations.cmvRate.toFixed(1)}%</strong></span>
            <span className="text-[var(--text-muted)]">Tasa Esfuerzo Arriendo: <strong className="text-[var(--text-secondary)]">{calculations.leaseEffortRate.toFixed(1)}%</strong></span>
          </div>
          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
            calculations.leaseEffortRate < 8 
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
              : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
          }`}>
            {calculations.leaseEffortRate < 8 ? 'Arriendo Saludable' : 'Alerta Costos'}
          </span>
        </div>
      </section>

      {/* 7. BITÁCORA DE PÉRDIDAS Y MERMAS OPERATIVAS */}
      <section className="bg-white dark:bg-[var(--bg-surface)] p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-rose-500">list_alt</span>
            <div>
              <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Bitácora de Pérdidas y Mermas Operativas</h4>
              <p className="text-[9px] text-[var(--text-muted)] font-semibold mt-0.5">Historial de mermas registradas por cancelaciones post-producción</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-[var(--text-muted)]">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Producto</th>
                <th className="py-3 px-4">Cant.</th>
                <th className="py-3 px-4">Costo</th>
                <th className="py-3 px-4">Motivo</th>
                <th className="py-3 px-4">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {displayLossesList.map((loss) => (
                <tr key={loss.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-[var(--text-muted)]">
                    {new Date(loss.cancelledAt).toLocaleString('es-ES', {
                      month: 'short',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3.5 px-4 font-black text-[var(--text-primary)]">
                    {loss.name}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-[var(--text-secondary)]">
                    {loss.quantity}
                  </td>
                  <td className="py-3.5 px-4 font-black text-rose-500">
                    ${(loss.cost || 0).toLocaleString('en-US')}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                      loss.reason === 'Cliente insatisfecho'
                        ? 'bg-[var(--text-muted)]/15 text-[var(--text-muted)]'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                    }`}>
                      {loss.reason}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-[var(--text-secondary)]">
                    {loss.waiterId || 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
