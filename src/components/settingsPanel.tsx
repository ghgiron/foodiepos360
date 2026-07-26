import { useState, useEffect } from 'react';
import { db } from '../db/localDb';
import { getSystemSetting, saveSystemSetting, DEFAULT_SETTINGS } from '../db/settingsStore';
import { toast } from 'react-hot-toast';
import type { TableLayout, OperatingZone } from '../types';
import ConfirmDialog from './ui/ConfirmDialog';

export default function SettingsPanel() {
  const [ipoconsumo, setIpoconsumo] = useState<number>(DEFAULT_SETTINGS.ipoconsumo_pct);
  const [errorMargin, setErrorMargin] = useState<number>(DEFAULT_SETTINGS.error_margin_pct);
  const [operationalCostPercentage, setOperationalCostPercentage] = useState<number>(DEFAULT_SETTINGS.operationalCostPercentage);
  const [minProfit, setMinProfit] = useState<number>(DEFAULT_SETTINGS.min_utility_margin);
  const [minStockAlert, setMinStockAlert] = useState<number>(DEFAULT_SETTINGS.min_stock_alert_threshold);
  const [profitabilityThresholdHigh, setProfitabilityThresholdHigh] = useState<number>(DEFAULT_SETTINGS.profitabilityThresholdHigh);
  const [profitabilityThresholdMedium, setProfitabilityThresholdMedium] = useState<number>(DEFAULT_SETTINGS.profitabilityThresholdMedium);
  const [kdsUrgentThresholdMinutes, setKdsUrgentThresholdMinutes] = useState<number>(DEFAULT_SETTINGS.kds_urgent_threshold_minutes);
  const [unitsStr, setUnitsStr] = useState<string>('');
  
  // Master allergens lists
  const [allergens, setAllergens] = useState<string[]>([]);
  const [newAllergen, setNewAllergen] = useState<string>('');

  // Master categories lists
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState<string>('');

  // Production zones states
  const [productionZones, setProductionZones] = useState<string[]>([]);
  const [newProductionZone, setNewProductionZone] = useState<string>('');
  const [categoryProductionMap, setCategoryProductionMap] = useState<Record<string, string>>({});

  // Salon Tables states
  const [salonTables, setSalonTables] = useState<TableLayout[]>([]);
  
  // Table form inline states
  const [newTableName, setNewTableName] = useState<string>('');
  const [newTableCapacity, setNewTableCapacity] = useState<number>(4);
  const [newTableDesc, setNewTableDesc] = useState<string>('');
  const [activeTableZone, setActiveTableZone] = useState<string | null>(null);

  // Deletion confirm states
  const [zoneToDelete, setZoneToDelete] = useState<string | null>(null);
  const [tableToDelete, setTableToDelete] = useState<string | null>(null);

  // Edit states for Zone and Table
  const [editingZoneName, setEditingZoneName] = useState<string | null>(null);
  const [editingZoneNewValue, setEditingZoneNewValue] = useState<string>('');
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editingTableName, setEditingTableName] = useState<string>('');
  const [editingTableCapacity, setEditingTableCapacity] = useState<number>(4);
  const [editingTableDesc, setEditingTableDesc] = useState<string>('');

  // Supply categories lists
  const [supplyCategories, setSupplyCategories] = useState<string[]>([]);
  const [newSupplyCategory, setNewSupplyCategory] = useState<string>('');

  // Ingredient categories lists
  const [ingredientCategories, setIngredientCategories] = useState<string[]>([]);
  const [newIngredientCategory, setNewIngredientCategory] = useState<string>('');

  // Operating zones lists
  const [operatingZones, setOperatingZones] = useState<OperatingZone[]>([]);
  const [newOperatingZone, setNewOperatingZone] = useState<string>('');

  // Fixed Asset lists
  const [assetCategories, setAssetCategories] = useState<string[]>([]);
  const [newAssetCategory, setNewAssetCategory] = useState<string>('');

  const [assetLocations, setAssetLocations] = useState<string[]>([]);
  const [newAssetLocation, setNewAssetLocation] = useState<string>('');

  // SSoT Branches list state
  const [systemBranches, setSystemBranches] = useState<Array<{ id: string; name: string; active?: boolean }>>([]);
  const [newBranchName, setNewBranchName] = useState<string>('');

  // Waste reasons list state
  const [wasteReasons, setWasteReasons] = useState<string[]>([]);
  const [newWasteReason, setNewWasteReason] = useState<string>('');

  // Tax and Impoconsumo options
  const [taxOptionsStr, setTaxOptionsStr] = useState<string>('');

  // Required fields
  const [reqDescription, setReqDescription] = useState<boolean>(false);
  const [reqSteps, setReqSteps] = useState<boolean>(false);
  const [reqChefAdvice, setReqChefAdvice] = useState<boolean>(false);
  const [reqImage, setReqImage] = useState<boolean>(false);

  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Load settings on mount
  useEffect(() => {
    async function loadAllSettings() {
      const ipo = await getSystemSetting<number>('taxPercentage');
      const err = await getSystemSetting<number>('safetyMarginPercentage');
      const opCost = await getSystemSetting<number>('operationalCostPercentage');
      const min = await getSystemSetting<number>('min_utility_margin');
      const minStock = await getSystemSetting<number>('min_stock_alert_threshold', DEFAULT_SETTINGS.min_stock_alert_threshold);
      const high = await getSystemSetting<number>('profitabilityThresholdHigh', DEFAULT_SETTINGS.profitabilityThresholdHigh);
      const medium = await getSystemSetting<number>('profitabilityThresholdMedium', DEFAULT_SETTINGS.profitabilityThresholdMedium);
      const units = await getSystemSetting<string[]>('official_units');
      const alls = await getSystemSetting<string[]>('master_allergens');
      const cats = await getSystemSetting<string[]>('master_categories');
      const reqs = await getSystemSetting<Record<string, boolean>>('required_fields');
      const kdsUrgent = await getSystemSetting<number>('kds_urgent_threshold_minutes', DEFAULT_SETTINGS.kds_urgent_threshold_minutes);

      const supplyCats = await getSystemSetting<string[]>('supply_categories', DEFAULT_SETTINGS.supply_categories);
      const ingCats = await getSystemSetting<string[]>('ingredient_categories', DEFAULT_SETTINGS.ingredient_categories);
      const zones = await getSystemSetting<any[]>('operating_zones', DEFAULT_SETTINGS.operating_zones);
      const taxes = await getSystemSetting<number[]>('tax_options', DEFAULT_SETTINGS.tax_options);
      const assetCats = await getSystemSetting<string[]>('asset_categories', DEFAULT_SETTINGS.asset_categories);
      const assetLocs = await getSystemSetting<string[]>('asset_locations', DEFAULT_SETTINGS.asset_locations);
      const branches = await getSystemSetting<Array<{ id: string; name: string; active?: boolean }>>('system_branches', DEFAULT_SETTINGS.system_branches);
      const reasons = await getSystemSetting<string[]>('waste_reasons', DEFAULT_SETTINGS.waste_reasons);
      
      const prodZones = await getSystemSetting<string[]>('production_zones', DEFAULT_SETTINGS.production_zones);
      const tables = await getSystemSetting<TableLayout[]>('salon_tables', DEFAULT_SETTINGS.salon_tables);
      const catProdMap = await getSystemSetting<Record<string, string>>('category_production_map', {});

      setIpoconsumo(ipo);
      setErrorMargin(err);
      setOperationalCostPercentage(opCost);
      setMinProfit(min);
      setMinStockAlert(minStock);
      setProfitabilityThresholdHigh(high);
      setProfitabilityThresholdMedium(medium);
      setKdsUrgentThresholdMinutes(kdsUrgent);
      setUnitsStr(units.join(', '));
      setAllergens(alls);
      setCategories(cats || DEFAULT_SETTINGS.master_categories);
      
      setSupplyCategories(supplyCats);
      setIngredientCategories(ingCats);
      const mappedZones = (zones || []).map((z: any, idx: number) => {
        if (typeof z === 'string') {
          return { name: z, orden: idx + 1, isDefault: idx === 0 };
        }
        return {
          name: z.name,
          orden: z.orden !== undefined ? z.orden : idx + 1,
          isDefault: !!z.isDefault
        };
      });
      mappedZones.sort((a, b) => a.orden - b.orden);
      setOperatingZones(mappedZones);
      setTaxOptionsStr(taxes.join(', '));
      setAssetCategories(assetCats);
      setAssetLocations(assetLocs);
      setSystemBranches(branches);
      setWasteReasons(reasons || DEFAULT_SETTINGS.waste_reasons);

      setProductionZones(prodZones);
      setSalonTables(tables);
      setCategoryProductionMap(catProdMap);
      
      if (reqs) {
        setReqDescription(!!reqs.description);
        setReqSteps(!!reqs.steps);
        setReqChefAdvice(!!reqs.chefAdvice);
        setReqImage(!!reqs.image);
      }
    }
    loadAllSettings();
  }, []);

  const handleSaveSettings = async () => {
    try {
      const parsedUnits = unitsStr
        .split(',')
        .map(u => u.trim())
        .filter(u => u.length > 0);

      const parsedTaxes = taxOptionsStr
        .split(',')
        .map(t => Number(t.trim()))
        .filter(t => !isNaN(t));

      const required_fields = {
        name: true,
        category: true,
        sellPrice: true,
        ingredients: true,
        description: reqDescription,
        steps: reqSteps,
        chefAdvice: reqChefAdvice,
        image: reqImage
      };

      await saveSystemSetting('ipoconsumo_pct', Number(ipoconsumo) || 0);
      await saveSystemSetting('taxPercentage', Number(ipoconsumo) || 0);
      await saveSystemSetting('error_margin_pct', Number(errorMargin) || 0);
      await saveSystemSetting('safetyMarginPercentage', Number(errorMargin) || 0);
      await saveSystemSetting('operationalCostPercentage', Number(operationalCostPercentage) || 0);
      await saveSystemSetting('min_utility_margin', Number(minProfit) || 0);
      await saveSystemSetting('min_stock_alert_threshold', Number(minStockAlert) || 0);
      await saveSystemSetting('profitabilityThresholdHigh', Number(profitabilityThresholdHigh) || 0);
      await saveSystemSetting('profitabilityThresholdMedium', Number(profitabilityThresholdMedium) || 0);
      await saveSystemSetting('kds_urgent_threshold_minutes', Number(kdsUrgentThresholdMinutes) || 0);
      await saveSystemSetting('official_units', parsedUnits);
      await saveSystemSetting('master_allergens', allergens);
      await saveSystemSetting('master_categories', categories);
      await saveSystemSetting('supply_categories', supplyCategories);
      await saveSystemSetting('ingredient_categories', ingredientCategories);
      await saveSystemSetting('operating_zones', operatingZones);
      await saveSystemSetting('order_categories', ['Pedidos para llevar', 'Reservas']);
      await saveSystemSetting('tax_options', parsedTaxes);
      await saveSystemSetting('asset_categories', assetCategories);
      await saveSystemSetting('asset_locations', assetLocations);
      await saveSystemSetting('system_branches', systemBranches);
      await saveSystemSetting('required_fields', required_fields);
      await saveSystemSetting('waste_reasons', wasteReasons);
      
      await saveSystemSetting('production_zones', productionZones);
      await saveSystemSetting('salon_tables', salonTables);
      await saveSystemSetting('category_production_map', categoryProductionMap);

      // Also update Dexie categories tables
      await db.menuCategories.clear();
      await db.menuCategories.bulkPut(categories.map(name => ({
        id: `cat-menu-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name
      })));

      await db.supplyCategories.clear();
      await db.supplyCategories.bulkPut(supplyCategories.map(name => ({
        id: `cat-supply-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name
      })));

      await db.ingredientCategories.clear();
      await db.ingredientCategories.bulkPut(ingredientCategories.map(name => ({
        id: `cat-ing-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name
      })));

      // Also update the Dexie allergens table to match the master list
      await db.allergens.clear();
      await db.allergens.bulkPut(allergens.map(name => ({ name })));

      // Update global configs min_utility_margin for backwards compatibility if needed
      await db.globalConfigs.put({ key: 'min_utility_margin', value: Number(minProfit) || 0 });

      setIsSaved(true);
      toast.success('Configuraciones guardadas exitosamente');
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Error al guardar las configuraciones');
    }
  };

  const handleAddAllergen = () => {
    const cleanAllergen = newAllergen.trim();
    if (cleanAllergen && !allergens.includes(cleanAllergen)) {
      setAllergens([...allergens, cleanAllergen]);
      setNewAllergen('');
    }
  };

  const handleRemoveAllergen = (item: string) => {
    setAllergens(allergens.filter(a => a !== item));
  };

  const handleAddCategory = () => {
    const cleanCategory = newCategory.trim();
    if (cleanCategory && !categories.includes(cleanCategory)) {
      setCategories([...categories, cleanCategory]);
      setNewCategory('');
    }
  };

  const handleRemoveCategory = (item: string) => {
    setCategories(categories.filter(c => c !== item));
  };

  const handleAddSupplyCategory = () => {
    const clean = newSupplyCategory.trim();
    if (clean && !supplyCategories.includes(clean)) {
      setSupplyCategories([...supplyCategories, clean]);
      setNewSupplyCategory('');
    }
  };

  const handleRemoveSupplyCategory = (item: string) => {
    setSupplyCategories(supplyCategories.filter(c => c !== item));
  };

  const handleAddIngredientCategory = () => {
    const clean = newIngredientCategory.trim();
    if (clean && !ingredientCategories.includes(clean)) {
      setIngredientCategories([...ingredientCategories, clean]);
      setNewIngredientCategory('');
    }
  };

  const handleRemoveIngredientCategory = (item: string) => {
    setIngredientCategories(ingredientCategories.filter(c => c !== item));
  };

  const handleAddOperatingZone = () => {
    const clean = newOperatingZone.trim();
    if (clean && !operatingZones.some(z => z.name.toLowerCase() === clean.toLowerCase())) {
      const newZone: OperatingZone = {
        name: clean,
        orden: operatingZones.length + 1,
        isDefault: operatingZones.length === 0
      };
      setOperatingZones([...operatingZones, newZone]);
      setNewOperatingZone('');
      toast.success(`Zona "${clean}" creada localmente.`);
    } else if (clean) {
      toast.error('La zona ya existe.');
    }
  };

  const handleRemoveOperatingZone = (name: string) => {
    const filtered = operatingZones.filter(z => z.name !== name);
    const updated = filtered.map((z, idx) => ({ ...z, orden: idx + 1 }));
    if (updated.length > 0 && !updated.some(z => z.isDefault)) {
      updated[0].isDefault = true;
    }
    setOperatingZones(updated);
    setSalonTables(salonTables.filter(t => t.zone !== name));
    toast.success(`Zona "${name}" eliminada localmente.`);
  };

  const handleSaveZoneEdit = (oldZone: string) => {
    const newVal = editingZoneNewValue.trim();
    if (!newVal) {
      toast.error('El nombre de la zona no puede estar vacío.');
      return;
    }
    if (newVal.toLowerCase() !== oldZone.toLowerCase() && operatingZones.some(z => z.name.toLowerCase() === newVal.toLowerCase())) {
      toast.error('Ya existe una zona con ese nombre.');
      return;
    }
    setOperatingZones(operatingZones.map(z => z.name === oldZone ? { ...z, name: newVal } : z));
    setSalonTables(salonTables.map(t => t.zone === oldZone ? { ...t, zone: newVal } : t));
    setEditingZoneName(null);
    toast.success('Zona de operación editada localmente.');
  };

  const handleMoveZoneUp = (index: number) => {
    if (index === 0) return;
    const list = [...operatingZones];
    const temp = list[index];
    list[index] = list[index - 1];
    list[index - 1] = temp;
    const updated = list.map((z, idx) => ({ ...z, orden: idx + 1 }));
    setOperatingZones(updated);
    toast.success('Orden de zonas actualizado localmente.');
  };

  const handleMoveZoneDown = (index: number) => {
    if (index === operatingZones.length - 1) return;
    const list = [...operatingZones];
    const temp = list[index];
    list[index] = list[index + 1];
    list[index + 1] = temp;
    const updated = list.map((z, idx) => ({ ...z, orden: idx + 1 }));
    setOperatingZones(updated);
    toast.success('Orden de zonas actualizado localmente.');
  };

  const handleSetDefaultZone = (name: string) => {
    const updated = operatingZones.map(z => ({
      ...z,
      isDefault: z.name === name
    }));
    setOperatingZones(updated);
    toast.success(`Zona "${name}" establecida como predeterminada.`);
  };

  const handleSaveTableEdit = (tableId: string) => {
    const newName = editingTableName.trim();
    if (!newName) {
      toast.error('El nombre de la mesa es requerido.');
      return;
    }
    const exists = salonTables.some(t => t.id !== tableId && t.name.toLowerCase() === newName.toLowerCase());
    if (exists) {
      toast.error('Ya existe otra mesa con ese nombre.');
      return;
    }
    setSalonTables(salonTables.map(t => t.id === tableId ? {
      ...t,
      name: newName,
      capacity: Number(editingTableCapacity) || 4,
      description: editingTableDesc.trim()
    } : t));
    setEditingTableId(null);
    toast.success('Mesa editada localmente.');
  };

  const handleAddProductionZone = () => {
    const clean = newProductionZone.trim();
    if (clean && !productionZones.includes(clean)) {
      setProductionZones([...productionZones, clean]);
      setNewProductionZone('');
    }
  };

  const handleRemoveProductionZone = (item: string) => {
    setProductionZones(productionZones.filter(z => z !== item));
  };

  const handleAddTable = (zone: string) => {
    if (!newTableName.trim()) {
      toast.error('Nombre de la mesa es requerido.');
      return;
    }
    const exists = salonTables.some(t => t.name.toLowerCase() === newTableName.toLowerCase().trim());
    if (exists) {
      toast.error('Ya existe una mesa con ese nombre.');
      return;
    }
    const newTbl: TableLayout = {
      id: `tbl-${Date.now()}`,
      name: newTableName.trim(),
      capacity: Number(newTableCapacity) || 4,
      description: newTableDesc.trim(),
      zone
    };
    setSalonTables([...salonTables, newTbl]);
    setNewTableName('');
    setNewTableCapacity(4);
    setNewTableDesc('');
    setActiveTableZone(null);
    toast.success('Mesa agregada localmente.');
  };

  const handleRemoveTable = (id: string) => {
    setSalonTables(salonTables.filter(t => t.id !== id));
    toast.success('Mesa eliminada localmente.');
  };

  const handleAddAssetCategory = () => {
    const clean = newAssetCategory.trim();
    if (clean && !assetCategories.includes(clean)) {
      setAssetCategories([...assetCategories, clean]);
      setNewAssetCategory('');
    }
  };

  const handleRemoveAssetCategory = (item: string) => {
    setAssetCategories(assetCategories.filter(c => c !== item));
  };

  const handleAddAssetLocation = () => {
    const clean = newAssetLocation.trim();
    if (clean && !assetLocations.includes(clean)) {
      setAssetLocations([...assetLocations, clean]);
      setNewAssetLocation('');
    }
  };

  const handleRemoveAssetLocation = (item: string) => {
    setAssetLocations(assetLocations.filter(l => l !== item));
  };

  const handleAddBranch = () => {
    const cleanName = newBranchName.trim();
    if (cleanName) {
      const newId = `sede-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString().slice(-4)}`;
      if (!systemBranches.some(b => b.name.toLowerCase() === cleanName.toLowerCase())) {
        setSystemBranches([...systemBranches, { id: newId, name: cleanName, active: true }]);
        setNewBranchName('');
        toast.success('Sede añadida exitosamente');
      } else {
        toast.error('Esta sede ya existe.');
      }
    }
  };

  const handleToggleBranchActive = (id: string) => {
    setSystemBranches(systemBranches.map(b => 
      b.id === id ? { ...b, active: b.active === false ? true : false } : b
    ));
    toast.success('Estado de la sede actualizado');
  };

  const handleRemoveBranch = (id: string) => {
    setSystemBranches(systemBranches.filter(b => b.id !== id));
  };

  const handleAddWasteReason = () => {
    const clean = newWasteReason.trim();
    if (clean && !wasteReasons.includes(clean)) {
      setWasteReasons([...wasteReasons, clean]);
      setNewWasteReason('');
    }
  };

  const handleRemoveWasteReason = (item: string) => {
    setWasteReasons(wasteReasons.filter(r => r !== item));
  };

  return (
    <div className="p-8 space-y-8 transition-receitly">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white leading-tight">Configuración del Sistema</h1>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Parámetros globales y reglas operativas del Gastrobar.</p>
        </div>
        
        <div className="flex items-center gap-3">
          {isSaved && (
            <span className="text-emerald-500 font-bold text-xs flex items-center gap-1 animate-bounce">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              ¡Cambios guardados con éxito!
            </span>
          )}
          <button 
            onClick={handleSaveSettings}
            className="btn-receitly text-xs flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            Guardar Configuración
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Costing and Margins Parameters */}
        <div className="panel-card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-[var(--accent-purple)]">payments</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Límites y Costeo</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] block mb-1">
                Tasa de Impoconsumo Predeterminada (%)
              </label>
              <input 
                type="number"
                value={ipoconsumo}
                onChange={e => setIpoconsumo(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] block mb-1">
                Margen de Error de Producción (%)
              </label>
              <input 
                type="number"
                value={errorMargin}
                onChange={e => setErrorMargin(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] block mb-1">
                Costo Operativo (%)
              </label>
              <input 
                type="number"
                step="0.01"
                value={operationalCostPercentage}
                onChange={e => setOperationalCostPercentage(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] block mb-1">
                Rentabilidad Bruta Mínima Permitida (%)
              </label>
              <input 
                type="number"
                value={minProfit}
                onChange={e => setMinProfit(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <p className="text-[9px] text-[var(--text-muted)] mt-1">
                Si el margen bruto de cualquier receta cae por debajo de este límite, saltará una alerta crítica.
              </p>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] block mb-1">
                Umbral de Rentabilidad Alta (%)
              </label>
              <input 
                type="number"
                value={profitabilityThresholdHigh}
                onChange={e => setProfitabilityThresholdHigh(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <p className="text-[9px] text-[var(--text-muted)] mt-1">
                Cualquier receta con margen bruto por encima de este umbral se etiquetará como Alta (ej. 60%).
              </p>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] block mb-1">
                Umbral de Rentabilidad Media (%)
              </label>
              <input 
                type="number"
                value={profitabilityThresholdMedium}
                onChange={e => setProfitabilityThresholdMedium(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <p className="text-[9px] text-[var(--text-muted)] mt-1">
                Margen bruto entre este umbral y el de rentabilidad alta se etiquetará como Media (ej. 30%). Por debajo se etiquetará como Baja.
              </p>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] block mb-1">
                Alerta Stock Mínimo Global (Unidades)
              </label>
              <input 
                type="number"
                value={minStockAlert}
                onChange={e => setMinStockAlert(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <p className="text-[9px] text-[var(--text-muted)] mt-1">
                Umbral predeterminado del sistema para notificar stock bajo o crítico.
              </p>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] block mb-1">
                Tiempo Máximo antes de Marcar Pedido como Urgente (Minutos)
              </label>
              <input 
                type="number"
                value={kdsUrgentThresholdMinutes}
                onChange={e => setKdsUrgentThresholdMinutes(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <p className="text-[9px] text-[var(--text-muted)] mt-1">
                Tiempo máximo (en minutos) permitido antes de marcar visualmente una comanda en curso como urgente.
              </p>
            </div>
          </div>
        </div>

        {/* Units of Measure and Taxes Options */}
        <div className="panel-card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-cyan-500">straighten</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Unidades de Medida y Tasas de Impuestos</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] block mb-1">
                Unidades oficiales de control (Separadas por comas)
              </label>
              <input 
                type="text"
                value={unitsStr}
                onChange={e => setUnitsStr(e.target.value)}
                placeholder="gr, ml, oz, un, kg, unidad, paquete, caja"
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <p className="text-[9px] text-[var(--text-muted)] mt-1">
                Las unidades agregadas estarán disponibles para la creación de insumos, recetas y subrecetas.
              </p>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] block mb-1">
                Tasas de Impuesto e Impoconsumo Permitidas (Separadas por comas)
              </label>
              <input 
                type="text"
                value={taxOptionsStr}
                onChange={e => setTaxOptionsStr(e.target.value)}
                placeholder="0, 8, 16, 19"
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <p className="text-[9px] text-[var(--text-muted)] mt-1">
                Define las tasas de impuesto aplicables (ej: 0 para exento, 8 para impoconsumo, etc.).
              </p>
            </div>
          </div>
        </div>

        {/* Master Allergens */}
        <div className="panel-card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-purple-500">warning_amber</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Lista Maestra de Alérgenos</h3>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {allergens.map(al => (
                <span 
                  key={al}
                  className="bg-[var(--bg-app)] text-[var(--text-secondary)] text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-[var(--border-glow)]"
                >
                  {al}
                  <button 
                    onClick={() => handleRemoveAllergen(al)}
                    className="text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Ej. Sésamo"
                value={newAllergen}
                onChange={e => setNewAllergen(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <button 
                onClick={handleAddAllergen}
                className="btn-receitly-secondary text-xs shrink-0"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>



        {/* Master Categories (Sales / Menu) */}
        <div className="panel-card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-[var(--accent-purple)]">category</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Categorías de Menú / Ventas</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              {categories.map(cat => (
                <div key={cat} className="flex items-center justify-between bg-[var(--bg-app)]/55 p-2 rounded-xl border border-[var(--border-glow)]">
                  <span className="text-xs font-bold text-[var(--text-primary)]">{cat}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-extrabold uppercase text-[var(--text-muted)]">Despacho:</span>
                    <select
                      value={categoryProductionMap[cat] || 'Cocina'}
                      onChange={(e) => {
                        setCategoryProductionMap(prev => ({
                          ...prev,
                          [cat]: e.target.value
                        }));
                      }}
                      className="bg-[var(--bg-surface)] border border-[var(--border-glow)] rounded-lg text-xs font-bold text-[var(--text-secondary)] py-1 px-2.5 outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
                    >
                      {productionZones.map(pz => (
                        <option key={pz} value={pz}>{pz}</option>
                      ))}
                      {productionZones.length === 0 && <option value="Cocina">Cocina</option>}
                    </select>
                    <button 
                      onClick={() => handleRemoveCategory(cat)}
                      className="text-[var(--text-muted)] hover:text-rose-500 bg-transparent border-none cursor-pointer p-1"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Ej. Burgers"
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <button 
                onClick={handleAddCategory}
                className="btn-receitly-secondary text-xs shrink-0"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>

        {/* Supply Categories */}
        <div className="panel-card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-[var(--accent-purple)]">inventory_2</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Categorías de Insumos y Suministros</h3>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {supplyCategories.map(cat => (
                <span 
                  key={cat}
                  className="bg-[var(--bg-app)] text-[var(--text-secondary)] text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-[var(--border-glow)]"
                >
                  {cat}
                  <button 
                    onClick={() => handleRemoveSupplyCategory(cat)}
                    className="text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Ej. Proteínas"
                value={newSupplyCategory}
                onChange={e => setNewSupplyCategory(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <button 
                onClick={handleAddSupplyCategory}
                className="btn-receitly-secondary text-xs shrink-0"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>

        {/* Ingredient Categories */}
        <div className="panel-card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-[var(--accent-purple)]">restaurant_menu</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Categorías de Ingredientes</h3>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {ingredientCategories.map(cat => (
                <span 
                  key={cat}
                  className="bg-[var(--bg-app)] text-[var(--text-secondary)] text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-[var(--border-glow)]"
                >
                  {cat}
                  <button 
                    onClick={() => handleRemoveIngredientCategory(cat)}
                    className="text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Ej. Proteínas"
                value={newIngredientCategory}
                onChange={e => setNewIngredientCategory(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <button 
                onClick={handleAddIngredientCategory}
                className="btn-receitly-secondary text-xs shrink-0"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>

        {/* Zonas de Operación (Gestión Espacial de Mesas) */}
        <div className="panel-card space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-green-500">room</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Zonas de Operación y Distribución de Mesas</h3>
          </div>

          <div className="flex gap-2 bg-[var(--bg-app)]/30 p-4 rounded-2xl border border-[var(--border-glow)]">
            <input 
              type="text"
              placeholder="Nueva Zona (ej. Salón Principal, Terraza, Balcón)"
              value={newOperatingZone}
              onChange={e => setNewOperatingZone(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
            />
            <button 
              type="button"
              onClick={handleAddOperatingZone}
              className="btn-receitly-secondary text-xs shrink-0"
            >
              Crear Zona
            </button>
          </div>

          <div className="space-y-6">
            {operatingZones.map((zone, idx) => {
              const zoneTables = salonTables.filter(t => t.zone === zone.name);
              const isAddingTable = activeTableZone === zone.name;

              return (
                <div key={zone.name} className="border border-[var(--border-glow)] bg-[var(--bg-surface)] rounded-2xl p-5 space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-[var(--border-glow)]/50">
                    <div className="flex items-center gap-3">
                      {/* Reordering buttons */}
                      <div className="flex flex-col items-center">
                        <button
                          type="button"
                          onClick={() => handleMoveZoneUp(idx)}
                          disabled={idx === 0}
                          className="text-[var(--text-muted)] hover:text-[var(--accent-purple)] bg-transparent border-none cursor-pointer disabled:opacity-30 p-0 flex items-center animate-fade-in"
                          title="Subir"
                        >
                          <span className="material-symbols-outlined text-[16px]">keyboard_arrow_up</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveZoneDown(idx)}
                          disabled={idx === operatingZones.length - 1}
                          className="text-[var(--text-muted)] hover:text-[var(--accent-purple)] bg-transparent border-none cursor-pointer disabled:opacity-30 p-0 flex items-center animate-fade-in"
                          title="Bajar"
                        >
                          <span className="material-symbols-outlined text-[16px]">keyboard_arrow_down</span>
                        </button>
                      </div>

                      <span className="material-symbols-outlined text-xs text-[var(--accent-purple)]">push_pin</span>
                      
                      {editingZoneName === zone.name ? (
                        <div className="flex items-center gap-1.5 animate-fade-in">
                          <input 
                            type="text"
                            value={editingZoneNewValue}
                            onChange={e => setEditingZoneNewValue(e.target.value)}
                            className="rounded-lg border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] px-2 py-1 text-xs font-bold outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveZoneEdit(zone.name)}
                            className="p-1 bg-emerald-500 text-white rounded-lg cursor-pointer border-none flex items-center justify-center hover:bg-emerald-600"
                            title="Guardar"
                          >
                            <span className="material-symbols-outlined text-sm">done</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingZoneName(null)}
                            className="p-1 bg-slate-200 dark:bg-slate-800 text-[var(--text-secondary)] rounded-lg cursor-pointer border-none flex items-center justify-center hover:bg-slate-350"
                            title="Cancelar"
                          >
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 animate-fade-in">
                          <h4 className="text-sm font-black text-[var(--text-primary)]">{zone.name}</h4>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingZoneName(zone.name);
                              setEditingZoneNewValue(zone.name);
                            }}
                            className="text-[var(--text-muted)] hover:text-[var(--accent-purple)] bg-transparent border-none cursor-pointer p-0.5 flex items-center"
                            title="Editar Zona"
                          >
                            <span className="material-symbols-outlined text-xs">edit</span>
                          </button>
                          <span className="text-[10px] bg-[var(--bg-app)] text-[var(--text-muted)] font-black px-2 py-0.5 rounded-md uppercase">
                            {zoneTables.length} {zoneTables.length === 1 ? 'Mesa' : 'Mesas'}
                          </span>

                          {/* Default zone toggle */}
                          <label className="flex items-center gap-1.5 ml-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!zone.isDefault}
                              onChange={() => handleSetDefaultZone(zone.name)}
                              className="rounded border-[var(--border-glow)] text-[var(--accent-purple)] focus:ring-[var(--accent-purple)] h-3.5 w-3.5"
                            />
                            <span className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Predeterminada</span>
                          </label>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => setZoneToDelete(zone.name)}
                      className="text-xs font-bold text-rose-500 hover:underline flex items-center gap-1 bg-transparent border-none cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                      Eliminar Zona
                    </button>
                  </div>

                  {zoneTables.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] italic">No hay mesas físicas en esta zona.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {zoneTables.map(table => (
                        <div key={table.id} className="flex justify-between items-start bg-[var(--bg-app)]/45 p-3 rounded-xl border border-[var(--border-glow)]/75 text-xs">
                          {editingTableId === table.id ? (
                            <div className="space-y-2 w-full animate-fade-in text-left">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[8px] font-bold text-slate-450 uppercase block mb-0.5">Nombre Mesa</label>
                                  <input 
                                    type="text" 
                                    value={editingTableName}
                                    onChange={e => setEditingTableName(e.target.value)}
                                    className="w-full rounded-lg border border-[var(--border-glow)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-1.5 font-bold outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="text-[8px] font-bold text-slate-450 uppercase block mb-0.5">Capacidad</label>
                                  <input 
                                    type="number" 
                                    min={1}
                                    value={editingTableCapacity}
                                    onChange={e => setEditingTableCapacity(Number(e.target.value))}
                                    className="w-full rounded-lg border border-[var(--border-glow)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-1.5 font-bold outline-none"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-[8px] font-bold text-slate-455 uppercase block mb-0.5">Ubicación / Descripción</label>
                                <input 
                                  type="text" 
                                  value={editingTableDesc}
                                  onChange={e => setEditingTableDesc(e.target.value)}
                                  className="w-full rounded-lg border border-[var(--border-glow)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-1.5 font-bold outline-none"
                                />
                              </div>
                              <div className="flex justify-end gap-1.5 pt-1.5">
                                <button 
                                  type="button" 
                                  onClick={() => setEditingTableId(null)}
                                  className="px-2.5 py-1 bg-slate-200 dark:bg-slate-800 text-[var(--text-secondary)] font-bold rounded-md cursor-pointer border-none hover:bg-slate-350"
                                >
                                  Cancelar
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => handleSaveTableEdit(table.id)}
                                  className="px-2.5 py-1 bg-[var(--accent-purple)] text-white font-black rounded-md cursor-pointer border-none hover:bg-[var(--accent-purple)]/90"
                                >
                                  Guardar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div>
                                <div className="font-extrabold text-[var(--text-primary)]">{table.name}</div>
                                <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">{table.capacity} pax</div>
                                {table.description && <div className="text-[10px] text-[var(--text-muted)] italic mt-0.5">{table.description}</div>}
                              </div>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => {
                                    setEditingTableId(table.id);
                                    setEditingTableName(table.name);
                                    setEditingTableCapacity(table.capacity);
                                    setEditingTableDesc(table.description || '');
                                  }}
                                  className="text-[var(--text-secondary)] hover:text-[var(--accent-purple)] bg-transparent border-none cursor-pointer flex items-center"
                                  title="Editar Mesa"
                                >
                                  <span className="material-symbols-outlined text-sm">edit</span>
                                </button>
                                <button 
                                  onClick={() => setTableToDelete(table.id)}
                                  className="text-rose-500 hover:text-rose-600 bg-transparent border-none cursor-pointer flex items-center"
                                  title="Eliminar Mesa"
                                >
                                  <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {isAddingTable ? (
                    <div className="bg-[var(--bg-app)]/55 p-4 rounded-xl border border-dashed border-[var(--border-glow)] space-y-3 text-left">
                      <h5 className="text-[10px] font-extrabold text-[var(--text-primary)] uppercase tracking-wider">Registrar Mesa Física</h5>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[9px] font-bold text-slate-455 uppercase block mb-1">Nombre Mesa *</label>
                          <input 
                            type="text" 
                            placeholder="Ej. Mesa 1"
                            value={newTableName}
                            onChange={e => setNewTableName(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border-glow)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-2 text-xs font-bold outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-455 uppercase block mb-1">Capacidad (pax) *</label>
                          <input 
                            type="number" 
                            min={1}
                            value={newTableCapacity}
                            onChange={e => setNewTableCapacity(Number(e.target.value))}
                            className="w-full rounded-lg border border-[var(--border-glow)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-2 text-xs font-bold outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-455 uppercase block mb-1">Ubicación Espacial</label>
                          <input 
                            type="text" 
                            placeholder="Ej. Junto a la baranda"
                            value={newTableDesc}
                            onChange={e => setNewTableDesc(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border-glow)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-2 text-xs font-bold outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-glow)]/35">
                        <button 
                          type="button" 
                          onClick={() => {
                            setActiveTableZone(null);
                            setNewTableName('');
                            setNewTableCapacity(4);
                            setNewTableDesc('');
                          }}
                          className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-[var(--text-secondary)] font-bold rounded-lg cursor-pointer border-none hover:bg-slate-350"
                        >
                          Cancelar
                        </button>
                        <button 
                          type="button" 
                          onClick={() => handleAddTable(zone.name)}
                          className="px-3 py-1.5 bg-[var(--accent-purple)] text-white font-black rounded-lg cursor-pointer border-none hover:bg-[var(--accent-purple)]/90"
                        >
                          Guardar Mesa
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      type="button" 
                      onClick={() => {
                        setActiveTableZone(zone.name);
                        setNewTableName('');
                        setNewTableCapacity(4);
                        setNewTableDesc('');
                      }}
                      className="text-xs font-black text-[var(--accent-purple)] hover:underline flex items-center gap-1 bg-transparent border-none cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm font-bold">add_circle</span>
                      + Añadir Mesa Física
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Zonas de Producción */}
        <div className="panel-card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-orange-500">conveyor_belt</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Zonas de Producción</h3>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {productionZones.map(pz => (
                <span 
                  key={pz}
                  className="bg-[var(--bg-app)] text-[var(--text-secondary)] text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-[var(--border-glow)]"
                >
                  {pz}
                  <button 
                    type="button"
                    onClick={() => handleRemoveProductionZone(pz)}
                    className="text-[var(--text-muted)] hover:text-rose-500 transition-colors bg-transparent border-none cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Ej. Cocina, Bar, Licuadoras"
                value={newProductionZone}
                onChange={e => setNewProductionZone(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <button 
                type="button"
                onClick={handleAddProductionZone}
                className="btn-receitly-secondary text-xs shrink-0"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>

        {/* Fixed Asset Categories */}
        <div className="panel-card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-blue-500">handyman</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Categorías de Activos Fijos</h3>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {assetCategories.map(cat => (
                <span 
                  key={cat}
                  className="bg-[var(--bg-app)] text-[var(--text-secondary)] text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-[var(--border-glow)]"
                >
                  {cat}
                  <button 
                    onClick={() => handleRemoveAssetCategory(cat)}
                    className="text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Ej. Mobiliario"
                value={newAssetCategory}
                onChange={e => setNewAssetCategory(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <button 
                onClick={handleAddAssetCategory}
                className="btn-receitly-secondary text-xs shrink-0"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>

        {/* Fixed Asset Locations */}
        <div className="panel-card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-blue-500">storefront</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Ubicaciones de Activos</h3>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {assetLocations.map(loc => (
                <span 
                  key={loc}
                  className="bg-[var(--bg-app)] text-[var(--text-secondary)] text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-[var(--border-glow)]"
                >
                  {loc}
                  <button 
                    onClick={() => handleRemoveAssetLocation(loc)}
                    className="text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Ej. Salón"
                value={newAssetLocation}
                onChange={e => setNewAssetLocation(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <button 
                onClick={handleAddAssetLocation}
                className="btn-receitly-secondary text-xs shrink-0"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>

        {/* Gestión de Sedes (SSoT) */}
        <div className="panel-card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-[var(--accent-purple)]">storefront</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Gestión de Sedes (Sucursales)</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              {systemBranches.map(b => (
                <div key={b.id} className="flex items-center justify-between bg-[var(--bg-app)]/55 p-3 rounded-xl border border-[var(--border-glow)] animate-fade-in">
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-bold text-[var(--text-primary)]">{b.name}</span>
                    <span className="text-[9px] text-[var(--text-muted)] font-mono uppercase mt-0.5">{b.id}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleBranchActive(b.id)}
                      className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border shrink-0 ${
                        b.active !== false
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
                          : 'bg-slate-500/10 text-slate-500 border-slate-700/30 hover:bg-slate-500/20'
                      }`}
                    >
                      {b.active !== false ? 'Activa' : 'Inactiva'}
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleRemoveBranch(b.id)}
                      className="text-[var(--text-muted)] hover:text-rose-500 transition-colors bg-transparent border-none cursor-pointer flex items-center justify-center p-1"
                      title="Eliminar Sede"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </div>
                </div>
              ))}
              {systemBranches.length === 0 && (
                <p className="text-[10px] text-[var(--text-muted)] italic text-center py-4">No hay sedes configuradas.</p>
              )}
            </div>

            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Nombre de la nueva sede (Ej. Sucursal Express)"
                value={newBranchName}
                onChange={e => setNewBranchName(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <button 
                type="button"
                onClick={handleAddBranch}
                className="btn-receitly-secondary text-xs shrink-0"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>

        {/* Motivos de Cancelación (Mermas) */}
        <div className="panel-card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-rose-500">delete_sweep</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Motivos de Cancelación y Mermas</h3>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {wasteReasons.map(reason => (
                <span 
                  key={reason}
                  className="bg-[var(--bg-app)] text-[var(--text-secondary)] text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-[var(--border-glow)]"
                >
                  {reason}
                  <button 
                    onClick={() => handleRemoveWasteReason(reason)}
                    className="text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
              {wasteReasons.length === 0 && (
                <p className="text-[10px] text-[var(--text-muted)] italic">No hay motivos configurados.</p>
              )}
            </div>

            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Ej. Ingrediente contaminado"
                value={newWasteReason}
                onChange={e => setNewWasteReason(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
              <button 
                onClick={handleAddWasteReason}
                className="btn-receitly-secondary text-xs shrink-0"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>

        {/* Required Fields Checkboxes */}
        <div className="panel-card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-rose-500">rule</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Campos Obligatorios de Ficha Técnica</h3>
          </div>

          <div className="space-y-3 font-semibold text-xs text-[var(--text-secondary)]">
            <label className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-glow)] cursor-pointer">
              <input 
                type="checkbox"
                checked={reqDescription}
                onChange={e => setReqDescription(e.target.checked)}
                className="w-4 h-4 rounded text-[var(--accent-purple)] focus:ring-[var(--accent-purple)] border-[var(--border-glow)] bg-transparent cursor-pointer"
              />
              <span>Descripción obligatoria en recetas/subrecetas</span>
            </label>

            <label className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-glow)] cursor-pointer">
              <input 
                type="checkbox"
                checked={reqSteps}
                onChange={e => setReqSteps(e.target.checked)}
                className="w-4 h-4 rounded text-[var(--accent-purple)] focus:ring-[var(--accent-purple)] border-[var(--border-glow)] bg-transparent cursor-pointer"
              />
              <span>Pasos de preparación obligatorios (Mínimo 1 paso)</span>
            </label>

            <label className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-glow)] cursor-pointer">
              <input 
                type="checkbox"
                checked={reqChefAdvice}
                onChange={e => setReqChefAdvice(e.target.checked)}
                className="w-4 h-4 rounded text-[var(--accent-purple)] focus:ring-[var(--accent-purple)] border-[var(--border-glow)] bg-transparent cursor-pointer"
              />
              <span>Consejo del chef obligatorio</span>
            </label>

            <label className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-glow)] cursor-pointer">
              <input 
                type="checkbox"
                checked={reqImage}
                onChange={e => setReqImage(e.target.checked)}
                className="w-4 h-4 rounded text-[var(--accent-purple)] focus:ring-[var(--accent-purple)] border-[var(--border-glow)] bg-transparent cursor-pointer"
              />
              <span>Cargar imagen obligatoria (Previsualización de plato)</span>
            </label>
          </div>
        </div>

      </div>

      {zoneToDelete && (
        <ConfirmDialog
          isOpen={!!zoneToDelete}
          onClose={() => setZoneToDelete(null)}
          onConfirm={() => {
            handleRemoveOperatingZone(zoneToDelete);
            setZoneToDelete(null);
          }}
          title="Eliminar Zona de Operación"
          message={`¿Estás seguro de que deseas eliminar la zona "${zoneToDelete}" y todas sus mesas asignadas? Esta acción no se puede deshacer.`}
          confirmText="Eliminar"
          cancelText="Cancelar"
        />
      )}

      {tableToDelete && (
        <ConfirmDialog
          isOpen={!!tableToDelete}
          onClose={() => setTableToDelete(null)}
          onConfirm={() => {
            handleRemoveTable(tableToDelete);
            setTableToDelete(null);
          }}
          title="Eliminar Mesa Física"
          message={`¿Estás seguro de que deseas eliminar esta mesa física? Esta acción no se puede deshacer.`}
          confirmText="Eliminar"
          cancelText="Cancelar"
        />
      )}
    </div>
  );
}
