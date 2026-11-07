import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTheme, type AccentColor, type FontSize } from '../context/ThemeContext';
import { db } from '../db/localDb';
import { deleteRecordFromFirestore } from '../services/syncService';
import { getSystemSetting, saveSystemSetting, DEFAULT_SETTINGS } from '../db/settingsStore';
import { toast } from 'react-hot-toast';
import type { TableLayout, OperatingZone } from '../types';
import ConfirmDialog from './ui/ConfirmDialog';
import { 
  getGeminiApiKey, 
  setGeminiApiKey, 
  getGroqApiKey,
  setGroqApiKey,
  getActiveAIProvider,
  setActiveAIProvider,
  isVoiceFeedbackEnabled, 
  setVoiceFeedbackEnabled,
  type AIProvider
} from '../utils/geminiConfig';
import { testGeminiApiKey } from '../services/geminiCopilotService';
import { testGroqApiKey } from '../services/groqCopilotService';
import { resetOperationalData, getOperationalDataStats } from '../utils/databaseReset';

interface UnitSettingItem {
  id: string;
  name: string;
  baseEquivalence: number;
  baseUnit: string;
}

interface SettingsPanelProps {
  onNavigateToDashboard?: () => void;
}

export default function SettingsPanel({ onNavigateToDashboard }: SettingsPanelProps = {}) {
  const { theme, setTheme, glassEnabled, setGlassEnabled, accentColor, setAccentColor, fontSize, setFontSize, contrast, setContrast } = useTheme();
  const [enableImpoconsumo, setEnableImpoconsumo] = useState<boolean>(DEFAULT_SETTINGS.enableImpoconsumo ?? true);
  const [ipoconsumo, setIpoconsumo] = useState<number>(DEFAULT_SETTINGS.ipoconsumo_pct);
  const [errorMargin, setErrorMargin] = useState<number>(DEFAULT_SETTINGS.error_margin_pct);
  const [operationalCostPercentage, setOperationalCostPercentage] = useState<number>(DEFAULT_SETTINGS.operationalCostPercentage);
  const [minProfit, setMinProfit] = useState<number>(DEFAULT_SETTINGS.min_utility_margin);
  const [minStockAlert, setMinStockAlert] = useState<number>(DEFAULT_SETTINGS.min_stock_alert_threshold);
  const [profitabilityThresholdHigh, setProfitabilityThresholdHigh] = useState<number>(DEFAULT_SETTINGS.profitabilityThresholdHigh);
  const [profitabilityThresholdMedium, setProfitabilityThresholdMedium] = useState<number>(DEFAULT_SETTINGS.profitabilityThresholdMedium);
  const [kdsUrgentThresholdMinutes, setKdsUrgentThresholdMinutes] = useState<number>(DEFAULT_SETTINGS.kds_urgent_threshold_minutes);
  const [unitItems, setUnitItems] = useState<UnitSettingItem[]>([]);
  const [newUnitName, setNewUnitName] = useState<string>('');
  const [newUnitEquiv, setNewUnitEquiv] = useState<number | ''>(1);
  const [newUnitBaseUnit, setNewUnitBaseUnit] = useState<string>('g');
  
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

  // Foodie Voice Copilot (Google Gemini & Groq Cloud AI) states
  const [geminiApiKey, setGeminiApiKeyLocal] = useState<string>(getGeminiApiKey());
  const [groqApiKey, setGroqApiKeyLocal] = useState<string>(getGroqApiKey());
  const [activeProvider, setActiveProviderLocal] = useState<AIProvider>(getActiveAIProvider());
  const [voiceEnabled, setVoiceEnabledLocal] = useState<boolean>(isVoiceFeedbackEnabled());
  const [showApiKeyText, setShowApiKeyText] = useState<boolean>(false);
  const [showGroqKeyText, setShowGroqKeyText] = useState<boolean>(false);
  const [isTestingKey, setIsTestingKey] = useState<boolean>(false);
  const [isTestingGroqKey, setIsTestingGroqKey] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testGroqResult, setTestGroqResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  // Maintenance and Database Reset States
  const [showPurgeModal, setShowPurgeModal] = useState<boolean>(false);
  const [purgeCheckboxConfirmed, setPurgeCheckboxConfirmed] = useState<boolean>(false);
  const [isPurging, setIsPurging] = useState<boolean>(false);

  const liveOperationalStats = useLiveQuery(async () => {
    return await getOperationalDataStats();
  }, []);

  // Load settings on mount
  useEffect(() => {
    async function loadAllSettings() {
      setGeminiApiKeyLocal(getGeminiApiKey());
      let currentGroq = getGroqApiKey();
      if (!currentGroq) {
        const dexieGroq = await getSystemSetting<string>('foodie_groq_api_key', '');
        if (dexieGroq && dexieGroq.trim()) {
          currentGroq = dexieGroq.trim();
          setGroqApiKey(currentGroq);
        }
      }
      setGroqApiKeyLocal(currentGroq);
      setActiveProviderLocal(getActiveAIProvider());
      setVoiceEnabledLocal(isVoiceFeedbackEnabled());
      const storedEnableImpo = await getSystemSetting<boolean>('enableImpoconsumo', DEFAULT_SETTINGS.enableImpoconsumo);
      const ipoRate = await getSystemSetting<number>('impoconsumoRate', DEFAULT_SETTINGS.impoconsumoRate);
      const ipo = await getSystemSetting<number>('taxPercentage');
      const err = await getSystemSetting<number>('safetyMarginPercentage');
      const opCost = await getSystemSetting<number>('operationalCostPercentage');
      const min = await getSystemSetting<number>('min_utility_margin');
      const minStock = await getSystemSetting<number>('min_stock_alert_threshold', DEFAULT_SETTINGS.min_stock_alert_threshold);
      const high = await getSystemSetting<number>('profitabilityThresholdHigh', DEFAULT_SETTINGS.profitabilityThresholdHigh);
      const medium = await getSystemSetting<number>('profitabilityThresholdMedium', DEFAULT_SETTINGS.profitabilityThresholdMedium);
      const units = await getSystemSetting<string[]>('official_units', DEFAULT_SETTINGS.official_units);
      const equivalences = await getSystemSetting<Record<string, { baseEquivalence: number; baseUnit: string }>>('unit_equivalences', DEFAULT_SETTINGS.unit_equivalences);
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

      const resolvedRate = ipoRate !== undefined ? ipoRate : (ipo !== undefined && ipo > 0 ? ipo : 8);
      setEnableImpoconsumo(storedEnableImpo !== undefined ? storedEnableImpo : (ipo !== 0));
      setIpoconsumo(resolvedRate);
      setErrorMargin(err);
      setOperationalCostPercentage(opCost);
      setMinProfit(min);
      setMinStockAlert(minStock);
      setProfitabilityThresholdHigh(high);
      setProfitabilityThresholdMedium(medium);
      setKdsUrgentThresholdMinutes(kdsUrgent);
      
      const parsedUnitItems: UnitSettingItem[] = (units || []).map((u, idx) => {
        const eq = equivalences?.[u];
        if (eq) {
          return {
            id: `unit-${idx}-${u}`,
            name: u,
            baseEquivalence: Number(eq.baseEquivalence || 1),
            baseUnit: eq.baseUnit || 'g'
          };
        }
        const uLower = u.toLowerCase();
        let baseUnit = 'g';
        let baseEquivalence = 1;
        if (uLower.includes('kg') || uLower.includes('kilo')) {
          baseEquivalence = 1000;
          baseUnit = 'g';
        } else if (uLower.includes('libra') || uLower.includes('lb')) {
          baseEquivalence = 500;
          baseUnit = 'g';
        } else if (uLower.includes('onza') || uLower.includes('oz')) {
          baseEquivalence = 29.574;
          baseUnit = 'ml';
        } else if (uLower.includes('litro') || uLower.includes(' l')) {
          baseEquivalence = 1000;
          baseUnit = 'ml';
        } else if (uLower.includes('ml') || uLower.includes('mili')) {
          baseEquivalence = 1;
          baseUnit = 'ml';
        } else if (uLower.includes('und') || uLower.includes('unidad')) {
          baseEquivalence = 1;
          baseUnit = 'und';
        }
        return {
          id: `unit-${idx}-${u}`,
          name: u,
          baseEquivalence: Number(baseEquivalence),
          baseUnit
        };
      });

      setUnitItems(parsedUnitItems);
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
      const parsedUnits = unitItems.map(u => u.name.trim()).filter(Boolean);
      const parsedEquivalences: Record<string, { baseEquivalence: number; baseUnit: string }> = {};
      unitItems.forEach(u => {
        const trimmed = u.name.trim();
        if (trimmed) {
          parsedEquivalences[trimmed] = {
            baseEquivalence: Number(u.baseEquivalence || 1),
            baseUnit: u.baseUnit || 'g'
          };
        }
      });

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

      const effectiveRate = enableImpoconsumo ? (Number(ipoconsumo) || 8) : 0;
      await saveSystemSetting('enableImpoconsumo', enableImpoconsumo);
      await saveSystemSetting('impoconsumoRate', Number(ipoconsumo) || 8);
      await saveSystemSetting('ipoconsumo_pct', effectiveRate);
      await saveSystemSetting('taxPercentage', effectiveRate);
      await saveSystemSetting('error_margin_pct', Number(errorMargin) || 0);
      await saveSystemSetting('safetyMarginPercentage', Number(errorMargin) || 0);
      await saveSystemSetting('operationalCostPercentage', Number(operationalCostPercentage) || 0);
      await saveSystemSetting('min_utility_margin', Number(minProfit) || 0);
      await saveSystemSetting('min_stock_alert_threshold', Number(minStockAlert) || 0);
      await saveSystemSetting('profitabilityThresholdHigh', Number(profitabilityThresholdHigh) || 0);
      await saveSystemSetting('profitabilityThresholdMedium', Number(profitabilityThresholdMedium) || 0);
      await saveSystemSetting('kds_urgent_threshold_minutes', Number(kdsUrgentThresholdMinutes) || 0);
      await saveSystemSetting('official_units', parsedUnits);
      await saveSystemSetting('unit_equivalences', parsedEquivalences);
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

      // Also update Dexie categories tables safely without wiping existing records or IDs
      const existingMenu = await db.menuCategories.toArray();
      const newMenuSet = new Set(categories);
      for (const item of existingMenu) {
        if (!newMenuSet.has(item.name)) {
          await deleteRecordFromFirestore('menuCategories', item.id);
        }
      }
      for (const name of categories) {
        const found = existingMenu.find(c => c.name === name);
        const id = found ? found.id : `cat-menu-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        await db.menuCategories.put({ id, name });
      }

      const existingSupply = await db.supplyCategories.toArray();
      const newSupplySet = new Set(supplyCategories);
      for (const item of existingSupply) {
        if (!newSupplySet.has(item.name)) {
          await deleteRecordFromFirestore('supplyCategories', item.id);
        }
      }
      for (const name of supplyCategories) {
        const found = existingSupply.find(c => c.name === name);
        const id = found ? found.id : `cat-supply-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        await db.supplyCategories.put({ id, name });
      }

      const existingIng = await db.ingredientCategories.toArray();
      const newIngSet = new Set(ingredientCategories);
      for (const item of existingIng) {
        if (!newIngSet.has(item.name)) {
          await deleteRecordFromFirestore('ingredientCategories', item.id);
        }
      }
      for (const name of ingredientCategories) {
        const found = existingIng.find(c => c.name === name);
        const id = found ? found.id : `cat-ing-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        await db.ingredientCategories.put({ id, name });
      }

      // Also update the Dexie allergens table safely
      const existingAllergens = await db.allergens.toArray();
      const newAllergenSet = new Set(allergens);
      for (const item of existingAllergens) {
        if (!newAllergenSet.has(item.name)) {
          await deleteRecordFromFirestore('allergens', item.name);
        }
      }
      for (const name of allergens) {
        await db.allergens.put({ name });
      }

      // Update global configs min_utility_margin for backwards compatibility if needed
      await db.globalConfigs.put({ key: 'min_utility_margin', value: Number(minProfit) || 0 });

      // Persist AI Copilot configurations (Groq / Gemini / Active Provider)
      if (groqApiKey.trim()) {
        setGroqApiKey(groqApiKey.trim());
        await saveSystemSetting('foodie_groq_api_key', groqApiKey.trim());
      }
      if (geminiApiKey.trim()) {
        setGeminiApiKey(geminiApiKey.trim());
        await saveSystemSetting('foodie_gemini_api_key', geminiApiKey.trim());
      }
      await saveSystemSetting('foodie_ai_provider', activeProvider);
      await saveSystemSetting('foodie_copilot_voice_enabled', voiceEnabled);
      setActiveAIProvider(activeProvider);
      setVoiceFeedbackEnabled(voiceEnabled);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('foodie-ai-key-updated', { detail: { provider: 'all' } }));
      }

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
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h1 className="text-xl font-black text-content leading-tight">Configuración del Sistema</h1>
          <p className="text-xs text-content-secondary mt-1">Parámetros globales y reglas operativas del Gastrobar.</p>
        </div>
        
        <div className="flex items-center gap-3">
          {isSaved && (
            <span className="text-success font-bold text-xs flex items-center gap-1 animate-bounce">
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

      {/* Personalización y Sistema de Diseño */}
      <div className="panel-card space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-line gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-content text-xl">palette</span>
            <div>
              <h3 className="text-sm font-black text-content uppercase tracking-wider">Personalización y Sistema de Diseño</h3>
              <p className="text-[11px] text-content-secondary">
                Configura el tema visual, paleta cromática de botones principales, tamaño de texto y contraste para este dispositivo.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider bg-canvas text-content-secondary px-2.5 py-1 rounded-full border border-line">
              {theme === 'dark' ? 'Oscuro' : 'Claro'} · {glassEnabled ? 'Glass' : 'Sólido'}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider bg-canvas text-content-secondary px-2.5 py-1 rounded-full border border-line">
              Acento: {accentColor.toUpperCase()}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider bg-canvas text-content-secondary px-2.5 py-1 rounded-full border border-line">
              {fontSize === 'compact' ? 'Compacto (90%)' : fontSize === 'normal' ? 'Normal (100%)' : fontSize === 'large' ? 'Grande (112%)' : 'X-Grande (125%)'}
            </span>
          </div>
        </div>

        {/* 1. Modo Visual (Oscuro / Claro) y Efecto Glass */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Selección de Tema Base */}
          <div className="p-4 rounded-xl border border-line bg-canvas/60 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-black uppercase text-content block">Tema Visual Base</span>
              <p className="text-[10px] text-content-secondary mt-0.5">
                {theme === 'dark' ? 'Modo Oscuro neutro puro (#0A0A0A)' : 'Modo Claro antirreflejo (#F1F5F9)'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-surface p-1 rounded-full border border-line shrink-0">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                  theme === 'dark'
                    ? 'bg-action text-action-text shadow-xs'
                    : 'text-content-secondary hover:text-content'
                }`}
              >
                <span className="material-symbols-outlined text-sm">dark_mode</span>
                Oscuro
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                  theme === 'light'
                    ? 'bg-action text-action-text shadow-xs'
                    : 'text-content-secondary hover:text-content'
                }`}
              >
                <span className="material-symbols-outlined text-sm">light_mode</span>
                Claro
              </button>
            </div>
          </div>

          {/* Switch Efecto Glass */}
          <div className="p-4 rounded-xl border border-line bg-canvas/60 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-content">Efecto Glass (Cristal)</span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                  glassEnabled
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-surface text-content-secondary border-line'
                }`}>
                  {glassEnabled ? 'ACTIVADO' : 'DESACTIVADO'}
                </span>
              </div>
              <p className="text-[10px] text-content-secondary mt-0.5">
                Desenfoque translúcido en barras y modales. Desactívalo para superficies sólidas 100% opacas.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={glassEnabled}
              aria-label="Activar o desactivar efecto Glass"
              onClick={() => setGlassEnabled(!glassEnabled)}
              className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none shrink-0 cursor-pointer border border-line ${
                glassEnabled ? 'bg-action' : 'bg-neutral-300 dark:bg-neutral-700'
              }`}
            >
              <div className={`h-4.5 w-4.5 rounded-full shadow-md transform transition-transform duration-200 ${
                glassEnabled ? 'translate-x-5 bg-action-text' : 'translate-x-0 bg-white'
              }`} />
            </button>
          </div>
        </div>

        {/* 2. Paleta de Color de Acento & Botones Principales */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black uppercase tracking-wider text-content flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">brush</span>
              Color de Botones Primarios y Acento del Sistema
            </label>
            <span className="text-[10px] text-content-secondary font-mono">
              6 paletas con ratio de contraste WCAG AA/AAA
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {[
              {
                id: 'cream' as AccentColor,
                name: 'Crema / Tinta',
                desc: 'Predeterminado POS',
                badgeBg: 'bg-[#F5EFE6]',
                badgeBorder: 'border-neutral-400',
                sampleClass: 'bg-[#F5EFE6] text-[#0A0A0A]',
              },
              {
                id: 'orange' as AccentColor,
                name: 'Naranja Fuego',
                desc: '#FF6B2C · Enérgico',
                badgeBg: 'bg-[#FF6B2C]',
                badgeBorder: 'border-orange-600',
                sampleClass: 'bg-[#FF6B2C] text-white',
              },
              {
                id: 'red' as AccentColor,
                name: 'Rojo Carmesí',
                desc: '#EF4444 · Gourmet',
                badgeBg: 'bg-[#EF4444]',
                badgeBorder: 'border-rose-600',
                sampleClass: 'bg-[#EF4444] text-white',
              },
              {
                id: 'violet' as AccentColor,
                name: 'Púrpura Eléctrico',
                desc: '#8F63F4 · Clásico',
                badgeBg: 'bg-[#8F63F4]',
                badgeBorder: 'border-purple-600',
                sampleClass: 'bg-[#8F63F4] text-white',
              },
              {
                id: 'blue' as AccentColor,
                name: 'Azul Cobalto',
                desc: '#3B82F6 · Tecnológico',
                badgeBg: 'bg-[#3B82F6]',
                badgeBorder: 'border-blue-600',
                sampleClass: 'bg-[#3B82F6] text-white',
              },
              {
                id: 'green' as AccentColor,
                name: 'Verde Esmeralda',
                desc: '#10B981 · Fresco',
                badgeBg: 'bg-[#10B981]',
                badgeBorder: 'border-emerald-600',
                sampleClass: 'bg-[#10B981] text-white',
              },
            ].map((acc) => {
              const isSelected = accentColor === acc.id;
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setAccentColor(acc.id)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                    isSelected
                      ? 'border-line-strong bg-surface ring-2 ring-content/25 shadow-md shadow-black/10'
                      : 'border-line bg-canvas/50 hover:bg-surface hover:border-line-strong'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`w-4 h-4 rounded-full ${acc.badgeBg} border ${acc.badgeBorder} shadow-xs shrink-0`} />
                    {isSelected && (
                      <span className="material-symbols-outlined text-sm font-black text-content">
                        check
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-black text-content block leading-tight">
                      {acc.name}
                    </span>
                    <span className="text-[10px] text-content-secondary block mt-0.5">
                      {acc.desc}
                    </span>
                  </div>
                  <div className={`mt-2.5 py-1 px-2 rounded-lg text-[9px] font-black text-center ${acc.sampleClass} shadow-xs`}>
                    Botón Demo
                  </div>
                </button>
              );
            })}
          </div>

          {(accentColor === 'orange' || accentColor === 'red') && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-center gap-2.5 text-xs text-amber-700 dark:text-amber-300">
              <span className="material-symbols-outlined text-base shrink-0">info</span>
              <span>
                <strong>Adaptación visual de cocina (KDS):</strong> Al seleccionar {accentColor === 'orange' ? 'Naranja' : 'Rojo'}, los temporizadores de comandas se muestran en ámbar/amarillo para evitar colisiones cromáticas con tus botones.
              </span>
            </div>
          )}
        </div>

        {/* 3. Tamaño de Tipografía y Nivel de Contraste */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-line">
          {/* Selector de Tamaño de Fuente */}
          <div className="p-4 rounded-xl border border-line bg-canvas/60 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black uppercase text-content block">Tamaño de Texto</span>
                <p className="text-[10px] text-content-secondary mt-0.5">
                  Escala de fuente global optimizada para pantallas táctiles y tablets.
                </p>
              </div>
              <span className="material-symbols-outlined text-content-secondary text-lg">format_size</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 bg-surface p-1 rounded-xl border border-line">
              {[
                { id: 'compact' as FontSize, label: '90%', title: 'Compacto' },
                { id: 'normal' as FontSize, label: '100%', title: 'Normal' },
                { id: 'large' as FontSize, label: '112%', title: 'Grande' },
                { id: 'xlarge' as FontSize, label: '125%', title: 'X-Grande' },
              ].map((sz) => {
                const isSelected = fontSize === sz.id;
                return (
                  <button
                    key={sz.id}
                    type="button"
                    onClick={() => setFontSize(sz.id)}
                    className={`py-2 px-1 rounded-lg text-center cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-action text-action-text font-black shadow-xs'
                        : 'text-content-secondary hover:text-content hover:bg-raised font-bold'
                    }`}
                  >
                    <span className="text-xs block leading-tight">{sz.label}</span>
                    <span className="text-[9px] block opacity-80 uppercase">{sz.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selector de Contraste */}
          <div className="p-4 rounded-xl border border-line bg-canvas/60 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black uppercase text-content block">Nivel de Contraste</span>
                <p className="text-[10px] text-content-secondary mt-0.5">
                  Cumplimiento de accesibilidad y refuerzo de bordes de interfaz.
                </p>
              </div>
              <span className="material-symbols-outlined text-content-secondary text-lg">contrast</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setContrast('normal')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                  contrast === 'normal'
                    ? 'border-line-strong bg-surface ring-2 ring-content/20 shadow-xs'
                    : 'border-line bg-surface/50 hover:bg-surface text-content-secondary'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black text-content">Estándar (AA)</span>
                  {contrast === 'normal' && <span className="material-symbols-outlined text-xs text-content">check</span>}
                </div>
                <p className="text-[10px] text-content-secondary">Transparencias suaves y contrastes naturales.</p>
              </button>

              <button
                type="button"
                onClick={() => setContrast('high')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                  contrast === 'high'
                    ? 'border-line-strong bg-surface ring-2 ring-content/20 shadow-xs'
                    : 'border-line bg-surface/50 hover:bg-surface text-content-secondary'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black text-content">Alto Contraste (AAA)</span>
                  {contrast === 'high' && <span className="material-symbols-outlined text-xs text-content">check</span>}
                </div>
                <p className="text-[10px] text-content-secondary">Bordes acentuados y fondos profundos hiperdefinidos.</p>
              </button>
            </div>
          </div>
        </div>

        {/* 4. Mini Vista Previa en Vivo */}
        <div className="p-4 rounded-xl border border-line bg-inset space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-content-secondary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">visibility</span>
              Vista Previa de Componentes POS con tu Configuración
            </span>
            <span className="text-[10px] font-mono text-content-secondary">
              Radio: 12px MD · Acento activo
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="p-3 bg-surface border border-line rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-content-secondary uppercase block">Botón Principal</span>
              <button
                type="button"
                className="w-full py-2 px-3 rounded-full bg-action text-action-text font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-sm">add_shopping_cart</span>
                Confirmar Comanda
              </button>
            </div>

            <div className="p-3 bg-surface border border-line rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-content-secondary uppercase block">Métrica Financiera</span>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-content">Hamburguesa Doble</span>
                <span className="text-sm font-black font-mono text-content">$32.500</span>
              </div>
              <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Stock: 48 disponibles
              </span>
            </div>

            <div className="p-3 bg-surface border border-line rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-content-secondary uppercase block">Control Operativo</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg border border-line bg-raised hover:bg-surface text-content text-xs font-bold transition-all cursor-pointer"
                >
                  Modificadores
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full bg-action text-action-text text-xs font-black shadow-xs cursor-pointer"
                >
                  Cobrar
                </button>
              </div>
            </div>
          </div>
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
            {/* Switch: Régimen Responsable de Impoconsumo */}
            <div className="p-3.5 rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)]/50 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-black uppercase text-[var(--text-primary)] tracking-wide">
                      Régimen Responsable de Impoconsumo
                    </label>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                      enableImpoconsumo 
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-500/10 text-content-secondary border border-slate-500/20'
                    }`}>
                      {enableImpoconsumo ? `ACTIVO (${ipoconsumo || 8}%)` : 'DESACTIVADO (0%)'}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] font-medium leading-tight">
                    Activa o desactiva el recaudo del 8% de Impoconsumo para restaurantes no responsables ante la DIAN
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={enableImpoconsumo}
                  onClick={async () => {
                    const nextVal = !enableImpoconsumo;
                    setEnableImpoconsumo(nextVal);
                    try {
                      await saveSystemSetting('enableImpoconsumo', nextVal);
                      await saveSystemSetting('impoconsumoRate', Number(ipoconsumo) || 8);
                      await saveSystemSetting('taxPercentage', nextVal ? (Number(ipoconsumo) || 8) : 0);
                      await saveSystemSetting('ipoconsumo_pct', nextVal ? (Number(ipoconsumo) || 8) : 0);
                      toast.success(
                        nextVal
                          ? `Régimen Responsable de Impoconsumo activado (${ipoconsumo || 8}%)`
                          : 'Impoconsumo desactivado (0% / Régimen No Responsable)'
                      );
                    } catch (err) {
                      console.error('Error al guardar régimen de impoconsumo:', err);
                      toast.error('Error al actualizar régimen de impoconsumo');
                    }
                  }}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent-purple)] shrink-0 cursor-pointer border-none ${
                    enableImpoconsumo ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div className={`bg-white h-5 w-5 rounded-full shadow-md transform transition-transform duration-200 ${
                    enableImpoconsumo ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>

            {/* Input Tasa Impoconsumo */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-black uppercase text-[var(--text-muted)] block">
                  Tasa de Impoconsumo Predeterminada (%)
                </label>
                {!enableImpoconsumo && (
                  <span className="text-[9px] font-bold text-amber-500 dark:text-amber-400">
                    Inhabilitado (Régimen No Responsable / 0%)
                  </span>
                )}
              </div>
              <input 
                type="number"
                disabled={!enableImpoconsumo}
                value={enableImpoconsumo ? ipoconsumo : 0}
                onChange={e => setIpoconsumo(Number(e.target.value) || 0)}
                className={`w-full rounded-xl border border-[var(--border-glow)] p-2.5 text-xs font-bold outline-none transition-all ${
                  enableImpoconsumo 
                    ? 'bg-[var(--bg-app)] text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--accent-purple)]' 
                    : 'bg-raised text-content-tertiary cursor-not-allowed opacity-60'
                }`}
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

        {/* Units of Measure and Equivalences */}
        <div className="panel-card space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-glow)]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-cyan-500">straighten</span>
              <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Unidades de Medida y Equivalencias Base</h3>
            </div>
            <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-app)] px-2.5 py-0.5 rounded-full border border-[var(--border-glow)]">
              {unitItems.length} {unitItems.length === 1 ? 'unidad configurada' : 'unidades configuradas'}
            </span>
          </div>

          <div className="space-y-4">
            <p className="text-[10px] text-[var(--text-muted)]">
              Configura las unidades de medida oficiales del sistema y su equivalencia base exacta (en gramos, mililitros o unidades). Podrás usarlas de forma 100% dinámica en compras, recetas e inventario.
            </p>

            {unitItems.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 text-center text-xs text-amber-600 dark:text-amber-400">
                <span className="material-symbols-outlined text-2xl block mb-1">warning</span>
                No hay unidades configuradas. Agrega unidades abajo para habilitarlas en los formularios.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-glow)] text-[9px] uppercase tracking-wider font-extrabold text-[var(--text-muted)]">
                      <th className="pb-2 pl-1">Unidad de Medida</th>
                      <th className="pb-2 px-2 text-right">Equivalencia Base (2 Dec.)</th>
                      <th className="pb-2 px-2">Unidad Base</th>
                      <th className="pb-2 pr-1 text-center w-12">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-glow)]">
                    {unitItems.map((item, index) => (
                      <tr key={item.id || index} className="group hover:bg-[var(--bg-app)]/50 transition-colors">
                        <td className="py-2 pl-1">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              const updated = [...unitItems];
                              updated[index] = { ...updated[index], name: e.target.value };
                              setUnitItems(updated);
                            }}
                            className="w-full bg-transparent font-bold text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent-purple)] rounded px-1.5 py-1"
                            placeholder="Nombre de la unidad"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            step="any"
                            value={item.baseEquivalence}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseFloat(e.target.value.replace(',', '.'));
                              const updated = [...unitItems];
                              updated[index] = { ...updated[index], baseEquivalence: isNaN(val) ? 0 : val };
                              setUnitItems(updated);
                            }}
                            className="w-28 text-right font-mono font-bold text-[var(--text-primary)] bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <select
                            value={item.baseUnit}
                            onChange={(e) => {
                              const updated = [...unitItems];
                              updated[index] = { ...updated[index], baseUnit: e.target.value };
                              setUnitItems(updated);
                            }}
                            className="bg-[var(--bg-app)] font-bold text-[var(--text-primary)] border border-[var(--border-glow)] rounded-lg px-2 py-1 outline-none text-xs"
                          >
                            <option value="g">g (Gramos)</option>
                            <option value="ml">ml (Mililitros)</option>
                            <option value="und">und (Unidades)</option>
                          </select>
                        </td>
                        <td className="py-2 pr-1 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setUnitItems(unitItems.filter((_, i) => i !== index));
                            }}
                            className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                            title="Eliminar unidad"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Quick Add New Unit */}
            <div className="p-3 bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-2xl space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] block">
                + Agregar Nueva Unidad de Medida
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <div className="sm:col-span-5">
                  <input
                    type="text"
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    placeholder="Ej. Libra, Botella 750ml, Caja"
                    className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-card)] text-[var(--text-primary)] p-2 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
                  />
                </div>
                <div className="sm:col-span-3">
                  <input
                    type="number"
                    step="0.01"
                    value={newUnitEquiv}
                    onChange={(e) => setNewUnitEquiv(e.target.value === '' ? '' : Number(Number(e.target.value).toFixed(2)))}
                    placeholder="Equiv. (ej. 453.59)"
                    className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-card)] text-[var(--text-primary)] p-2 text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)] text-right"
                  />
                </div>
                <div className="sm:col-span-2">
                  <select
                    value={newUnitBaseUnit}
                    onChange={(e) => setNewUnitBaseUnit(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-card)] text-[var(--text-primary)] p-2 text-xs font-bold outline-none"
                  >
                    <option value="g">g (Gramos)</option>
                    <option value="ml">ml (Mililitros)</option>
                    <option value="und">und (Unidades)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!newUnitName.trim()) return;
                      const equivNum = typeof newUnitEquiv === 'number' && newUnitEquiv > 0 ? Number(newUnitEquiv.toFixed(2)) : 1;
                      setUnitItems([
                        ...unitItems,
                        {
                          id: `unit-${Date.now()}-${newUnitName.trim()}`,
                          name: newUnitName.trim(),
                          baseEquivalence: equivNum,
                          baseUnit: newUnitBaseUnit
                        }
                      ]);
                      setNewUnitName('');
                      setNewUnitEquiv(1);
                    }}
                    className="w-full py-2 bg-gradient-to-r from-[var(--accent-purple)] to-purple-700 text-white text-xs font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    Agregar
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2">
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
                            className="p-1 bg-raised text-[var(--text-secondary)] rounded-lg cursor-pointer border-none flex items-center justify-center hover:bg-slate-350"
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
                                  className="px-2.5 py-1 bg-raised text-[var(--text-secondary)] font-bold rounded-md cursor-pointer border-none hover:bg-slate-350"
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
                          className="px-3 py-1.5 bg-raised text-[var(--text-secondary)] font-bold rounded-lg cursor-pointer border-none hover:bg-slate-350"
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
                          : 'bg-slate-500/10 text-slate-500 border-line-strong/30 hover:bg-slate-500/20'
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

        {/* Foodie Voice Copilot (Google Gemini & Groq Cloud AI) */}
        <div className="panel-card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
            <span className="material-symbols-outlined text-purple-500">auto_awesome</span>
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">
              Foodie Voice Copilot (Multi-Proveedor IA: Gemini / Groq)
            </h3>
          </div>

          <div className="space-y-4 text-left">
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Autollenado conversacional e inteligente de insumos y recetas por voz o texto con soporte multi-proveedor: <strong>Google Gemini Flash</strong> y <strong>Groq Cloud (GPT-OSS / Llama)</strong> con failover automático.
            </p>

            {/* Provider Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider">
                Proveedor Principal de IA
              </label>
              <select
                value={activeProvider}
                onChange={e => setActiveProviderLocal(e.target.value as AIProvider)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              >
                <option value="auto">⚡ Automático (Gemini Flash con fallback a Groq Cloud)</option>
                <option value="gemini">🔹 Google Gemini Flash (Google AI Studio)</option>
                <option value="groq">🚀 Groq Cloud (GPT-OSS 120B / GPT-OSS 20B Ultrarrápido)</option>
              </select>
            </div>

            {/* 1. Google Gemini API Key */}
            <div className="space-y-1.5 p-3 rounded-xl bg-[var(--bg-app)]/50 border border-[var(--border-glow)]">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider flex items-center gap-1">
                  <span>Google Gemini API Key</span>
                  {geminiApiKey && <span className="text-emerald-500 text-[9px] font-bold">● Configurada</span>}
                </label>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] text-[var(--accent-purple)] hover:underline font-bold">
                  Obtener clave gratis ↗
                </a>
              </div>
              <div className="flex gap-2">
                <input 
                  type={showApiKeyText ? "text" : "password"}
                  placeholder="Pega tu API Key de Google AI Studio..."
                  value={geminiApiKey}
                  onChange={e => {
                    const val = e.target.value;
                    setGeminiApiKeyLocal(val);
                    setTestResult(null);
                    if (val.trim()) {
                      setGeminiApiKey(val.trim());
                      saveSystemSetting('foodie_gemini_api_key', val.trim()).catch(() => {});
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('foodie-ai-key-updated', { detail: { provider: 'gemini', key: val.trim() } }));
                      }
                    }
                  }}
                  onBlur={() => {
                    const clean = geminiApiKey.trim();
                    if (clean) {
                      setGeminiApiKey(clean);
                      saveSystemSetting('foodie_gemini_api_key', clean).catch(() => {});
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('foodie-ai-key-updated', { detail: { provider: 'gemini', key: clean } }));
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2 text-xs font-mono outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKeyText(!showApiKeyText)}
                  className="px-2.5 bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
                  title={showApiKeyText ? "Ocultar clave Gemini" : "Mostrar clave Gemini"}
                  aria-label={showApiKeyText ? "Ocultar clave Gemini" : "Mostrar clave Gemini"}
                >
                  <span className="material-symbols-outlined text-base">
                    {showApiKeyText ? "visibility_off" : "visibility"}
                  </span>
                </button>
                <button 
                  type="button"
                  onClick={async () => {
                    const cleanKey = geminiApiKey.trim();
                    if (!cleanKey) {
                      toast.error('Ingresa una API Key de Gemini para probar.');
                      return;
                    }
                    setIsTestingKey(true);
                    setTestResult(null);
                    try {
                      const res = await testGeminiApiKey(cleanKey);
                      setTestResult(res);
                      if (res.success) {
                        setGeminiApiKey(cleanKey);
                        await saveSystemSetting('foodie_gemini_api_key', cleanKey);
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('foodie-ai-key-updated', { detail: { provider: 'gemini', key: cleanKey } }));
                        }
                        toast.success('✓ Conexión exitosa y API Key guardada automáticamente.');
                      } else {
                        toast.error(res.message, { duration: 5000 });
                      }
                    } finally {
                      setIsTestingKey(false);
                    }
                  }}
                  disabled={!geminiApiKey.trim() || isTestingKey}
                  data-testid="test-gemini-btn"
                  aria-label="Probar conexión con Gemini"
                  className="px-3 bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--accent-purple)] transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                >
                  {isTestingKey ? 'Probando...' : '🔍 Probar'}
                </button>
              </div>

              {testResult && (
                <div className={`p-2 rounded-lg text-[10.5px] border leading-relaxed ${testResult.success ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50' : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50'}`}>
                  {testResult.message}
                </div>
              )}
            </div>

            {/* 2. Groq Cloud API Key */}
            <div className="space-y-1.5 p-3 rounded-xl bg-[var(--bg-app)]/50 border border-[var(--border-glow)]">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider flex items-center gap-1">
                  <span>Groq Cloud API Key (GPT-OSS / Llama)</span>
                  {groqApiKey && <span className="text-emerald-500 text-[9px] font-bold">● Configurada</span>}
                </label>
                <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-[10px] text-orange-500 hover:underline font-bold flex items-center gap-0.5">
                  console.groq.com ↗
                </a>
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] leading-relaxed">
                Obtén tu clave gratuita en <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-orange-500 hover:underline font-bold">console.groq.com</a> para inferencia en tiempo real con modelos de alto rendimiento como OpenAI GPT-OSS (120B y 20B) sin costo.
              </p>
              <div className="flex gap-2">
                <input 
                  type={showGroqKeyText ? "text" : "password"}
                  placeholder="gsk_..."
                  value={groqApiKey}
                  onChange={e => {
                    const val = e.target.value;
                    setGroqApiKeyLocal(val);
                    setTestGroqResult(null);
                    if (val.trim()) {
                      setGroqApiKey(val.trim());
                      saveSystemSetting('foodie_groq_api_key', val.trim()).catch(() => {});
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('foodie-ai-key-updated', { detail: { provider: 'groq', key: val.trim() } }));
                      }
                    }
                  }}
                  onBlur={() => {
                    const clean = groqApiKey.trim();
                    if (clean) {
                      setGroqApiKey(clean);
                      saveSystemSetting('foodie_groq_api_key', clean).catch(() => {});
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('foodie-ai-key-updated', { detail: { provider: 'groq', key: clean } }));
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2 text-xs font-mono outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
                />
                <button
                  type="button"
                  onClick={() => setShowGroqKeyText(!showGroqKeyText)}
                  className="px-2.5 bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
                  title={showGroqKeyText ? "Ocultar clave Groq" : "Mostrar clave Groq"}
                  aria-label={showGroqKeyText ? "Ocultar clave Groq" : "Mostrar clave Groq"}
                >
                  <span className="material-symbols-outlined text-base">
                    {showGroqKeyText ? "visibility_off" : "visibility"}
                  </span>
                </button>
                <button 
                  type="button"
                  onClick={async () => {
                    const cleanKey = groqApiKey.trim();
                    if (!cleanKey) {
                      toast.error('Ingresa una API Key de Groq para probar.');
                      return;
                    }
                    setIsTestingGroqKey(true);
                    setTestGroqResult(null);
                    try {
                      const res = await testGroqApiKey(cleanKey);
                      setTestGroqResult(res);
                      if (res.success) {
                        // Inmediatamente persistir la clave válida para que Foodie Bot funcione al instante
                        setGroqApiKey(cleanKey);
                        await saveSystemSetting('foodie_groq_api_key', cleanKey);
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('foodie-ai-key-updated', { detail: { provider: 'groq', key: cleanKey } }));
                        }
                        toast.success(`${res.message} y API Key guardada automáticamente.`);
                      } else {
                        toast.error(res.message, { duration: 5000 });
                      }
                    } finally {
                      setIsTestingGroqKey(false);
                    }
                  }}
                  disabled={!groqApiKey.trim() || isTestingGroqKey}
                  data-testid="test-groq-btn"
                  aria-label="Probar conexión con Groq Cloud"
                  className="px-3 bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl text-[11px] font-bold text-[var(--text-secondary)] hover:text-orange-500 transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                >
                  {isTestingGroqKey ? 'Probando...' : '🔍 Probar'}
                </button>
              </div>

              {testGroqResult && (
                <div className="mt-2 animate-fade-in" data-testid="groq-test-result">
                  {testGroqResult.success ? (
                    <span 
                      data-testid="groq-success-badge"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-sm text-emerald-600 dark:text-emerald-400">check_circle</span>
                      <span>{testGroqResult.message}</span>
                    </span>
                  ) : (
                    <div 
                      data-testid="groq-error-card"
                      className="p-3 rounded-xl text-xs border leading-relaxed bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50 space-y-1.5"
                    >
                      <div className="font-bold flex items-center gap-1 text-rose-700 dark:text-rose-300">
                        <span className="material-symbols-outlined text-sm">error</span>
                        <span>✕ Error de conexión con Groq Cloud</span>
                      </div>
                      <p className="text-[11px]">{testGroqResult.message}</p>
                      {testGroqResult.details && (
                        <div className="mt-1.5 pt-1.5 border-t border-rose-200 dark:border-rose-900/60">
                          <span className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-rose-900 dark:text-rose-200">
                            Detalle del error retornado por Groq:
                          </span>
                          <pre className="p-2 rounded-lg bg-black/10 dark:bg-black/40 font-mono text-[10px] text-rose-900 dark:text-rose-200 overflow-x-auto whitespace-pre-wrap max-h-36">
                            {typeof testGroqResult.details === 'object' 
                              ? JSON.stringify(testGroqResult.details, null, 2) 
                              : String(testGroqResult.details)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <label className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-glow)] cursor-pointer">
              <input 
                type="checkbox"
                checked={voiceEnabled}
                onChange={e => setVoiceEnabledLocal(e.target.checked)}
                className="w-4 h-4 rounded text-[var(--accent-purple)] focus:ring-[var(--accent-purple)] border-[var(--border-glow)] bg-transparent cursor-pointer"
              />
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                Activar respuestas habladas por voz (Text-To-Speech del Copiloto)
              </span>
            </label>

            <div className="flex items-center justify-end pt-2">
              <button 
                type="button"
                onClick={async () => {
                  setGeminiApiKey(geminiApiKey);
                  setGroqApiKey(groqApiKey);
                  try {
                    await saveSystemSetting('foodie_groq_api_key', groqApiKey.trim());
                    await saveSystemSetting('foodie_gemini_api_key', geminiApiKey.trim());
                  } catch (dexieErr) {
                    console.warn('[settingsPanel] Error saving AI keys to Dexie:', dexieErr);
                  }
                  setActiveAIProvider(activeProvider);
                  setVoiceFeedbackEnabled(voiceEnabled);
                  toast.success('Configuración de Voice Copilot (Gemini / Groq) guardada con éxito.');
                }}
                className="btn-receitly-primary text-xs"
              >
                Guardar Configuración IA
              </button>
            </div>
          </div>
        </div>

        {/* Maintenance / Database Reset Zone */}
        <div className="panel-card col-span-1 md:col-span-2 space-y-6 border border-amber-500/30 dark:border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-transparent to-rose-500/5 p-6 rounded-3xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-glow)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <span className="material-symbols-outlined text-2xl">cleaning_services</span>
              </div>
              <div>
                <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                  Zona de Mantenimiento / Base de Datos
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase tracking-widest">
                    Administrador
                  </span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-medium">
                  Herramientas avanzadas de depuración, optimización y vaciado atómico de datos de prueba operacionales.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setPurgeCheckboxConfirmed(false);
                setShowPurgeModal(true);
              }}
              data-testid="btn-purge-operational-data"
              className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white font-bold text-xs uppercase tracking-wider rounded-full shadow-md shadow-rose-900/20 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-base">delete_forever</span>
              Purgar Datos de Prueba y Operacionales
            </button>
          </div>

          {/* Live Operational Counters */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider">
                Registros Transaccionales Actuales en Memoria Local (Dexie.js)
              </span>
              <span className="text-xs font-mono font-bold text-[var(--text-secondary)]">
                Total: <strong className="text-[var(--text-primary)] tabular-nums">{liveOperationalStats?.totalRecords ?? 0}</strong> registros
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <div className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)] flex flex-col items-center text-center">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Comandas / KDS</span>
                <span className="text-base font-black font-mono text-[var(--text-primary)] mt-1 tabular-nums">{liveOperationalStats?.orders ?? 0}</span>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)] flex flex-col items-center text-center">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Clientes</span>
                <span className="text-base font-black font-mono text-[var(--text-primary)] mt-1 tabular-nums">{liveOperationalStats?.customers ?? 0}</span>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)] flex flex-col items-center text-center">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Insumos Stock</span>
                <span className="text-base font-black font-mono text-[var(--text-primary)] mt-1 tabular-nums">{liveOperationalStats?.inventoryItems ?? 0}</span>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)] flex flex-col items-center text-center">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Kardex / Movs</span>
                <span className="text-base font-black font-mono text-[var(--text-primary)] mt-1 tabular-nums">{liveOperationalStats?.inventoryMovements ?? 0}</span>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)] flex flex-col items-center text-center">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Mermas / Pérdidas</span>
                <span className="text-base font-black font-mono text-[var(--text-primary)] mt-1 tabular-nums">{liveOperationalStats?.operationalLosses ?? 0}</span>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)] flex flex-col items-center text-center">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Cola Outbox</span>
                <span className="text-base font-black font-mono text-[var(--text-primary)] mt-1 tabular-nums">{liveOperationalStats?.syncOutbox ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Granular Scope Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-2">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-black text-xs uppercase tracking-wide">
                <span className="material-symbols-outlined text-sm">delete_sweep</span>
                Se eliminarán de forma permanente:
              </div>
              <ul className="text-[11px] text-[var(--text-secondary)] space-y-1 font-medium list-disc list-inside">
                <li>Comandas y órdenes de prueba (KDS Tickets).</li>
                <li>Clientes, reservaciones y proveedores de prueba.</li>
                <li>Inventario de insumos y movimientos de Kardex.</li>
                <li>Historial de mermas, pérdidas y alertas de stock.</li>
                <li>Mutaciones encoladas en outbox y métricas temporales.</li>
              </ul>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-black text-xs uppercase tracking-wide">
                <span className="material-symbols-outlined text-sm">verified_user</span>
                Se mantendrán estrictamente intactos:
              </div>
              <ul className="text-[11px] text-[var(--text-secondary)] space-y-1 font-medium list-disc list-inside">
                <li>Configuración del Sistema (Tasa impoconsumo, márgenes).</li>
                <li>Sedes del negocio (Branches - SSoT Malibu Gastrobar).</li>
                <li>Claves de API de Inteligencia Artificial (Groq y Gemini).</li>
                <li>Credenciales de Firebase y autenticación de usuario.</li>
                <li>Categorías maestras, alérgenos y distribución de salón.</li>
              </ul>
            </div>
          </div>
        </div>

      </div>

      {/* Double Confirmation Purge Modal */}
      {showPurgeModal && (
        <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-fade-in">
          <div 
            className="bg-[var(--bg-surface-raised)] border border-amber-500/30 rounded-3xl p-6 w-full max-w-lg shadow-2xl text-left transform transition-all duration-300 scale-100 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 shrink-0">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <div>
                <h3 className="font-black text-base text-[var(--text-primary)] uppercase tracking-wider">
                  Confirmar Purga de Datos de Prueba
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium leading-relaxed">
                  Esta acción eliminará pedidos, clientes, pérdidas operativas e inventario de prueba. La configuración y API keys se mantendrán intactas.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)] text-xs text-[var(--text-muted)] space-y-1">
              <p className="font-bold text-[var(--text-primary)]">
                Resumen de registros a vaciar:
              </p>
              <p>
                Se vaciarán <strong className="text-rose-500 tabular-nums">{liveOperationalStats?.totalRecords ?? 0} registros</strong> de las tablas operacionales (pedidos, clientes, insumos, pérdidas, alertas y outbox).
              </p>
            </div>

            <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 cursor-pointer">
              <input
                type="checkbox"
                data-testid="checkbox-purge-confirmation"
                checked={purgeCheckboxConfirmed}
                onChange={(e) => setPurgeCheckboxConfirmed(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-amber-500 focus:ring-amber-500 border-amber-500 bg-transparent cursor-pointer"
              />
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200 leading-snug">
                He verificado el alcance. Entiendo que los registros operacionales de prueba se vaciarán de inmediato y esta acción es irreversible.
              </span>
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isPurging}
                onClick={() => setShowPurgeModal(false)}
                className="px-5 py-2.5 bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold rounded-full uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!purgeCheckboxConfirmed || isPurging}
                onClick={async () => {
                  setIsPurging(true);
                  try {
                    const result = await resetOperationalData();
                    if (result.success) {
                      const cloudDeletedMsg = result.cloudPurgedStats && result.cloudPurgedStats.totalDeleted > 0
                        ? ` (${result.cloudPurgedStats.totalDeleted} en la nube Firestore)`
                        : '';
                      toast.success(
                        `Purga completada: ${result.clearedStats.totalRecords} registros operacionales eliminados${cloudDeletedMsg}. Configuración y API keys intactas.`,
                        { duration: 5000 }
                      );
                      setShowPurgeModal(false);
                      if (onNavigateToDashboard) {
                        onNavigateToDashboard();
                      } else {
                        setTimeout(() => {
                          window.location.reload();
                        }, 1200);
                      }
                    } else {
                      toast.error(`Error en la purga: ${result.error || 'Desconocido'}`);
                    }
                  } catch (err: any) {
                    toast.error(`Error inesperado: ${err?.message || String(err)}`);
                  } finally {
                    setIsPurging(false);
                  }
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white text-xs font-bold rounded-full uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-rose-900/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isPurging ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                    Purgando Base de Datos...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">delete_forever</span>
                    Confirmar y Purgar Datos
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
