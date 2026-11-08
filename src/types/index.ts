// src/types/index.ts

/**
 * Multi-sucursal Stock sub-schema
 */
export interface SucursalStock {
  sucursalId: string;
  stockActual: number;
  batchObservations?: string;
  lote?: string;
  fechaVencimiento?: string;
}

/**
 * ABC classification for inventory items
 */
export type AbcClassification = 'A' | 'B' | 'C';

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  purchaseUnit: string;
  purchaseUnitId?: string;
  countUnit: string;
  countUnitId?: string;
  yieldFactor: number;
  density: number;
  bottleTareWeightGrams: number;
  purchaseCost: number;
  averagePrice?: number;
  lastPurchasePrice?: number;
  gainPercentage: number;
  isTaxable: boolean;
  taxPercentage: number;
  stockMinLimit: number;
  stockMaxLimit?: number;
  minStock?: number; // Normalized alias for stockMinLimit
  maxStock?: number; // Normalized alias for stockMaxLimit
  theoreticalStock: number;
  realPhysicalStock: number;
  currentStock?: number; // Physical stock in warehouse/bodega (staging phase 1/2)
  reservedStock?: number; // Stock committed in active preparation orders (staged)
  availableStock?: number; // Calculated virtual stock: currentStock - reservedStock
  stockByBranch?: Record<string, number>; // Physical stock keyed by branch ID
  reservedStockByBranch?: Record<string, number>; // Reserved stock keyed by branch ID
  branchStocks?: Array<{ branchId: string; stock: number; reservedStock?: number }>;
  abcClassification: AbcClassification;
  supplierId: string;
  sucursalStock: SucursalStock[];
  updatedAt: string | number;
  resourceType?: 'ingredient' | 'product' | 'supply' | string;
  categoryId?: string;
  categoryName?: string;
  createdAt?: string | number;
  branchId?: string;
  inventoryType?: 'CONSUMABLE' | 'ASSET';
  fechaVencimiento?: string;
  lote?: string;
  conversionMultiplier?: number;
  conversionRatio?: number;
  usageUnit?: string;
  usageUnitId?: string;
  unitCostUsage?: number;
  equivalencia?: number;
  description?: string;
  sellPrice?: number;
  showInOnlineStore?: boolean;
  isActive?: boolean;
  operationZone?: 'Bar' | 'Cocina' | 'Batidos/Jugos' | 'General' | string;
  operationalZone?: 'cocina' | 'bar' | 'licuadoras' | 'salon_servicio' | 'general_operaciones' | string;
  supplyCategory?: 'Empaques / Desechables' | 'Decoración e Insumos de Barra' | 'Consumibles de Producción' | 'Aseo y Desinfección' | string;
  isPackagingDesechable?: boolean;
  img?: string;
  activo_catalogo?: boolean;
  isAvailableInCatalog?: boolean;
  mostrar_en_catalogo?: boolean;
  visible_tienda_online?: boolean;
  cantidadComprada?: number;
  precioCompra?: number;
  cantidadUtilizable?: number;
  usable_quantity?: number;
  usableQuantity?: number;
  mermaPercentage?: number;
  factorCorreccion?: number;
  costoUnitarioBruto?: number;
  costoUnitarioReal?: number;
  manejoLotes?: boolean;
  inventoryObservations?: string;
}

/**
 * Standard operational production and dispatch zones.
 */
export type OperationalZone = 'cocina' | 'bar' | 'licuadoras' | 'salon_servicio' | 'general_operaciones' | string;

/**
 * Specific typed inventory subtypes
 */
export interface Ingredient extends InventoryItem {
  operationalZone?: OperationalZone;
}

export interface UniqueProduct extends InventoryItem {
  operationalZone?: OperationalZone;
}

export interface Supply extends InventoryItem {
  operationalZone?: OperationalZone;
}

/**
 * Two-phase inventory staging: Stock reservation record
 */
export interface StockReservation {
  id: string; // e.g. "resv-ord-123-ins-456"
  orderId: string;
  ticketId?: string;
  itemId: string;
  itemName?: string;
  resourceType: 'ingredient' | 'product' | 'supply' | 'subrecipe_portion' | string;
  quantityReserved: number;
  unit: string;
  timestamp: string;
  status: 'staged' | 'committed' | 'released';
  branchId?: string;
  isSubRecipePortion?: boolean;
  subRecipeId?: string;
}

/**
 * Calculates current available stock for an inventory item (real physical stock minus committed reservations).
 */
export function getAvailableStock(item: InventoryItem): number {
  const real = item.currentStock !== undefined 
    ? item.currentStock 
    : (item.realPhysicalStock !== undefined ? item.realPhysicalStock : (item.theoreticalStock || 0));
  const reserved = item.reservedStock || 0;
  return Math.max(0, real - reserved);
}

/**
 * Gets real physical stock for an inventory item strictly in the specified branch/sucursal.
 * Includes resilience fallback to currentStock if stockByBranch is empty, undefined, or missing the active branch key.
 */
export function getPhysicalStockInBranch(item: InventoryItem, branchId?: string): number {
  if (!branchId) {
    return Number(
      item.currentStock !== undefined 
        ? item.currentStock 
        : (item.realPhysicalStock !== undefined ? item.realPhysicalStock : (item.theoreticalStock || 0))
    ) || 0;
  }
  
  const targetLower = branchId.toLowerCase().trim();

  // 1. Si item.stockByBranch existe: buscar coincidencia exacta de sede primero (sin sumar el fantasma 'main')
  if (item.stockByBranch) {
    const exactEntries = Object.entries(item.stockByBranch).filter(
      ([k]) => k.toLowerCase().trim() === targetLower
    );
    if (exactEntries.length > 0) {
      return Number(exactEntries[0][1]) || 0;
    }
    const mainFallback = Object.entries(item.stockByBranch).find(
      ([k]) => k.toLowerCase().trim() === 'main'
    );
    if (mainFallback) {
      return Number(mainFallback[1]) || 0;
    }
  }
  
  // 2. Revisar sucursalStock si existe: buscar coincidencia exacta de sede primero
  if (Array.isArray(item.sucursalStock) && item.sucursalStock.length > 0) {
    const exactSucursal = item.sucursalStock.find(
      s => s.sucursalId?.toLowerCase().trim() === targetLower
    );
    if (exactSucursal) {
      return Number(exactSucursal.stockActual) || 0;
    }
    const mainSucursal = item.sucursalStock.find(
      s => s.sucursalId?.toLowerCase().trim() === 'main'
    );
    if (mainSucursal) {
      return Number(mainSucursal.stockActual) || 0;
    }
  }

  // 3. Revisar branchStocks si existe
  const branchEntry = item.branchStocks?.find(
    b => b.branchId?.toLowerCase().trim() === targetLower
  ) || item.branchStocks?.find(
    b => b.branchId?.toLowerCase().trim() === 'main'
  );
  if (branchEntry && typeof branchEntry.stock === 'number') {
    return Number(branchEntry.stock);
  }

  // 4. FALLBACK DE RESILIENCIA: Si item.stockByBranch es indefinido o está vacío
  return Number(
    item.currentStock !== undefined 
      ? item.currentStock 
      : (item.realPhysicalStock !== undefined ? item.realPhysicalStock : (item.theoreticalStock || 0))
  ) || 0;
}

/**
 * Gets reserved (staged) stock for an inventory item strictly in the specified branch/sucursal.
 */
export function getReservedStockInBranch(item: InventoryItem, branchId?: string): number {
  if (!branchId) {
    return Number(item.reservedStock) || 0;
  }

  const targetLower = branchId.toLowerCase().trim();

  if (item.reservedStockByBranch) {
    const exactEntries = Object.entries(item.reservedStockByBranch).filter(
      ([k]) => k.toLowerCase().trim() === targetLower
    );
    if (exactEntries.length > 0) {
      return Number(exactEntries[0][1]) || 0;
    }
    const mainFallback = Object.entries(item.reservedStockByBranch).find(
      ([k]) => k.toLowerCase().trim() === 'main'
    );
    if (mainFallback) {
      return Number(mainFallback[1]) || 0;
    }
  }

  const branchEntry = item.branchStocks?.find(
    b => b.branchId?.toLowerCase().trim() === targetLower
  ) || item.branchStocks?.find(
    b => b.branchId?.toLowerCase().trim() === 'main'
  );
  if (branchEntry && typeof branchEntry.reservedStock === 'number') {
    return Number(branchEntry.reservedStock);
  }

  return 0;
}

/**
 * Calculates current available stock strictly in the specified branch/sucursal.
 */
export function getAvailableStockInBranch(item: InventoryItem, branchId?: string): number {
  const physical = getPhysicalStockInBranch(item, branchId);
  const reserved = getReservedStockInBranch(item, branchId);
  return Math.max(0, physical - reserved);
}

/**
 * Recipe Ingredient schema representing a component inside a Recipe
 */
export interface RecipeIngredient {
  inventoryItemId: string; // References InventoryItem.id or Recipe.id (for subrecipes)
  type: 'item' | 'subrecipe';
  quantity: number; // Quantity needed in countUnit (e.g., ml, g, units)
  unit: string; // e.g., "ml", "g", "und"
}

/**
 * BCG Matrix classification for menu items (Menu Engineering)
 */
export type BcgClassification = 'ESTRELLA' | 'CABALLO_DE_BATALLA' | 'ROMPECABEZAS' | 'PERRO';

/**
 * Recipe Schema (Fichas Técnicas & Ingeniería de Menú)
 * Representa recetas finales e intermedias (subrecetas).
 */
export interface Recipe {
  id: string; // e.g. "rec-gin-tonic-01"
  name: string;
  description?: string;
  category: 'BAR' | 'KITCHEN' | string;
  sellPrice: number; // Price charged to the customer
  costPrice: number; // Calculated cost based on ingredients and subrecipes
  yieldFactor: number; // e.g. 1.0 (factor de rendimiento de la receta final)
  cmvPercentage?: number; // Calculated dynamically: (costPrice / sellPrice) * 100
  bcgClassification?: BcgClassification | null;
  isStar?: boolean; // True if dish is configured as star dish
  ingredients: RecipeIngredient[];
  isSubRecipe: boolean; // true if this is an intermediate preparation (salsas, jarabes)
  updatedAt: string;
  allergens?: string[];
  prepTime?: number;
  difficulty?: 'Baja' | 'Media' | 'Alta' | string;
  steps?: string[];
  chefAdvice?: string;
  packaging?: Array<{ item: string; quantity: number; cost: number; channel?: 'dine_in' | 'delivery' }>;
  supplierId?: string;
  domesticPrice?: number;
  portionCost?: number;
  costPerUnit?: number;
  yieldQuantity?: number;
  yieldUnit?: string;
  img?: string;
  isCombo?: boolean;
  comboItems?: Array<{
    id: string;
    type: 'recipe' | 'item';
    quantity: number;
  }>;
  mostrar_en_catalogo?: boolean;
  productionZone?: string;
  activo_catalogo?: boolean;
  visible_tienda_online?: boolean;
  stockPortions?: number; // Real physical prepared portions in kitchen/bar
  reservedPortions?: number; // Portions committed in active staged comandas
  availablePortions?: number; // Calculated virtual portions: stockPortions - reservedPortions
  stockPortionsByBranch?: Record<string, number>; // Physical batch portions keyed by branch ID
  reservedPortionsByBranch?: Record<string, number>; // Reserved batch portions keyed by branch ID
  stockGrams?: number; // Real physical prepared grams in kitchen/bar
  stockGramsByBranch?: Record<string, number>; // Physical batch grams keyed by branch ID
}

/**
 * Gets real physical prepared portions for a subrecipe strictly in the specified branch.
 */
export function getSubRecipePhysicalPortionsInBranch(recipe: Recipe, branchId?: string): number {
  if (!branchId) {
    return recipe.stockPortions || 0;
  }
  const targetLower = branchId.toLowerCase().trim();
  if (recipe.stockPortionsByBranch) {
    const exactEntries = Object.entries(recipe.stockPortionsByBranch).filter(
      ([k]) => k.toLowerCase().trim() === targetLower
    );
    if (exactEntries.length > 0) {
      return Number(exactEntries[0][1]) || 0;
    }
    const mainFallback = Object.entries(recipe.stockPortionsByBranch).find(
      ([k]) => k.toLowerCase().trim() === 'main'
    );
    if (mainFallback) {
      return Number(mainFallback[1]) || 0;
    }
  }
  return recipe.stockPortions || 0;
}

/**
 * Gets reserved staged portions for a subrecipe strictly in the specified branch.
 */
export function getSubRecipeReservedPortionsInBranch(recipe: Recipe, branchId?: string): number {
  if (!branchId) {
    return recipe.reservedPortions || 0;
  }
  const targetLower = branchId.toLowerCase().trim();
  if (recipe.reservedPortionsByBranch) {
    const exactEntries = Object.entries(recipe.reservedPortionsByBranch).filter(
      ([k]) => k.toLowerCase().trim() === targetLower
    );
    if (exactEntries.length > 0) {
      return Number(exactEntries[0][1]) || 0;
    }
    const mainFallback = Object.entries(recipe.reservedPortionsByBranch).find(
      ([k]) => k.toLowerCase().trim() === 'main'
    );
    if (mainFallback) {
      return Number(mainFallback[1]) || 0;
    }
  }
  return recipe.reservedPortions || 0;
}

/**
 * Calculates current available prepared portions for a subrecipe strictly in the specified branch.
 */
export function getSubRecipeAvailablePortionsInBranch(recipe: Recipe, branchId?: string): number {
  const physical = getSubRecipePhysicalPortionsInBranch(recipe, branchId);
  const reserved = getSubRecipeReservedPortionsInBranch(recipe, branchId);
  return Math.max(0, physical - reserved);
}

/**
 * 5.2. LoyaltyPlan (Configuración de Redención y Puntos)
 */
export interface LoyaltyPlan {
  id: string; // e.g. "loy-plan-gastro-01"
  planName: string;
  valueToPointRatio: number; // e.g. 10000.00 (COP por 1 punto)
  pointValueWhenRedeemed: number; // e.g. 1500.00 (COP por punto redimido)
  minimumPurchaseToEarnPoints: number; // e.g. 50000.00
  pointsExpirationMonths: number; // e.g. 6
  sendWelcomeEmail: boolean;
  applyToAllCustomers: boolean;
  createdAt: string;
}

/**
 * Active days for promotions
 */
export interface ActiveDays {
  monday?: boolean; // Included in case of mixing English/Spanish keys
  lunes?: boolean;
  martes: boolean;
  miercoles: boolean;
  jueves: boolean;
  viernes: boolean;
  sabado: boolean;
  domingo: boolean;
}

/**
 * Type of discount in promotion rules
 */
export type DiscountType = 'PERCENTAGE' | 'FIXED_PRICE';

/**
 * Single promotion rule
 */
export interface PromotionRule {
  recipeId: string;
  discountType: DiscountType;
  discountValue: number; // 50.0 for 50%, or 15000.00 for fixed COP price
}

/**
 * 5.3. PromotionBook (Libros de Precios y Happy Hours)
 */
export interface PromotionBook {
  id: string; // e.g. "promo-happy-hour-01"
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  activeDays: ActiveDays;
  sucursalId: string; // e.g. "sede-norte-01"
  rules: PromotionRule[];
  isActive: boolean;
  updatedAt: string;
}

/**
 * 5.4. DailyBriefing (Briefing Diario Rotativo)
 */
export interface DailyBriefing {
  id: string; // e.g. "brief-2026-06-08"
  date: string; // YYYY-MM-DD
  briefingLeaderId: string; // waiter id, e.g. "user-mesero-camilo"
  salesTarget: number; // Expected sales COP, e.g. 4500000.00
  targetTicketPerPerson: number; // Target average ticket, e.g. 35000.00
  promotedRecipeId: string; // Recipe to push, e.g. "rec-gin-tonic-01"
  notifiedShortages: string[]; // List of recipe IDs that are blocked due to stockout
  attendees: string[]; // Waiter/staff IDs present
  misticaApproved: boolean; // Completed briefing requirements checklist
  completedAt: string;
}

/**
 * Status of individual item in KdsOrderTicket
 */
export type KdsItemStatus = 'PENDING' | 'PREPARING' | 'COOKING' | 'COMPLETED' | 'DELIVERED';

/**
 * Overall status of the comanda/order in KDS
 */
export type KdsOverallStatus = 'ORDEN TOMADA' | 'PREPARANDO' | 'LISTO PARA MESERO' | 'ENTREGADO A MESA' | 'CERRADA' | 'CANCELADA';

/**
 * Item in a Comanda/KdsOrderTicket
 */
export interface KdsOrderTicketItem {
  recipeId: string;
  name: string;
  category: 'BAR' | 'KITCHEN' | string;
  quantity: number;
  modifiers: string[];
  status: KdsItemStatus;
  prepStartedAt?: string | null;
  completedAt: string | null;
  consumed?: boolean;
  seatNumber?: number;
  operationZone?: string;
  ronda?: number;
  sent?: boolean;
}

/**
 * 5.5. KdsOrderTicket (Comanda KDS / Barra)
 */
export interface KdsOrderTicket {
  id: string; // e.g. "kds-20260608-0192"
  orderId: string; // e.g. "ord-20260608-0192"
  tableId: number | string | null; // e.g. 14, 'T1' or null for Takeaway
  clientId?: string;
  orderType?: 'DINE_IN' | 'TAKEAWAY';
  paxCount: number; // e.g. 4
  waiterId: string; // e.g. "user-mesero-camilo"
  comandaTime: string; // ISO date string
  timeLimitMinutes: number; // e.g. 15
  isRushHourOrder: boolean;
  items: KdsOrderTicketItem[];
  overallStatus: KdsOverallStatus;
  createdAt?: string;
  prepStartedAt?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  reserva_activa?: boolean;
  reserva_id?: string;
  cancelJustification?: string;
  closedAt?: string;
  branchId?: string; // Active branch ID (e.g. SEDE-SAN-AGUST-N-2044)
  sucursalId?: string; // Sede alias
}

export interface KdsProductPrepHistory {
  id: string; // `${ticketId}-${itemIndex}` or a unique ID
  ticketId: string;
  orderId: string;
  tableId: number | string | null;
  waiterId: string;
  comandaTime: string; // ISO date string
  recipeId: string;
  name: string;
  quantity: number;
  station: 'Cocina' | 'Bar' | 'Batidos' | string;
  prepStartedAt: string | null;
  prepCompletedAt: string | null;
  prepDurationSeconds: number;
  status: string; // e.g. COMPLETED
  wasEfficient: boolean;
  createdAt?: string;
}

export interface KdsLowStockAlertsHistory {
  id: string;
  timestamp: string; // ISO date string
  productId: string;
  productName: string;
  station: 'Cocina' | 'Bar' | 'Batidos' | string;
  theoreticalStock: number;
  stockMinLimit: number;
  createdAt?: string;
}

/**
 * Item in OrderPaidPayload
 */
export interface OrderPaidItem {
  recipeId: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Customer metadata for invoicing
 */
export interface ClientData {
  name: string;
  email: string;
  taxId?: string; // NIT / RUT (Colombia)
}

/**
 * Payload for the OrderPaid event
 */
export interface OrderPaidPayload {
  orderId: string;
  tableId: number | string | null;
  waiterId: string;
  totalAmount: number;
  netAmountBeforeTax: number;
  taxAmount: number;
  paymentMethod: 'Tarjeta Debito' | 'Tarjeta Credito' | 'Efectivo' | 'Transferencia' | string;
  items: OrderPaidItem[];
  clientData?: ClientData;
}

/**
 * Payloads for other domain events
 */
export interface SubscriptionUpdatedPayload {
  tenantId: string;
  activeModules: string[];
  planLevel: 'BASIC' | 'PRO' | 'ENTERPRISE';
  updatedAt: string;
}

export interface InventoryItemUpdatedPayload {
  itemId: string;
  action: 'PURCHASE' | 'WASTE' | 'PRODUCTION' | 'ADJUSTMENT';
  quantityChanged: number;
  newTheoreticalStock: number;
  newRealPhysicalStock?: number;
  updatedAt: string;
}

export interface HaccpAlertTriggeredPayload {
  equipmentId: string;
  equipmentName: string;
  recordedTemperature: number;
  criticalLimit: number;
  timestamp: string;
  status: 'WARNING' | 'CRITICAL';
}

export interface PurchaseOcrScannedPayload {
  invoiceId: string;
  supplierName: string;
  invoiceDate: string;
  totalAmount: number;
  taxAmount: number;
  extractedItems: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    totalCost: number;
    matchedInventoryItemId?: string;
  }>;
}

/**
 * Sync status for the outbox events queue
 */
export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * 5.6. DomainOutbox (Cola de Eventos Offline)
 */
export interface DomainOutbox {
  eventId: string; // e.g. "evt-evt-orderpaid-10029"
  eventType: 'OrderPaid' | 'OrderPlaced' | 'SubscriptionUpdated' | 'InventoryItemUpdated' | 'HaccpAlertTriggered' | 'PurchaseOcrScanned' | string;
  payload: OrderPaidPayload | SubscriptionUpdatedPayload | InventoryItemUpdatedPayload | HaccpAlertTriggeredPayload | PurchaseOcrScannedPayload | any;
  status: OutboxStatus;
  createdAt: string;
  syncedAt: string | null;
}

/**
 * Global Configuration for POS Settings
 */
export interface GlobalConfig {
  key: string;
  value: any;
}

/**
 * Allergen tags
 */
export interface Allergen {
  name: string;
}

/**
 * System configuration settings
 */
export interface SystemSetting {
  key: string;
  value: any;
  updatedAt?: string;
}

export * from './settings';

export interface UnitItemConfig {
  name: string;
  baseEquivalence: number;
  baseUnit: 'g' | 'ml' | 'und' | string;
}

/**
 * Global application parameters config structure
 */
export interface SystemSettingsConfig {
  taxPercentage: number;
  operationalCostPercentage: number;
  safetyMarginPercentage: number;
  ipoconsumo_pct: number;
  error_margin_pct: number;
  min_utility_margin: number;
  kds_urgent_threshold_minutes: number;
  official_units: string[];
  unit_equivalences?: Record<string, { baseEquivalence: number; baseUnit: string }>;
  master_categories: string[];
  master_allergens: string[];
  required_fields: {
    name: boolean;
    category: boolean;
    sellPrice: boolean;
    ingredients: boolean;
    description: boolean;
    steps: boolean;
    chefAdvice: boolean;
    image: boolean;
  };
}

/**
 * Physical Break Audit sub-schema
 */
export interface AssetBreakAudit {
  date: string;
  qtyDiscarded: number;
  reason: string;
}

/**
 * Fixed Asset & Furniture schema
 */
export interface FixedAsset {
  id: string; // SKU or Internal inventory code
  name: string;
  category: 'Electrodomésticos / Maquinaria' | 'Menaje / Cristalería' | 'Mobiliario' | 'Ambientación' | string;
  location: 'Salón' | 'Cocina' | 'Barra' | 'Terraza' | string;
  purchaseDate: string; // YYYY-MM-DD
  purchaseCost: number;
  status: 'Operativo' | 'En Mantenimiento' | 'Requiere Revisión Urgentemente' | string;
  description?: string;
  image?: string;
  unitOfMeasure?: string;
  stockActual: number;
  stockMinLimit: number;
  supplierId?: string;
  sucursalId?: string;
  updatedAt: string;

  // Category-specific properties (flexible)
  brand?: string;
  model?: string;
  serialNumber?: string;
  voltage?: string;

  materialType?: string;
  capacity?: string;
  breaksAudit?: AssetBreakAudit[];

  // Preventive Maintenance Alerting
  nextMaintenanceDate?: string; // YYYY-MM-DD
  maintenanceType?: 'Preventivo' | 'Correctivo' | string;
  alertFrequency?: 'Mensual' | 'Trimestral' | 'Semestral' | string;
  technicianRemarks?: string;
}

/**
 * Damage & Incident Report schema
 */
export interface DamageReport {
  id: string;
  assetId: string;
  assetName: string;
  discoveryDate: string;
  discoveryTime: string;
  severity: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRÍTICA' | string;
  description: string;
  affectsOperation: boolean;
  recommendedAction: string;
  image?: string;
  createdAt: string;
}

/**
 * Supplier entity representing a raw materials/packaging provider
 */
export interface Supplier {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone?: string;
  paymentTerms: string;
  categoriesSupplied: string[];
  updatedAt: string;
}

export interface OperationalLoss {
  id: string;
  ticketId: string;
  recipeId: string;
  name: string;
  quantity: number;
  cost: number;
  reason: string;
  cancelledAt: string;
  waiterId: string;
  user?: string;
  operationZone?: string;
}
export interface SupplierIncident {
  id: string;
  supplierId: string;
  itemId: string;
  invoiceNumber: string;
  quality: 'Excelente' | 'Aceptable' | 'Defectuoso';
  comment?: string;
  photoUrl?: string; // photo evidence
  recordedAt: string;
}

export interface InventoryLog {
  id: string;
  itemId: string;
  itemName: string;
  type: 'Ajuste' | 'Venta' | 'Compra' | 'PURCHASE' | string;
  quantity: number; // positive or negative
  reason?: string; // e.g. Vencimiento, Daño, Error, Cortesía, Merma, etc.
  user: string; // e.g. "Admin", "Mesero", "Foodie Bot", etc.
  timestamp: string;
  unitPrice?: number;
  total?: number;
  supplierId?: string;
  previousCost?: number;
  newCost?: number;
  synced?: boolean;
  branchId?: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  address: string;
  electronicInvoice: boolean;
  email?: string;
  taxId?: string; // NIT o Cédula
  createdAt: string;
}

export interface Reservation {
  id: string;
  tableId: string; // e.g. "M1"
  clientName: string;
  clientId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  reason: string; // Cumpleaños, Aniversario, etc.
  notes?: string;
  decoration?: string;
  pax: number;
  status: 'PENDING' | 'IN_SERVICE' | 'COMPLETED';
  createdAt: string;
}

export interface NotificationTrigger {
  id: string;
  type: 'RESERVATION_REMINDER';
  targetType: 'RESERVATION';
  targetId: string;
  title: string;
  message: string;
  scheduledAt: string; // ISO date string
  status: 'PENDING' | 'SENT';
  createdAt: string;
}

export interface TableLayout {
  id: string;
  name: string;
  description?: string;
  capacity: number;
  zone: string;
}

export interface OperatingZone {
  name: string;
  orden: number;
  isDefault?: boolean;
}

/**
 * [US-09] Alertas de Stock Crítico y Generación Automática de Órdenes de Compra Sugeridas
 */
export interface PurchaseOrderItem {
  itemId: string;
  name: string;
  quantity: number; // suggestedQuantity
  unit: string;
  unitCost: number;
  estimatedCost: number;
  currentStock: number;
  availableStock: number;
  minStock: number;
  maxStock: number;
  priority: 1 | 2; // 1: Rojo / Agotado, 2: Ámbar / Mínimo
}

export interface PurchaseOrder {
  id: string; // e.g. "po-draft-1718000000-xyz"
  supplierId: string; // supplier ID or 'POR DEFINIR'
  supplierName: string;
  status: 'DRAFT' | 'PENDING' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';
  items: PurchaseOrderItem[];
  totalEstimatedCost: number;
  itemsCount: number;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  branchId?: string;
  createdBy?: string;
  receivedAt?: string;
  invoiceNumber?: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

