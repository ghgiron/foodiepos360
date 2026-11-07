import { useState, useMemo } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import { getItemTotalValuation } from '../utils/costEngine';
import { formatCurrency } from '../utils/formatters';

interface FinancialDashboardProps {
  onNavigateToRecipes?: () => void;
}

export default function FinancialDashboard({ onNavigateToRecipes }: FinancialDashboardProps = {}) {
  // Rent and admin costs for Rent Lease Effort Rate (David Penagos)
  const [rentCanon, setRentCanon] = useState<number>(4500000); // 4.5M COP
  const [adminFees, setAdminFees] = useState<number>(500000);  // 500K COP
  const [occupancyVat, setOccupancyVat] = useState<number>(855000); // 19% VAT of canon
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // Time filter state
  const [timeFilter, setTimeFilter] = useState<'hoy' | 'semana' | 'mes' | 'rango'>('hoy');

  // Fetch KDS tickets, recipes, inventory items, clients and promotions from Dexie SSoT
  const allTickets = useLiveQuery(() => db.kdsOrderTickets.toArray()) || [];
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];
  const operationalLosses = useLiveQuery(() => db.operationalLosses.toArray()) || [];
  const clients = useLiveQuery(() => db.clients.toArray()) || [];
  const promotionBooks = useLiveQuery(() => db.promotionBooks.toArray()) || [];

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
        const sellPrice = recipe ? recipe.sellPrice : 0;
        const costPrice = recipe ? recipe.costPrice : 0;
        
        grossSales += sellPrice * item.quantity;
        cogs += costPrice * item.quantity;

        // KPI times calculation
        if (item.category === 'BAR') {
          if (item.completedAt && ticket.comandaTime) {
            const diffMin = Math.max(1, Math.round((new Date(item.completedAt).getTime() - new Date(ticket.comandaTime).getTime()) / 60000));
            totalBarTime += diffMin * item.quantity;
          }
          totalBarCount += item.quantity;
          if (item.status === 'PENDING') barPending += item.quantity;
          else if (item.status === 'COMPLETED') barReady += item.quantity;
          else barInPrep += item.quantity;
        } else {
          if (item.completedAt && ticket.comandaTime) {
            const diffMin = Math.max(1, Math.round((new Date(item.completedAt).getTime() - new Date(ticket.comandaTime).getTime()) / 60000));
            totalPrepTime += diffMin * item.quantity;
          }
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
    const monthlyNetSales = netSales > 0 ? netSales * 30 : 0; 
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
      avgPrepTime: totalPrepCount > 0 && totalPrepTime > 0 ? Math.round(totalPrepTime / totalPrepCount) : 0,
      avgBarTime: totalBarCount > 0 && totalBarTime > 0 ? Math.round(totalBarTime / totalBarCount) : 0,
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

  // Dynamic calculations for display based on active time filter
  const displayNetSales = useMemo(() => {
    return Math.round(calculations.netSales * filterMultiplier);
  }, [calculations.netSales, filterMultiplier]);

  const displayUtility = useMemo(() => {
    return Math.round(calculations.netUtility * filterMultiplier);
  }, [calculations.netUtility, filterMultiplier]);

  const displayAccumulatedMonth = useMemo(() => {
    return Math.round(calculations.netSales * 15);
  }, [calculations.netSales]);

  const displayLosses = useMemo(() => {
    const sum = operationalLosses.reduce((acc, loss) => acc + (loss.cost || 0), 0);
    return Math.round(sum * filterMultiplier);
  }, [operationalLosses, filterMultiplier]);

  const displayLossesList = useMemo(() => {
    return [...operationalLosses].sort((a, b) => {
      const timeA = new Date(a.cancelledAt || 0).getTime();
      const timeB = new Date(b.cancelledAt || 0).getTime();
      return timeB - timeA;
    });
  }, [operationalLosses]);

  // Dynamic Platos Estrella from real tickets and recipes
  const starsToDisplay = useMemo(() => {
    const counts: Record<string, { name: string; orders: number; img?: string }> = {};

    allTickets.forEach(ticket => {
      ticket.items.forEach(item => {
        const recipe = recipes.find(r => r.id === item.recipeId || r.name.toLowerCase() === item.name.toLowerCase());
        if (recipe) {
          if (!counts[recipe.id]) {
            counts[recipe.id] = {
              name: recipe.name,
              orders: 0,
              img: recipe.img
            };
          }
          counts[recipe.id].orders += item.quantity || 1;
        }
      });
    });

    // 1. If real tickets with sales exist, prioritize top ordered dishes
    const dishesWithOrders = Object.values(counts)
      .filter(c => c.orders > 0)
      .sort((a, b) => b.orders - a.orders);

    if (dishesWithOrders.length > 0) {
      return dishesWithOrders.slice(0, 5);
    }

    // 2. Check recipes explicitly configured with isStar: true or bcgClassification: 'ESTRELLA'
    const configuredStars = recipes
      .filter(r => r.isStar || r.bcgClassification === 'ESTRELLA')
      .slice(0, 5)
      .map(r => ({
        name: r.name,
        orders: counts[r.id]?.orders || 0,
        img: r.img
      }));

    if (configuredStars.length > 0) {
      return configuredStars;
    }

    // 3. Return clean empty array if no star dishes are configured
    return [];
  }, [allTickets, recipes]);

  // Dynamic Top Categories from real tickets
  const topCategories = useMemo(() => {
    const catMap: Record<string, number> = {};
    let totalItems = 0;

    allTickets.forEach(ticket => {
      ticket.items.forEach(item => {
        const recipe = recipes.find(r => r.id === item.recipeId);
        const cat = item.category || recipe?.category || 'General';
        const q = item.quantity || 1;
        catMap[cat] = (catMap[cat] || 0) + q;
        totalItems += q;
      });
    });

    const colors = ['bg-[var(--accent-purple)]', 'bg-raised dark:bg-slate-600', 'bg-teal-500', 'bg-indigo-500'];

    return Object.entries(catMap)
      .map(([name, count], index) => ({
        name,
        pct: totalItems > 0 ? Math.round((count / totalItems) * 100) : 0,
        color: colors[index % colors.length]
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4);
  }, [allTickets, recipes]);

  // Dynamic Top Products from real tickets
  const topProducts = useMemo(() => {
    const prodMap: Record<string, number> = {};

    allTickets.forEach(ticket => {
      ticket.items.forEach(item => {
        const recipe = recipes.find(r => r.id === item.recipeId);
        const name = recipe?.name || item.name;
        const q = item.quantity || 1;
        prodMap[name] = (prodMap[name] || 0) + q;
      });
    });

    const colors = ['bg-[var(--accent-purple)]', 'bg-blue-500', 'bg-slate-450', 'bg-teal-500'];

    return Object.entries(prodMap)
      .map(([name, count], index) => ({
        name,
        count: `${count} ${count === 1 ? 'ud' : 'uds'}`,
        idxColor: colors[index % colors.length]
      }))
      .sort((a, b) => parseInt(b.count) - parseInt(a.count))
      .slice(0, 4);
  }, [allTickets, recipes]);

  // Reactive Stock alerts columns from real inventory items
  const stockAlerts = useMemo(() => {
    // Critical: theoreticalStock <= (stockMinLimit ?? 10)
    const criticalDb = inventoryItems.filter(item => item.theoreticalStock <= (item.stockMinLimit ?? 10));
    const criticalItem = criticalDb[0]
      ? { name: criticalDb[0].name, text: `${Math.round(criticalDb[0].theoreticalStock)} ${criticalDb[0].countUnit || 'und'} restantes` }
      : { name: 'Stock Óptimo', text: 'Sin alertas críticas' };

    // Low stock: theoreticalStock <= (stockMinLimit ?? 10) * 1.5
    const lowStockDb = inventoryItems.filter(item => 
      item.theoreticalStock > (item.stockMinLimit ?? 10) && 
      item.theoreticalStock <= (item.stockMinLimit ?? 10) * 1.5
    );
    const lowStockItem = lowStockDb[0]
      ? { name: lowStockDb[0].name, text: `${Math.round(lowStockDb[0].theoreticalStock)} ${lowStockDb[0].countUnit || 'und'} restantes` }
      : { name: 'Stock Normal', text: 'Sin productos en bajo stock' };

    // Expiring items within 7 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiringDb = inventoryItems
      .filter(item => item.fechaVencimiento)
      .map(item => {
        const expDate = new Date(item.fechaVencimiento!);
        expDate.setHours(0, 0, 0, 0);
        const diffTime = expDate.getTime() - today.getTime();
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return { name: item.name, daysLeft };
      })
      .filter(a => a.daysLeft >= 0 && a.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const expiringItem = expiringDb[0]
      ? { name: expiringDb[0].name, text: expiringDb[0].daysLeft === 0 ? 'Vence hoy' : `Vence en ${expiringDb[0].daysLeft}d` }
      : { name: 'Vencimientos OK', text: 'Sin vencimientos próximos' };

    return {
      critical: criticalItem,
      low: lowStockItem,
      expiring: expiringItem
    };
  }, [inventoryItems]);

  // Dynamic Expenses by category based on real inventory valuations
  const expensesByCategory = useMemo(() => {
    const catMap: Record<string, number> = {};
    let totalVal = 0;

    inventoryItems.forEach(item => {
      const cat = item.category || 'General';
      const val = getItemTotalValuation(item);
      catMap[cat] = (catMap[cat] || 0) + val;
      totalVal += val;
    });

    const colors = ['bg-rose-500', 'bg-[var(--accent-purple)]', 'bg-teal-500', 'bg-slate-400'];

    return Object.entries(catMap)
      .map(([label, val], idx) => ({
        label,
        val: totalVal > 0 ? `${Math.round((val / totalVal) * 100)}%` : '0%',
        color: colors[idx % colors.length]
      }))
      .slice(0, 3);
  }, [inventoryItems]);

  // Dynamic Frequent Clients from real tickets & clients
  const frequentClients = useMemo(() => {
    const clientSpend: Record<string, number> = {};

    allTickets.forEach(ticket => {
      let clientName = 'Cliente Ocasional';
      if (ticket.clientId) {
        const found = clients.find(c => c.id === ticket.clientId);
        clientName = found ? found.name : ticket.clientId;
      } else if (ticket.waiterId) {
        clientName = `Mesa de ${ticket.waiterId}`;
      }

      let ticketTotal = 0;
      ticket.items.forEach(item => {
        const rec = recipes.find(r => r.id === item.recipeId);
        ticketTotal += (rec ? rec.sellPrice : 0) * item.quantity;
      });

      clientSpend[clientName] = (clientSpend[clientName] || 0) + ticketTotal;
    });

    return Object.entries(clientSpend)
      .filter(([_, val]) => val > 0)
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 3)
      .map(([name, val]) => ({ name, val: formatCurrency(val) }));
  }, [allTickets, clients, recipes]);

  // Dynamic Active Promotions
  const activePromotions = useMemo(() => {
    return promotionBooks
      .filter(p => p.isActive)
      .slice(0, 3)
      .map(p => ({
        name: p.name,
        tag: `Activa (${p.rules?.length || 1} reglas)`
      }));
  }, [promotionBooks]);

  // Dynamic Room Occupation
  const roomOccupation = useMemo(() => {
    const activeTickets = allTickets.filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA');
    if (activeTickets.length === 0) {
      return {
        percent: 0,
        avgStay: '-- min'
      };
    }
    const occupiedTables = new Set(activeTickets.map(t => t.tableId).filter(Boolean)).size;
    const totalTablesCapacity = 20; // Default salon capacity
    const percent = Math.min(100, Math.round((occupiedTables / totalTablesCapacity) * 100));
    return {
      percent: percent || (activeTickets.length * 10),
      avgStay: calculations.avgPrepTime > 0 ? `${calculations.avgPrepTime + 30} min` : '40 min'
    };
  }, [allTickets, calculations.avgPrepTime]);

  // Dynamic Weekly Sales Distribution
  const weeklyTrends = useMemo(() => {
    const days = [
      { label: 'LUN', val: 0, prev: 0 },
      { label: 'MAR', val: 0, prev: 0 },
      { label: 'MIE', val: 0, prev: 0 },
      { label: 'JUE', val: 0, prev: 0 },
      { label: 'VIE', val: 0, prev: 0 },
      { label: 'SAB', val: 0, prev: 0 },
      { label: 'DOM', val: 0, prev: 0 }
    ];

    let maxDaySales = 0;
    const daySales = [0, 0, 0, 0, 0, 0, 0]; // Sun=0, Mon=1...

    allTickets.forEach(ticket => {
      if (ticket.createdAt || ticket.comandaTime) {
        const d = new Date(ticket.createdAt || ticket.comandaTime);
        const dayIdx = (d.getDay() + 6) % 7; // Map Mon=0 ... Sun=6
        let total = 0;
        ticket.items.forEach(i => {
          const rec = recipes.find(r => r.id === i.recipeId);
          total += (rec ? rec.sellPrice : 0) * i.quantity;
        });
        daySales[dayIdx] += total;
        if (daySales[dayIdx] > maxDaySales) maxDaySales = daySales[dayIdx];
      }
    });

    if (maxDaySales > 0) {
      days.forEach((day, idx) => {
        day.val = Math.round((daySales[idx] / maxDaySales) * 100);
      });
    }

    return {
      days,
      hasSales: maxDaySales > 0
    };
  }, [allTickets, recipes]);

  return (
    <div className="p-8 space-y-8 transition-receitly font-sans text-content">
      
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
                  ? 'bg-white dark:bg-slate-700 text-content shadow-sm'
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
                ? 'bg-white dark:bg-slate-700 text-content shadow-sm'
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
        <div className="bg-surface p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between shadow-sm border border-line h-44 text-[var(--text-primary)]">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Ventas Totales</span>
            <div className="flex items-center gap-0.5 text-emerald-500 dark:text-emerald-400 font-extrabold text-[10px]">
              <span className="material-symbols-outlined text-xs">trending_up</span>
              <span>{displayNetSales > 0 ? '+12%' : '0%'}</span>
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight text-[var(--text-primary)] tabular-numbers">{formatCurrency(displayNetSales, 0)}</h2>
            <p className="text-[9px] text-[var(--text-muted)] mt-1.5 font-semibold">
              Meta: $15k ({displayNetSales > 0 ? Math.min(100, Math.round((displayNetSales / 15000000) * 100)) : 0}%)
            </p>
            <div className="h-1 w-full bg-raised rounded-full mt-2.5 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-pink)] rounded-full transition-all duration-500" 
                style={{ width: `${displayNetSales > 0 ? Math.min(100, Math.max(5, Math.round((displayNetSales / 15000000) * 100))) : 0}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Utilidad Diaria */}
        <div className="bg-surface p-6 rounded-3xl flex flex-col justify-between shadow-sm border border-line h-44">
          <div className="w-9 h-9 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/80 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-lg">attach_money</span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-0.5">Utilidad Diaria</span>
            <h3 className="text-2xl font-black text-[var(--text-primary)] tabular-numbers tracking-tight">{formatCurrency(displayUtility, 0)}</h3>
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold block mt-2">
              {displayUtility > 0 ? '▲ Margen operativo' : 'Sin ventas hoy'}
            </span>
          </div>
        </div>

        {/* Acumulado Mes */}
        <div className="bg-surface p-6 rounded-3xl flex flex-col justify-between shadow-sm border border-line h-44">
          <div className="w-9 h-9 bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800/80 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-0.5">Acumulado Mes</span>
            <h3 className="text-2xl font-black text-[var(--text-primary)] tabular-numbers tracking-tight">{formatCurrency(displayAccumulatedMonth, 0)}</h3>
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold block mt-2">
              {displayAccumulatedMonth > 0 ? '▲ Acumulado del período' : 'Sin histórico'}
            </span>
          </div>
        </div>

        {/* Promedio Preparacion Cocina */}
        <div className="bg-surface p-6 rounded-3xl flex flex-col justify-between shadow-sm border border-line h-44">
          <div className="w-9 h-9 bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800/80 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-lg">skillet</span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-0.5">Prep. Cocina (Prom)</span>
            <h3 className="text-2xl font-black text-[var(--text-primary)] tabular-numbers tracking-tight">
              {calculations.avgPrepTime} <span className="text-xs font-semibold text-[var(--text-muted)]">min</span>
            </h3>
            <span className="text-[9px] text-content-secondary font-extrabold block mt-2">
              {calculations.avgPrepTime > 0 ? 'Tiempo promedio comanda' : 'Sin comandas en cocina'}
            </span>
          </div>
        </div>

        {/* Servicio Bar Promedio */}
        <div className="bg-surface p-6 rounded-3xl flex flex-col justify-between shadow-sm border border-line h-44">
          <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800/80 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-lg">liquor</span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-0.5">Servicio Bar (Prom)</span>
            <h3 className="text-2xl font-black text-[var(--text-primary)] tabular-numbers tracking-tight">
              {calculations.avgBarTime} <span className="text-xs font-semibold text-[var(--text-muted)]">min</span>
            </h3>
            <span className="text-[9px] text-content-secondary font-extrabold block mt-2">
              {calculations.avgBarTime > 0 ? 'Tiempo promedio coctelería' : 'Sin comandas en barra'}
            </span>
          </div>
        </div>

        {/* Pérdidas por Operación */}
        <div className="bg-surface p-6 rounded-3xl flex flex-col justify-between shadow-sm border border-line h-44">
          <div className="w-9 h-9 bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800/80 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-lg">dangerous</span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-0.5">Pérdidas por Operación</span>
            <h3 className="text-2xl font-black text-[var(--text-primary)] tabular-numbers tracking-tight">{formatCurrency(displayLosses, 0)}</h3>
            <span className="text-[9px] text-rose-600 dark:text-rose-400 font-extrabold block mt-2">
              {displayLosses > 0 ? 'Mermas registradas' : 'Sin pérdidas registradas'}
            </span>
          </div>
        </div>
      </section>

      {/* MIDDLE ROW (Gastos, Clientes, Promociones) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Gastos por Categoría */}
        <div className="bg-surface p-6 rounded-3xl shadow-sm border border-line flex flex-col justify-between">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-4">Inventario por Categoría</h4>
          {expensesByCategory.length === 0 ? (
            <div className="py-4 text-center text-slate-400 text-xs italic">
              Sin insumos registrados
            </div>
          ) : (
            <div className="space-y-3">
              {expensesByCategory.map(item => (
                <div key={item.label} className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${item.color}`}></span>
                    <span className="text-[var(--text-secondary)]">{item.label}</span>
                  </div>
                  <span className="font-bold text-[var(--text-primary)]">{item.val}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clientes Frecuentes */}
        <div className="bg-surface p-6 rounded-3xl shadow-sm border border-line flex flex-col justify-between">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-4">Clientes Frecuentes</h4>
          {frequentClients.length === 0 ? (
            <div className="py-4 text-center text-slate-400 text-xs italic">
              Sin historial de ventas a clientes
            </div>
          ) : (
            <div className="space-y-3">
              {frequentClients.map(item => (
                <div key={item.name} className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-[var(--text-secondary)]">{item.name}</span>
                  <span className="font-extrabold text-[var(--accent-purple)]">{item.val}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Análisis Promociones */}
        <div className="bg-surface p-6 rounded-3xl shadow-sm border border-line flex flex-col justify-between">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-4">Análisis Promociones</h4>
          {activePromotions.length === 0 ? (
            <div className="py-4 text-center text-slate-400 text-xs italic">
              Sin promociones activas
            </div>
          ) : (
            <div className="space-y-3">
              {activePromotions.map(item => (
                <div key={item.name} className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-[var(--text-secondary)]">{item.name}</span>
                  <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 font-extrabold text-[10px] px-2 py-0.5 rounded-md">
                    {item.tag}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 2. PLATOS ESTRELLA (Matriz BCG) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Platos Estrella</h3>
          <button 
            type="button"
            onClick={() => {
              if (onNavigateToRecipes) {
                onNavigateToRecipes();
              } else if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('foodiepos:navigate-recipes'));
              }
            }}
            className="text-xs font-bold text-[var(--accent-purple)] hover:underline cursor-pointer"
          >
            Ver menú completo
          </button>
        </div>

        {starsToDisplay.length === 0 ? (
          <div className="bg-surface p-8 rounded-3xl border border-line text-center flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center text-2xl shadow-sm">
              🌟
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[var(--text-primary)]">Sin Platos Estrella configurados</h4>
              <p className="text-xs text-[var(--text-muted)] max-w-sm">
                Crea tus recetas y márcalas como plato estrella para visualizarlas aquí.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (onNavigateToRecipes) {
                  onNavigateToRecipes();
                } else if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('foodiepos:navigate-recipes'));
                }
              }}
              className="mt-2 px-5 py-2.5 bg-gradient-to-r from-[var(--accent-purple)] to-indigo-600 hover:from-[var(--accent-purple)]/90 hover:to-indigo-700 text-white text-xs font-bold rounded-full shadow-md shadow-[var(--accent-purple)]/20 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Crear Receta
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            {starsToDisplay.map((star, idx) => (
              <div 
                key={star.name} 
                className="bg-surface rounded-3xl overflow-hidden shadow-sm border border-line flex flex-col justify-between h-56 group cursor-pointer"
              >
                {/* Photo Area with overlay & badge */}
                <div className="h-32 w-full relative overflow-hidden bg-slate-100 dark:bg-[var(--bg-app)]">
                  {star.img ? (
                    <img 
                      src={star.img} 
                      alt={star.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-raised text-slate-400">
                      <span className="material-symbols-outlined text-4xl text-[var(--accent-purple)]/60">restaurant</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent"></div>
                  <span className="absolute top-2.5 right-2.5 bg-[var(--accent-purple)] text-white text-[9px] font-black px-2.5 py-0.5 rounded-full shadow-sm">
                    TOP {idx + 1}
                  </span>
                </div>

                {/* Text Area */}
                <div className="p-4 flex flex-col justify-between flex-1">
                  <div>
                    <h4 className="text-xs font-black text-[var(--text-primary)] truncate">{star.name}</h4>
                    <span className="text-[10px] text-[var(--text-muted)] font-semibold block mt-0.5">{star.orders} {star.orders === 1 ? 'pedido' : 'pedidos'}</span>
                  </div>
                  {/* Horizontal popularity bar */}
                  <div className="h-1 w-full bg-slate-100 dark:bg-[var(--bg-app)] rounded-full mt-2 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[var(--accent-purple)]/70 to-[var(--accent-purple)] rounded-full" 
                      style={{ width: `${Math.max(15, 100 - idx * 18)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. OPERATIONAL REAL-TIME MONITORS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Ocupación de Sala */}
        <div className="lg:col-span-3 bg-slate-50 dark:bg-[var(--bg-app)] p-6 rounded-3xl flex flex-col justify-between h-48 border border-slate-200/40 dark:border-line">
          <div>
            <h4 className="text-sm font-black text-[var(--text-primary)]">Ocupación</h4>
            <span className="text-[9px] font-semibold text-[var(--text-muted)] block mt-0.5">Sala en tiempo real</span>
          </div>
          <div className="space-y-3.5">
            <div>
              <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-0.5">Capacidad</span>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-black text-[var(--accent-pink)] leading-none">
                  {roomOccupation.percent}%
                </span>
                {roomOccupation.percent > 0 && (
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-pink)] animate-ping"></span>
                )}
              </div>
            </div>
            <div>
              <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] block">Prom. Estancia</span>
              <span className="text-md font-black text-[var(--text-secondary)]">{roomOccupation.avgStay}</span>
            </div>
          </div>
        </div>

        {/* Estado Cocina */}
        <div className="lg:col-span-4 bg-slate-50 dark:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-line p-6 rounded-3xl flex flex-col justify-between h-48 shadow-sm">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-black text-[var(--text-primary)]">Estado Cocina</h4>
            <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
              calculations.kitchenInPrep > 5 
                ? 'bg-[var(--accent-pink)]/15 text-[var(--accent-pink)] border border-[var(--accent-pink)]/20' 
                : calculations.kitchenInPrep > 0 
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20' 
                : 'bg-slate-200/60 dark:bg-raised text-slate-500 border border-slate-300/40 dark:border-line'
            }`}>
              {calculations.kitchenInPrep > 5 ? 'Muy Alta' : calculations.kitchenInPrep > 0 ? 'En Marcha' : 'Sin Pedidos'}
            </span>
          </div>
          <div>
            {/* Progress bar */}
            <div className="h-1.5 w-full bg-raised rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-[var(--accent-pink)] rounded-full transition-all duration-500"
                style={{ 
                  width: `${calculations.kitchenInPrep + calculations.kitchenReady > 0 
                    ? Math.round((calculations.kitchenReady / (calculations.kitchenInPrep + calculations.kitchenReady)) * 100) 
                    : 0}%` 
                }}
              ></div>
            </div>
            {/* Counters */}
            <div className="grid grid-cols-2 gap-3.5 mt-4">
              <div className="bg-slate-100/60 dark:bg-white/5 p-2 rounded-xl text-center">
                <span className="text-xl font-black text-[var(--accent-pink)] block">
                  {calculations.kitchenInPrep}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mt-0.5">En Marcha</span>
              </div>
              <div className="bg-slate-100/60 dark:bg-white/5 p-2 rounded-xl text-center">
                <span className="text-xl font-black text-emerald-500 block">
                  {calculations.kitchenReady}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mt-0.5">Listos</span>
              </div>
            </div>
          </div>
        </div>

        {/* Estado Bar */}
        <div className="lg:col-span-5 bg-slate-50 dark:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-line p-6 rounded-3xl flex flex-col justify-between h-48 shadow-sm">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-black text-[var(--text-primary)]">Estado Bar</h4>
            <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
              calculations.barInPrep + calculations.barPending > 0
                ? 'bg-blue-500/15 text-blue-500 dark:text-blue-400 border border-blue-500/20'
                : 'bg-slate-200/60 dark:bg-raised text-slate-500 border border-slate-300/40 dark:border-line'
            }`}>
              {calculations.barInPrep + calculations.barPending > 0 ? 'Activo' : 'Sin Pedidos'}
            </span>
          </div>
          <div>
            {/* Progress bar */}
            <div className="h-1.5 w-full bg-raised rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
                style={{ 
                  width: `${calculations.barInPrep + calculations.barReady + calculations.barPending > 0
                    ? Math.round((calculations.barReady / (calculations.barInPrep + calculations.barReady + calculations.barPending)) * 100)
                    : 0}%` 
                }}
              ></div>
            </div>
            {/* Counters */}
            <div className="grid grid-cols-3 gap-3.5 mt-4">
              <div className="bg-slate-100/60 dark:bg-white/5 p-2 rounded-xl text-center">
                <span className="text-xl font-black text-blue-500 dark:text-blue-400 block">
                  {calculations.barInPrep}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mt-0.5">En Marcha</span>
              </div>
              <div className="bg-slate-100/60 dark:bg-white/5 p-2 rounded-xl text-center">
                <span className="text-xl font-black text-emerald-500 block">
                  {calculations.barReady}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mt-0.5">Listos</span>
              </div>
              <div className="bg-slate-100/60 dark:bg-white/5 p-2 rounded-xl text-center">
                <span className="text-xl font-black text-yellow-500 dark:text-yellow-450 block">
                  {calculations.barPending}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mt-0.5">Pendientes</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. STOCK & HACCP ALERTS (SSoT) */}
      <section className="bg-slate-50 dark:bg-[var(--bg-app)] p-6 rounded-3xl border border-slate-200/20 dark:border-line">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--accent-pink)]">warning</span>
            <span className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Alertas Stock</span>
          </div>
          <span className="text-xs font-bold text-[var(--text-muted)]">Monitoreo en tiempo real</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* CRITICO */}
          <div className="p-4 bg-surface rounded-2xl flex items-center justify-between border border-line-subtle shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-rose-50 dark:bg-rose-950/40 text-rose-500 rounded-lg flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-md">box</span>
              </div>
              <div className="min-w-0">
                <h5 className="text-xs font-black text-[var(--text-primary)] truncate">
                  {stockAlerts.critical.name}
                </h5>
                <span className="text-[10px] text-rose-500 font-bold block mt-0.5">
                  {stockAlerts.critical.text}
                </span>
              </div>
            </div>
            <span className="text-[8px] bg-rose-500 text-white font-black px-2 py-0.5 rounded-full uppercase shrink-0 tracking-wider">
              Crítico
            </span>
          </div>

          {/* BAJO STOCK */}
          <div className="p-4 bg-surface rounded-2xl flex items-center justify-between border border-line-subtle shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] rounded-lg flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-md">box</span>
              </div>
              <div className="min-w-0">
                <h5 className="text-xs font-black text-[var(--text-primary)] truncate">
                  {stockAlerts.low.name}
                </h5>
                <span className="text-[10px] text-[var(--accent-purple)] font-bold block mt-0.5">
                  {stockAlerts.low.text}
                </span>
              </div>
            </div>
            <span className="text-[8px] bg-[var(--accent-purple)] text-white font-black px-2 py-0.5 rounded-full uppercase shrink-0 tracking-wider">
              Bajo Stock
            </span>
          </div>

          {/* POR VENCER */}
          <div className="p-4 bg-surface rounded-2xl flex items-center justify-between border border-line-subtle shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 rounded-lg flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-md">timer</span>
              </div>
              <div className="min-w-0">
                <h5 className="text-xs font-black text-[var(--text-primary)] truncate">
                  {stockAlerts.expiring.name}
                </h5>
                <span className="text-[10px] text-emerald-500 font-bold block mt-0.5">
                  {stockAlerts.expiring.text}
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
        <div className="lg:col-span-6 bg-surface p-6 rounded-3xl shadow-sm border border-line flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Categorías más vendidas</h4>
            <span className="material-symbols-outlined text-[var(--text-muted)] text-md">pie_chart</span>
          </div>
          {topCategories.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs italic">
              Sin datos de ventas para mostrar categorías.
            </div>
          ) : (
            <div className="space-y-4">
              {topCategories.map(cat => (
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
          )}
        </div>

        {/* Productos más vendidos */}
        <div className="lg:col-span-6 bg-surface p-6 rounded-3xl shadow-sm border border-line flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Productos más vendidos</h4>
            <span className="material-symbols-outlined text-[var(--text-muted)] text-md">bar_chart</span>
          </div>
          {topProducts.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs italic">
              Sin datos de productos vendidos.
            </div>
          ) : (
            <div className="space-y-3.5">
              {topProducts.map((prod, index) => (
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
          )}
        </div>
      </section>

      {/* TENDENCIA SEMANAL DE VENTAS */}
      <section className="bg-surface p-6 rounded-3xl shadow-sm border border-line space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Tendencia semanal de ventas</h4>
            <span className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5 block">Comparativa de ingresos por día</span>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-extrabold">
            <div className="flex items-center gap-1.5 text-content">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-purple)]"></span>
              <span>ESTA SEMANA</span>
            </div>
            <div className="flex items-center gap-1.5 text-content-secondary">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 dark:bg-blue-400"></span>
              <span>SEMANA ANTERIOR</span>
            </div>
          </div>
        </div>

        {/* Clean dynamic comparison bar chart based on weekly tickets */}
        <div className="relative h-64 w-full flex flex-col justify-between">
          {!weeklyTrends.hasSales ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs italic space-y-1">
              <span className="material-symbols-outlined text-2xl text-slate-300 dark:text-slate-600">bar_chart</span>
              <span>Sin ventas registradas en la semana</span>
            </div>
          ) : (
            <div className="flex-1 flex items-end justify-between px-4 pb-2 border-b border-line">
              {weeklyTrends.days.map(day => (
                <div key={day.label} className="flex flex-col items-center gap-2 w-16">
                  <div className="h-44 w-full flex items-end justify-center gap-1.5">
                    {day.val > 0 ? (
                      <>
                        {/* Previous week bar (Visible Blue/Indigo) */}
                        {day.prev > 0 && (
                          <div 
                            className="w-5 bg-blue-500/80 dark:bg-blue-500/70 rounded-t-lg transition-all shadow-sm" 
                            style={{ height: `${day.prev}%` }}
                          ></div>
                        )}
                        {/* This week bar (Purple Malibu) */}
                        <div 
                          className="w-5 bg-[var(--accent-purple)] rounded-t-lg transition-all shadow-sm" 
                          style={{ height: `${day.val}%` }}
                        ></div>
                      </>
                    ) : (
                      <div className="h-1 w-12 border-b-2 border-dashed border-line"></div>
                    )}
                  </div>
                  <span className="text-[10px] font-black text-content-secondary">{day.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 6. DAVID PENAGOS TAX & RENT SETTINGS */}
      <section className="bg-surface p-6 rounded-3xl shadow-sm border border-line">
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
            className="text-xs font-black text-white bg-[var(--accent-purple)] hover:opacity-90 px-3.5 py-1.5 rounded-xl cursor-pointer transition-all shadow-sm"
          >
            {showConfig ? 'Ocultar Config' : 'Ajustar Arriendo'}
          </button>
        </div>

        {showConfig && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6 pt-6 border-t border-line animate-fadeIn">
            <div>
              <label className="text-[9px] font-black uppercase text-[var(--text-muted)] block mb-1">Canon Arriendo Neto (COP)</label>
              <input 
                type="number" 
                value={rentCanon}
                onChange={e => setRentCanon(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-line dark:bg-[var(--bg-surface)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none font-bold"
              />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-[var(--text-muted)] block mb-1">Administración (COP)</label>
              <input 
                type="number" 
                value={adminFees}
                onChange={e => setAdminFees(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-line dark:bg-[var(--bg-surface)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none font-bold"
              />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-[var(--text-muted)] block mb-1">IVA Ocupación (19% COP)</label>
              <input 
                type="number" 
                value={occupancyVat}
                onChange={e => setOccupancyVat(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-line dark:bg-[var(--bg-surface)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none font-bold"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs font-semibold mt-4 pt-4 border-t border-line/85">
          <div className="flex gap-4">
            <span className="text-[var(--text-muted)]">CMV Real: <strong className="text-[var(--text-secondary)]">{calculations.cmvRate.toFixed(1)}%</strong></span>
            <span className="text-[var(--text-muted)]">Tasa Esfuerzo Arriendo: <strong className="text-[var(--text-secondary)]">{calculations.leaseEffortRate.toFixed(1)}%</strong></span>
          </div>
          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
            calculations.leaseEffortRate < 8 
              ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/80' 
              : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800/80'
          }`}>
            {calculations.leaseEffortRate < 8 ? 'Arriendo Saludable' : 'Alerta Costos'}
          </span>
        </div>
      </section>

      {/* 7. BITÁCORA DE PÉRDIDAS Y MERMAS OPERATIVAS */}
      <section className="bg-surface p-6 rounded-3xl shadow-sm border border-line space-y-4">
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
              <tr className="border-b border-line text-[10px] font-black uppercase text-[var(--text-muted)]">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Producto</th>
                <th className="py-3 px-4">Cant.</th>
                <th className="py-3 px-4">Costo</th>
                <th className="py-3 px-4">Motivo</th>
                <th className="py-3 px-4">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-xs">
              {displayLossesList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                    No hay pérdidas ni mermas operativas registradas.
                  </td>
                </tr>
              ) : (
                displayLossesList.map((loss) => (
                  <tr key={loss.id} className="hover:bg-slate-50 dark:hover:bg-raised/50 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-[var(--text-muted)]">
                      {new Date(loss.cancelledAt || Date.now()).toLocaleString('es-ES', {
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
                    <td className="py-3.5 px-4 font-black text-rose-600 dark:text-rose-400 tabular-numbers tracking-tight">
                      {formatCurrency(loss.cost || 0)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider border ${
                        loss.reason === 'Cliente insatisfecho'
                          ? 'bg-raised text-content-secondary border-line'
                          : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800/80'
                      }`}>
                        {loss.reason}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-[var(--text-secondary)]">
                      {loss.waiterId || 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
