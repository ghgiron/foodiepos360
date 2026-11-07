// src/types/voiceCopilot.ts

export type CopilotContextMode = 'DASHBOARD' | 'ONBOARDING' | 'INGREDIENT' | 'PRODUCT' | 'SUPPLY';

export type OperationIntentType = 'RESTOCK' | 'NEW_ITEM';

export interface ExistingItemMatchInfo {
  id: string;
  name: string;
  currentStock: number;
  newCalculatedStock: number;
  addedStock: number;
  previousCost: number;
  newUnitCost: number;
  weightedAverageCost: number;
  costDifference: number; // newUnitCost - previousCost
  unit: string;
  supplierId?: string;
  supplierName?: string;
  category?: string;
}

export interface VoiceIngredientExtraction {
  id?: string;
  name?: string;
  category?: string;
  supplier_id?: string;
  supplier_name?: string;
  supplier_name_to_create?: string;
  purchase_price?: number;
  sale_price?: number;
  package_units?: number;
  operation_zone?: string;
  operationalZone?: string;
  purchase_unit?: string;
  purchase_quantity?: number;
  use_unit?: string;
  conversion_multiplier?: number;
  usable_quantity?: number;
  waste_percentage?: number;
  description?: string;
  density?: number;
  bottle_tare_weight?: number;
  stock_min_limit?: number;
  stock_max_limit?: number;
  fecha_vencimiento?: string;
  missing_fields: string[];
  follow_up_question: string;
  is_complete: boolean;
  command_action?: 'CONFIRM_SAVE' | 'CLEAR_FORM' | 'NAVIGATE' | 'NONE';
  navigation_target?: CopilotContextMode;
  query_response?: string;
  reasoning?: string;

  // Real-time Matching & Restock Detection
  intent_type?: OperationIntentType;
  existing_match?: ExistingItemMatchInfo;
}

export interface CopilotMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  extraction?: VoiceIngredientExtraction;
  isAudioPlaying?: boolean;
  showSettingsButton?: boolean;
}

export interface CopilotStockItem {
  id: string;
  name: string;
  stock: number;
  unit: string;
  minLimit?: number;
  category?: string;
  operationZone?: string;
}

export interface CopilotContextData {
  mode?: CopilotContextMode;
  existingCategories?: string[];
  existingSuppliers?: Array<{ id: string; name: string }>;
  configuredUnits?: Array<{ name: string; baseEquivalence: number; baseUnit: string }>;
  currentStockItems?: CopilotStockItem[];
  currentFormState?: {
    name?: string;
    category?: string;
    supplierId?: string;
    purchaseCost?: number | '';
    salePrice?: number | '';
    purchaseUnit?: string;
    countUnit?: string;
    cantidadComprada?: number | '';
    conversionMultiplier?: number | '';
    cantidadUtilizable?: number | '';
    packageUnits?: number | '';
    stockMinLimit?: number | '';
    stockMaxLimit?: number | '';
    operationZone?: string;
    description?: string;
    [key: string]: any;
  };
}
