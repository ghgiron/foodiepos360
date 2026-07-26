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

/**
 * 5.1. InventoryItem (Insumos Maestro con Logistics & Costeo)
 * Representa insumos generales y licores (con tara, densidad, etc. para pesaje).
 */
export interface InventoryItem {
  id: string; // e.g. "ins-lic-gin-001"
  name: string;
  category: 'Licores' | 'Abarrotes' | 'Carnes' | 'Verduras' | string;
  purchaseUnit: string; // e.g. "Botella 750ml"
  countUnit: string; // e.g. "ml", "g", "unidad"
  yieldFactor: number; // e.g. 1.0 (factor de rendimiento)
  density: number; // e.g. 0.94 (densidad para licores, agua = 1.0)
  bottleTareWeightGrams: number; // e.g. 450.0 (peso de botella vacía)
  purchaseCost: number; // e.g. 95000.00 (costo de compra)
  averagePrice?: number; // e.g. 92000.00 (precio promedio acumulado)
  gainPercentage: number; // e.g. 220.0 (porcentaje de ganancia deseado)
  isTaxable: boolean;
  taxPercentage: number; // e.g. 8.0 (Impoconsumo o IVA)
  stockMinLimit: number; // e.g. 2250.0 (ml, g, o unidades mínimas)
  theoreticalStock: number; // e.g. 5250.0 (ml, g, o unidades teóricas)
  realPhysicalStock: number; // e.g. 5000.0 (ml, g, o unidades reales medidas)
  abcClassification: AbcClassification;
  supplierId: string; // e.g. "prov-diageo-colombia"
  sucursalStock: SucursalStock[];
  updatedAt: string; // ISO date string
  inventoryType?: 'CONSUMABLE' | 'ASSET';
  stockMaxLimit?: number;
  fechaVencimiento?: string; // YYYY-MM-DD
  conversionMultiplier?: number;
  description?: string;
  sellPrice?: number;
  showInOnlineStore?: boolean;
  isActive?: boolean;
  operationZone?: 'Bar' | 'Cocina' | 'Batidos/Jugos' | 'General' | string;
  supplyCategory?: 'Empaques / Desechables' | 'Decoración e Insumos de Barra' | 'Consumibles de Producción' | 'Aseo y Desinfección' | string;
  isPackagingDesechable?: boolean;
  img?: string;
  activo_catalogo?: boolean;
  visible_tienda_online?: boolean;
  cantidadComprada?: number;
  cantidadUtilizable?: number;
  mermaPercentage?: number;
  factorCorreccion?: number;
  costoUnitarioBruto?: number;
  costoUnitarioReal?: number;
  manejoLotes?: boolean;
  inventoryObservations?: string;
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
  ingredients: RecipeIngredient[];
  isSubRecipe: boolean; // true if this is an intermediate preparation (salsas, jarabes)
  updatedAt: string;
  allergens?: string[];
  prepTime?: number;
  difficulty?: 'Baja' | 'Media' | 'Alta' | string;
  steps?: string[];
  chefAdvice?: string;
  packaging?: Array<{ item: string; quantity: number; cost: number }>;
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
  type: 'Ajuste' | 'Venta' | 'Compra' | string;
  quantity: number; // positive or negative
  reason?: string; // e.g. Vencimiento, Daño, Error, Cortesía, Merma, etc.
  user: string; // e.g. "Admin", "Mesero", etc.
  timestamp: string;
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
