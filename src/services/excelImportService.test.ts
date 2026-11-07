// src/services/excelImportService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { 
  mapExcelLineaToOperationalZone, 
  parseExcelNumber, 
  normalizeExcelProductRow, 
  parseDelimitedTextToRows,
  normalizeUnitOfMeasure,
  normalizeUnit,
  normalizeUnitId,
  classifyInventoryLine,
  detectResourceType,
  inferInventoryCategory,
  INVENTORY_CATEGORY_RULES,
  calculateCostingMetrics,
  parseInventoryExcel,
  commitInventoryExcelImport,
  processInventoryExcel,
  convertQuantity,
  extractQuantityAndUnit,
  type ExcelProductRawRow
} from './excelImportService';
import { 
  STANDARDIZED_OPERATIONAL_ZONES,
  getOperationalZoneLabel 
} from '../utils/operationalZones';
import { db } from '../db/localDb';

vi.mock('../db/localDb', () => {
  const inventoryItemsStore: any[] = [];
  const suppliersStore: any[] = [];
  const syncOutboxStore: any[] = [];
  const categoriesStore: any[] = [];

  return {
    db: {
      inventoryItems: {
        get: vi.fn(async (id: string) => inventoryItemsStore.find(i => i.id === id) || null),
        toArray: vi.fn(async () => [...inventoryItemsStore]),
        put: vi.fn(async (item: any) => {
          const idx = inventoryItemsStore.findIndex(i => i.id === item.id);
          if (idx >= 0) inventoryItemsStore[idx] = item;
          else inventoryItemsStore.push(item);
          return item.id;
        }),
        bulkPut: vi.fn(async (items: any[]) => {
          items.forEach(item => {
            const idx = inventoryItemsStore.findIndex(i => i.id === item.id);
            if (idx >= 0) inventoryItemsStore[idx] = item;
            else inventoryItemsStore.push(item);
          });
        }),
        add: vi.fn(async (item: any) => {
          inventoryItemsStore.push(item);
          return item.id;
        })
      },
      suppliers: {
        toArray: vi.fn(async () => [...suppliersStore]),
        bulkPut: vi.fn(async (suppliers: any[]) => {
          suppliers.forEach(s => {
            const idx = suppliersStore.findIndex(item => item.id === s.id);
            if (idx >= 0) suppliersStore[idx] = s;
            else suppliersStore.push(s);
          });
        }),
        put: vi.fn(async (s: any) => {
          suppliersStore.push(s);
          return s.id;
        })
      },
      categories: {
        get: vi.fn(async (id: string) => categoriesStore.find(c => c.id === id) || null),
        toArray: vi.fn(async () => [...categoriesStore]),
        put: vi.fn(async (cat: any) => {
          const idx = categoriesStore.findIndex(c => c.id === cat.id);
          if (idx >= 0) categoriesStore[idx] = cat;
          else categoriesStore.push(cat);
          return cat.id;
        }),
        bulkPut: vi.fn(async (cats: any[]) => {
          cats.forEach(c => {
            const idx = categoriesStore.findIndex(item => item.id === c.id);
            if (idx >= 0) categoriesStore[idx] = c;
            else categoriesStore.push(c);
          });
        })
      },
      ingredientCategories: {
        put: vi.fn(),
        bulkPut: vi.fn()
      },
      supplyCategories: {
        put: vi.fn(),
        bulkPut: vi.fn()
      },
      menuCategories: {
        put: vi.fn(),
        bulkPut: vi.fn()
      },
      sync_outbox: {
        add: vi.fn(async (ev: any) => syncOutboxStore.push(ev))
      },
      transaction: vi.fn(async (_mode, _tables, callback) => callback())
    },
    enqueueOfflineEvent: vi.fn(async (type, payload) => {
      syncOutboxStore.push({ type, payload });
      return 'evt-123';
    })
  };
});

describe('Operational Zones & Excel Import Mapping', () => {
  describe('mapExcelLineaToOperationalZone & normalizeOperationalZone', () => {
    it('maps Cocina to cocina', () => {
      expect(mapExcelLineaToOperationalZone('Cocina')).toBe('cocina');
      expect(mapExcelLineaToOperationalZone('cocina')).toBe('cocina');
      expect(mapExcelLineaToOperationalZone('Línea Cocina')).toBe('cocina');
      expect(mapExcelLineaToOperationalZone('COCINA')).toBe('cocina');
    });

    it('maps Bar and Barra to bar', () => {
      expect(mapExcelLineaToOperationalZone('Bar')).toBe('bar');
      expect(mapExcelLineaToOperationalZone('Barra')).toBe('bar');
      expect(mapExcelLineaToOperationalZone('bar')).toBe('bar');
      expect(mapExcelLineaToOperationalZone('BAR')).toBe('bar');
      expect(mapExcelLineaToOperationalZone('Licores')).toBe('bar');
    });

    it('maps Batidos and Bar - Batidos to licuadoras', () => {
      expect(mapExcelLineaToOperationalZone('Batidos')).toBe('licuadoras');
      expect(mapExcelLineaToOperationalZone('Bar - Batidos')).toBe('licuadoras');
      expect(mapExcelLineaToOperationalZone('licuadoras')).toBe('licuadoras');
      expect(mapExcelLineaToOperationalZone('Smoothies')).toBe('licuadoras');
      expect(mapExcelLineaToOperationalZone('BATIDOS')).toBe('licuadoras');
    });

    it('maps Suministros, Domicilios, and Otros to general_operaciones', () => {
      expect(mapExcelLineaToOperationalZone('Suministros')).toBe('general_operaciones');
      expect(mapExcelLineaToOperationalZone('Domicilios')).toBe('general_operaciones');
      expect(mapExcelLineaToOperationalZone('Otros')).toBe('general_operaciones');
      expect(mapExcelLineaToOperationalZone('Almacén')).toBe('general_operaciones');
      expect(mapExcelLineaToOperationalZone('Bodega')).toBe('general_operaciones');
      expect(mapExcelLineaToOperationalZone('')).toBe('general_operaciones');
      expect(mapExcelLineaToOperationalZone(null)).toBe('general_operaciones');
      expect(mapExcelLineaToOperationalZone(undefined)).toBe('general_operaciones');
    });

    it('maps salon and servicio to salon_servicio', () => {
      expect(mapExcelLineaToOperationalZone('Salón')).toBe('salon_servicio');
      expect(mapExcelLineaToOperationalZone('Servicio')).toBe('salon_servicio');
      expect(mapExcelLineaToOperationalZone('Mesas')).toBe('salon_servicio');
    });
  });

  describe('STANDARDIZED_OPERATIONAL_ZONES & labels', () => {
    it('defines all 5 standardized operational zones with labels and icons', () => {
      const keys = STANDARDIZED_OPERATIONAL_ZONES.map(z => z.value);
      expect(keys).toEqual(['cocina', 'bar', 'licuadoras', 'salon_servicio', 'general_operaciones']);

      expect(getOperationalZoneLabel('cocina')).toBe('Cocina');
      expect(getOperationalZoneLabel('bar')).toBe('Bar');
      expect(getOperationalZoneLabel('licuadoras')).toBe('Licuadoras / Batidos');
      expect(getOperationalZoneLabel('salon_servicio')).toBe('Salón y Servicio');
      expect(getOperationalZoneLabel('general_operaciones')).toBe('General / Almacén / Suministros');
    });
  });

  describe('Unit and classification normalization', () => {
    it('normalizes units of measure correctly', () => {
      expect(normalizeUnitOfMeasure('gramos')).toBe('gr');
      expect(normalizeUnitOfMeasure('G')).toBe('gr');
      expect(normalizeUnitOfMeasure('ml')).toBe('ml');
      expect(normalizeUnitOfMeasure('mililitros')).toBe('ml');
      expect(normalizeUnitOfMeasure('oz')).toBe('oz');
      expect(normalizeUnitOfMeasure('onzas')).toBe('oz');
      expect(normalizeUnitOfMeasure('unidad')).toBe('und');
      expect(normalizeUnitOfMeasure('und')).toBe('und');
    });

    it('classifies lines into ingredient, product, or supply', () => {
      expect(classifyInventoryLine('Cocina')).toBe('ingredient');
      expect(classifyInventoryLine('Batidos')).toBe('ingredient');
      expect(classifyInventoryLine('Suministros')).toBe('supply');
      expect(classifyInventoryLine('Otros')).toBe('supply');
    });
  });

  describe('normalizeUnit & normalizeUnitId universal mappings', () => {
    it('normalizes Gramo variants correctly', () => {
      expect(normalizeUnit('Gramo')).toBe('Gramo');
      expect(normalizeUnit('gramo')).toBe('Gramo');
      expect(normalizeUnit('gr')).toBe('Gramo');
      expect(normalizeUnit('g')).toBe('Gramo');
      expect(normalizeUnit('Gramos')).toBe('Gramo');
      expect(normalizeUnit('g.')).toBe('Gramo');
      expect(normalizeUnitId('Gramo')).toBe('unit-gramo');
      expect(normalizeUnitId('gr')).toBe('unit-gramo');
    });

    it('normalizes Mililitro variants correctly', () => {
      expect(normalizeUnit('Mililitro')).toBe('Mililitro');
      expect(normalizeUnit('mililitro')).toBe('Mililitro');
      expect(normalizeUnit('ml')).toBe('Mililitro');
      expect(normalizeUnit('Mililitros')).toBe('Mililitro');
      expect(normalizeUnit('cc')).toBe('Mililitro');
      expect(normalizeUnitId('Mililitro')).toBe('unit-mililitro');
      expect(normalizeUnitId('ml')).toBe('unit-mililitro');
    });

    it('normalizes Onza variants correctly', () => {
      expect(normalizeUnit('Onza')).toBe('Onza');
      expect(normalizeUnit('onza')).toBe('Onza');
      expect(normalizeUnit('oz')).toBe('Onza');
      expect(normalizeUnit('Onzas')).toBe('Onza');
      expect(normalizeUnit('fl oz')).toBe('Onza');
      expect(normalizeUnitId('Onza')).toBe('unit-onza');
      expect(normalizeUnitId('oz')).toBe('unit-onza');
    });

    it('normalizes Unidad variants correctly', () => {
      expect(normalizeUnit('Unidad')).toBe('Unidad');
      expect(normalizeUnit('unidad')).toBe('Unidad');
      expect(normalizeUnit('und')).toBe('Unidad');
      expect(normalizeUnit('unidades')).toBe('Unidad');
      expect(normalizeUnit('u')).toBe('Unidad');
      expect(normalizeUnitId('Unidad')).toBe('unit-unidad');
      expect(normalizeUnitId('und')).toBe('unit-unidad');
    });

    it('normalizes Kilogramo variants correctly', () => {
      expect(normalizeUnit('Kilogramo')).toBe('Kilogramo');
      expect(normalizeUnit('kilogramo')).toBe('Kilogramo');
      expect(normalizeUnit('kg')).toBe('Kilogramo');
      expect(normalizeUnit('kilo')).toBe('Kilogramo');
      expect(normalizeUnit('kilos')).toBe('Kilogramo');
      expect(normalizeUnitId('Kilogramo')).toBe('unit-kilogramo');
      expect(normalizeUnitId('kg')).toBe('unit-kilogramo');
    });

    it('normalizes Litro variants correctly', () => {
      expect(normalizeUnit('Litro')).toBe('Litro');
      expect(normalizeUnit('litro')).toBe('Litro');
      expect(normalizeUnit('l')).toBe('Litro');
      expect(normalizeUnit('lt')).toBe('Litro');
      expect(normalizeUnit('litros')).toBe('Litro');
      expect(normalizeUnitId('Litro')).toBe('unit-litro');
      expect(normalizeUnitId('lt')).toBe('unit-litro');
    });

    it('normalizes Botella variants correctly', () => {
      expect(normalizeUnit('Botella')).toBe('Botella');
      expect(normalizeUnit('botella')).toBe('Botella');
      expect(normalizeUnit('botellas')).toBe('Botella');
      expect(normalizeUnitId('Botella')).toBe('unit-botella');
      expect(normalizeUnitId('botella')).toBe('unit-botella');
    });

    it('normalizes Libra variants correctly', () => {
      expect(normalizeUnit('Libra')).toBe('Libra');
      expect(normalizeUnit('libra')).toBe('Libra');
      expect(normalizeUnit('lb')).toBe('Libra');
      expect(normalizeUnit('libras')).toBe('Libra');
      expect(normalizeUnit('lbs')).toBe('Libra');
      expect(normalizeUnitId('Libra')).toBe('unit-libra');
      expect(normalizeUnitId('lb')).toBe('unit-libra');
    });
  });

  describe('detectResourceType & intelligent resourceType classification', () => {
    it('classifies supply when Linea is Suministros or name contains packaging/supply keywords', () => {
      expect(detectResourceType('Bolsa de Papel Kraft')).toBe('supply');
      expect(detectResourceType('Empaque térmico hamburguesa')).toBe('supply');
      expect(detectResourceType('Caja para pizza 35cm')).toBe('supply');
      expect(detectResourceType('Vaso plástico 12oz')).toBe('supply');
      expect(detectResourceType('Guantes de nitrilo negros M')).toBe('supply');
      expect(detectResourceType('Palillos de madera redondos')).toBe('supply');
      expect(detectResourceType('Pitillos de papel biodegradables')).toBe('supply');
      expect(detectResourceType('Servilletas interfoliadas')).toBe('supply');
      expect(detectResourceType('Sombrilla decorativa para coctel')).toBe('supply');
      expect(detectResourceType('Papel absorbente', 'Suministros')).toBe('supply');
      expect(detectResourceType('Insumo genérico', 'Línea de Suministros')).toBe('supply');
    });

    it('classifies product when name contains direct retail beverage brands', () => {
      expect(detectResourceType('Cerveza Corona 330ml')).toBe('product');
      expect(detectResourceType('Cerveza Club Colombia Dorada')).toBe('product');
      expect(detectResourceType('Coca cola Original 400ml')).toBe('product');
      expect(detectResourceType('Coca-cola Zero 300ml')).toBe('product');
      expect(detectResourceType('RedBull Energy Drink 250ml')).toBe('product');
      expect(detectResourceType('Red Bull Sugar Free')).toBe('product');
    });

    it('classifies ingredient for cooking, bar mixers, produce, meats and pantry groceries', () => {
      expect(detectResourceType('Aceite de Oliva Extra Virgen', 'Cocina')).toBe('ingredient');
      expect(detectResourceType('Carne de Res Molida Especial', 'Cocina')).toBe('ingredient');
      expect(detectResourceType('Tomate Chonto', 'Cocina')).toBe('ingredient');
      expect(detectResourceType('Tequila Don Julio Reposado', 'Bar')).toBe('ingredient');
      expect(detectResourceType('Sirope de Maracuyá', 'Bar')).toBe('ingredient');
      expect(detectResourceType('Arroz Blanco Diana', 'Cocina')).toBe('ingredient');
    });
  });

  describe('inferInventoryCategory & automated 9-category rules', () => {
    it('infers Carnes y Proteínas correctly', () => {
      expect(inferInventoryCategory('Pechuga de Pollo')).toBe('Carnes y Proteínas');
      expect(inferInventoryCategory('Carne Molida')).toBe('Carnes y Proteínas');
      expect(inferInventoryCategory('Lomo de Res')).toBe('Carnes y Proteínas');
      expect(inferInventoryCategory('Costilla de Cerdo')).toBe('Carnes y Proteínas');
      expect(inferInventoryCategory('Camarón Tigre')).toBe('Carnes y Proteínas');
      expect(inferInventoryCategory('Alitas BBQ')).toBe('Carnes y Proteínas');
      expect(inferInventoryCategory('Chorizo Santarrosano')).toBe('Carnes y Proteínas');
      expect(inferInventoryCategory('Filete de Pescado')).toBe('Carnes y Proteínas');
      expect(inferInventoryCategory('Palmitos de Cangrejo')).toBe('Carnes y Proteínas');
    });

    it('infers Frutas y Verduras correctly', () => {
      expect(inferInventoryCategory('Aguacate Hass')).toBe('Frutas y Verduras');
      expect(inferInventoryCategory('Cebolla Cabezona')).toBe('Frutas y Verduras');
      expect(inferInventoryCategory('Limón Tahití')).toBe('Frutas y Verduras');
      expect(inferInventoryCategory('Apio España')).toBe('Frutas y Verduras');
      expect(inferInventoryCategory('Arándanos Frescos')).toBe('Frutas y Verduras');
      expect(inferInventoryCategory('Banano Maduro')).toBe('Frutas y Verduras');
      expect(inferInventoryCategory('Manzana Verde')).toBe('Frutas y Verduras');
      expect(inferInventoryCategory('Yerbabuena')).toBe('Frutas y Verduras');
      expect(inferInventoryCategory('Cilantro')).toBe('Frutas y Verduras');
    });

    it('infers Abarrotes y Secos correctly', () => {
      expect(inferInventoryCategory('Arroz Flor Huila')).toBe('Abarrotes y Secos');
      expect(inferInventoryCategory('Avena en Hojuelas')).toBe('Abarrotes y Secos');
      expect(inferInventoryCategory('Azúcar Morena Incauca')).toBe('Abarrotes y Secos');
      expect(inferInventoryCategory('Harina de Trigo Haz de Oros')).toBe('Abarrotes y Secos');
      expect(inferInventoryCategory('Tortillas de Maíz')).toBe('Abarrotes y Secos');
      expect(inferInventoryCategory('Pan Hamburguesa Brioche')).toBe('Abarrotes y Secos');
      expect(inferInventoryCategory('Chips de Plátano')).toBe('Abarrotes y Secos');
    });

    it('infers Aceites, Salsas y Condimentos correctly', () => {
      expect(inferInventoryCategory('Aceite de Girasol')).toBe('Aceites, Salsas y Condimentos');
      expect(inferInventoryCategory('Achiote en Grano')).toBe('Aceites, Salsas y Condimentos');
      expect(inferInventoryCategory('Ají Pique')).toBe('Aceites, Salsas y Condimentos');
      expect(inferInventoryCategory('Ajo Pelado')).toBe('Aceites, Salsas y Condimentos');
      expect(inferInventoryCategory('Ajonjolí Tostado')).toBe('Aceites, Salsas y Condimentos');
      expect(inferInventoryCategory('Sal Marina')).toBe('Aceites, Salsas y Condimentos');
      expect(inferInventoryCategory('Salsa de Tomate Fruco')).toBe('Aceites, Salsas y Condimentos');
    });

    it('infers Licores y Destilados correctly', () => {
      expect(inferInventoryCategory('Tequila Jose Cuervo')).toBe('Licores y Destilados');
      expect(inferInventoryCategory('Vodka Absolut')).toBe('Licores y Destilados');
      expect(inferInventoryCategory('Whisky Old Parr 12 años')).toBe('Licores y Destilados');
      expect(inferInventoryCategory('Ron Medellín Añejo')).toBe('Licores y Destilados');
      expect(inferInventoryCategory('Ginebra Hendrick\'s')).toBe('Licores y Destilados');
      expect(inferInventoryCategory('Pisco Quebranta')).toBe('Licores y Destilados');
      expect(inferInventoryCategory('Mezcal 400 Conejos')).toBe('Licores y Destilados');
      expect(inferInventoryCategory('Aguardiente Antioqueño Azul')).toBe('Licores y Destilados');
    });

    it('infers Siropes y Mixers correctly', () => {
      expect(inferInventoryCategory('Sirope Monin Vainilla')).toBe('Siropes y Mixers');
      expect(inferInventoryCategory('Licor Triple Sec')).toBe('Siropes y Mixers');
      expect(inferInventoryCategory('Curacao Blue')).toBe('Siropes y Mixers');
      expect(inferInventoryCategory('Baileys Irish Cream')).toBe('Siropes y Mixers');
      expect(inferInventoryCategory('Licor de café Kahlúa')).toBe('Siropes y Mixers');
      expect(inferInventoryCategory('Licor de menta')).toBe('Siropes y Mixers');
    });

    it('infers Garnish y Decoración correctly', () => {
      expect(inferInventoryCategory('Gomas Trululu')).toBe('Garnish y Decoración');
      expect(inferInventoryCategory('Bolitas explosivas de fresa')).toBe('Garnish y Decoración');
      expect(inferInventoryCategory('Cerezas marrasquino')).toBe('Garnish y Decoración');
      expect(inferInventoryCategory('Masmelos blancos')).toBe('Garnish y Decoración');
      expect(inferInventoryCategory('Bombones de chocolate')).toBe('Garnish y Decoración');
    });

    it('infers Cervezas y Gaseosas correctly', () => {
      expect(inferInventoryCategory('Cerveza Stella Artois')).toBe('Cervezas y Gaseosas');
      expect(inferInventoryCategory('Coca Cola Sabor Original')).toBe('Cervezas y Gaseosas');
      expect(inferInventoryCategory('RedBull Energy Drink')).toBe('Cervezas y Gaseosas');
      expect(inferInventoryCategory('Soda Bretaña')).toBe('Cervezas y Gaseosas');
      expect(inferInventoryCategory('Agua Tónica')).toBe('Cervezas y Gaseosas');
    });

    it('infers Empaques y Desechables correctly', () => {
      expect(inferInventoryCategory('Cajas para Hamburguesa Kraft')).toBe('Empaques y Desechables');
      expect(inferInventoryCategory('Bolsas de Papel')).toBe('Empaques y Desechables');
      expect(inferInventoryCategory('Vasos 16oz')).toBe('Empaques y Desechables');
      expect(inferInventoryCategory('Servilletas Blancas')).toBe('Empaques y Desechables');
      expect(inferInventoryCategory('Pitillos')).toBe('Empaques y Desechables');
      expect(inferInventoryCategory('Palillos de Dientes')).toBe('Empaques y Desechables');
    });

    it('defines the 9 standard category rules with valid names and keywords', () => {
      expect(INVENTORY_CATEGORY_RULES).toHaveLength(9);
      expect(INVENTORY_CATEGORY_RULES.map(r => r.category)).toContain('Carnes y Proteínas');
      expect(INVENTORY_CATEGORY_RULES.map(r => r.category)).toContain('Empaques y Desechables');
    });
  });

  describe('calculateCostingMetrics', () => {
    it('calculates waste, correction factor, and unit costs accurately', () => {
      // 1000g gross, 800g net (20% merma), $20,000 price
      const metrics = calculateCostingMetrics(20000, 1000, 800);
      expect(metrics.wastePercentage).toBe(20);
      expect(metrics.correctionFactor).toBe(1.25);
      expect(metrics.unitCostGross).toBe(20);
      expect(metrics.unitCostNet).toBe(25);
    });

    it('handles zero waste when gross equals net', () => {
      const metrics = calculateCostingMetrics(3000, 20, 20);
      expect(metrics.wastePercentage).toBe(0);
      expect(metrics.correctionFactor).toBe(1.0);
      expect(metrics.unitCostGross).toBe(150);
      expect(metrics.unitCostNet).toBe(150);
    });
  });

  describe('parseExcelNumber', () => {
    it('handles numeric and formatted string inputs', () => {
      expect(parseExcelNumber(12500)).toBe(12500);
      expect(parseExcelNumber('$ 20.990')).toBe(20.99);
      expect(parseExcelNumber('3000')).toBe(3000);
      expect(parseExcelNumber('45,000 COP')).toBe(45000);
      expect(parseExcelNumber(undefined, 10)).toBe(10);
    });
  });

  describe('extractQuantityAndUnit', () => {
    it('extracts quantity and unit using regex from formatted strings', () => {
      expect(extractQuantityAndUnit('750 ml')).toEqual({ quantity: 750, unit: 'ml' });
      expect(extractQuantityAndUnit('1000 gr')).toEqual({ quantity: 1000, unit: 'gr' });
      expect(extractQuantityAndUnit('1.5 kg')).toEqual({ quantity: 1.5, unit: 'kg' });
      expect(extractQuantityAndUnit(500)).toEqual({ quantity: 500 });
      expect(extractQuantityAndUnit('24')).toEqual({ quantity: 24, unit: undefined });
    });
  });

  describe('convertQuantity', () => {
    it('converts volume accurately (ml <-> oz, lt <-> ml, lt <-> oz)', () => {
      // 1 oz = 29.5735 ml
      expect(convertQuantity(1, 'oz', 'ml')).toBe(29.5735);
      expect(convertQuantity(29.5735, 'ml', 'oz')).toBe(1);
      // 1 L = 1000 ml
      expect(convertQuantity(1, 'lt', 'ml')).toBe(1000);
      expect(convertQuantity(1000, 'ml', 'lt')).toBe(1);
      // 1 L = 33.81406 oz
      expect(convertQuantity(1, 'lt', 'oz')).toBeCloseTo(33.814, 2);
    });

    it('converts weight accurately (kg <-> gr, lb <-> gr)', () => {
      // 1 kg = 1000 gr
      expect(convertQuantity(1, 'kg', 'gr')).toBe(1000);
      expect(convertQuantity(500, 'gr', 'kg')).toBe(0.5);
      // 1 lb = 500 gr (standard Colombian gastrobar)
      expect(convertQuantity(1, 'lb', 'gr')).toBe(500);
      expect(convertQuantity(1000, 'gr', 'lb')).toBe(2);
    });

    it('handles discrete units and cross-dimension fallback', () => {
      expect(convertQuantity(5, 'und', 'und')).toBe(5);
      // Incompatible dimensions (discrete vs weight) returns quantity unmodified
      expect(convertQuantity(10, 'und', 'kg')).toBe(10);
    });
  });

  describe('normalizeExcelProductRow', () => {
    it('normalizes an Excel row into an InventoryItem with correct operationalZone and costing', () => {
      const row: ExcelProductRawRow = {
        'Linea de Produccion': 'Cocina',
        Insumos: 'Pechuga de Pollo 500g',
        'Precio de compra': 18500,
        'Peso bruto': 500,
        'Peso neto': 450,
        'Unidad de medida': 'Gramos',
        Proveedor: 'Avícola Santa Anita'
      };

      const item = normalizeExcelProductRow(row, 1);
      expect(item).not.toBeNull();
      expect(item?.name).toBe('Pechuga de Pollo 500g');
      expect(item?.operationalZone).toBe('cocina');
      expect(item?.operationZone).toBe('Cocina');
      expect(item?.resourceType).toBe('ingredient');
      expect(item?.category).toBe('Carnes y Proteínas');
      expect(item?.id.startsWith('ins-ing-')).toBe(true);
      expect(item?.purchaseCost).toBe(18500);
      expect(item?.purchaseUnit).toBe('Gramo');
      expect(item?.purchaseUnitId).toBe('unit-gramo');
      expect(item?.usageUnit).toBe('Gramo');
      expect(item?.usageUnitId).toBe('unit-gramo');
      expect(item?.countUnit).toBe('Gramo');
      expect(item?.conversionRatio).toBe(1);
      expect(item?.supplierId).toBe('Avícola Santa Anita');
      expect(item?.cantidadComprada).toBe(500);
      expect(item?.cantidadUtilizable).toBe(450);
      expect(item?.mermaPercentage).toBe(10);
      expect(item?.costoUnitarioReal).toBeCloseTo(41.11, 1);
      expect(item?.unitCostUsage).toBeCloseTo(41.11, 1);
      expect(item?.sucursalStock[0].stockActual).toBe(450);
    });

    it('identifies retail products like Cerveza Corona and sets resourceType product', () => {
      const row: ExcelProductRawRow = {
        'Linea de Produccion': 'Bar',
        Insumos: 'Cerveza Corona 330ml',
        'Precio de compra': 4500,
        'Peso bruto': 1,
        'Peso neto': 1,
        'Unidad de medida': 'und',
        Proveedor: 'Bavaria'
      };

      const item = normalizeExcelProductRow(row, 20);
      expect(item).not.toBeNull();
      expect(item?.resourceType).toBe('product');
      expect(item?.category).toBe('Cervezas y Gaseosas');
      expect(item?.purchaseUnit).toBe('Unidad');
      expect(item?.purchaseUnitId).toBe('unit-unidad');
      expect(item?.id.startsWith('ins-prd-')).toBe(true);
    });

    it('identifies supplies like Bolsas Kraft and sets resourceType supply and supplyCategory', () => {
      const row: ExcelProductRawRow = {
        'Linea de Produccion': 'Suministros',
        Insumos: 'Bolsa Kraft para Domicilio',
        'Precio de compra': 350,
        'Peso bruto': 1,
        'Peso neto': 1,
        'Unidad de medida': 'und',
        Proveedor: 'Empaques del Valle'
      };

      const item = normalizeExcelProductRow(row, 21);
      expect(item).not.toBeNull();
      expect(item?.resourceType).toBe('supply');
      expect(item?.category).toBe('Empaques y Desechables');
      expect(item?.purchaseUnit).toBe('Unidad');
      expect(item?.purchaseUnitId).toBe('unit-unidad');
      expect(item?.isPackagingDesechable).toBe(true);
      expect(item?.id.startsWith('ins-sup-')).toBe(true);
    });

    it('computes purchaseUnit to usageUnit conversion and unitCostUsage (e.g. Lt -> Oz or Kg -> Gr)', () => {
      const row: ExcelProductRawRow = {
        'Linea de Produccion': 'Bar',
        Insumos: 'Ginebra Tanqueray 1L',
        'Precio de compra': 95000,
        'Peso bruto': 1,
        'Peso neto': 1,
        'Unidad de medida de compra': 'lt',
        'Unidad de medida de uso': 'oz',
        Proveedor: 'Diageo Colombia'
      };

      const item = normalizeExcelProductRow(row, 2);
      expect(item).not.toBeNull();
      expect(item?.resourceType).toBe('ingredient');
      expect(item?.category).toBe('Licores y Destilados');
      expect(item?.id.startsWith('ins-ing-')).toBe(true);
      expect(item?.purchaseUnit).toBe('Litro');
      expect(item?.purchaseUnitId).toBe('unit-litro');
      expect(item?.usageUnit).toBe('Onza');
      expect(item?.usageUnitId).toBe('unit-onza');
      // 1 L has ~33.814 oz
      expect(item?.conversionRatio).toBeCloseTo(33.814, 2);
      // Cost per oz: 95000 / 33.814 = ~2809.48 COP
      expect(item?.unitCostUsage).toBeCloseTo(2809.48, 0);
    });

    it('extracts embedded unit from Peso neto string (e.g. 750 ml) and converts to oz for bar', () => {
      const row: ExcelProductRawRow = {
        'Linea de Produccion': 'Bar',
        Insumos: 'Vodka Smirnoff',
        'Precio de compra': 48000,
        'Peso bruto': '750 ml',
        'Peso neto': '750 ml',
        'Unidad de medida de uso': 'oz',
        Proveedor: 'Licores La Cava'
      };

      const item = normalizeExcelProductRow(row, 3);
      expect(item).not.toBeNull();
      expect(item?.resourceType).toBe('ingredient');
      expect(item?.category).toBe('Licores y Destilados');
      expect(item?.purchaseUnit).toBe('Mililitro');
      expect(item?.purchaseUnitId).toBe('unit-mililitro');
      expect(item?.usageUnit).toBe('Onza');
      expect(item?.usageUnitId).toBe('unit-onza');
      expect(item?.cantidadComprada).toBe(750);
      expect(item?.cantidadUtilizable).toBe(750);
      // Cost per ml: 48000 / 750 = $64/ml. Cost per oz: 64 * 29.5735 = $1892.70/oz
      expect(item?.unitCostUsage).toBeCloseTo(1892.70, 0);
    });

    it('normalizes Carne de res with purchaseUnit Gramo and usageUnit Gramo', () => {
      const row: ExcelProductRawRow = {
        'Linea de Produccion': 'Cocina',
        Insumos: 'Carne de res para asar',
        'Precio de compra': 32000,
        'Peso bruto': 1000,
        'Peso neto': 950,
        'Unidad de medida de compra': 'gr',
        'Unidad de medida de uso': 'g',
        Proveedor: 'Carnes de Origen'
      };

      const item = normalizeExcelProductRow(row, 12);
      expect(item).not.toBeNull();
      expect(item?.purchaseUnit).toBe('Gramo');
      expect(item?.purchaseUnitId).toBe('unit-gramo');
      expect(item?.usageUnit).toBe('Gramo');
      expect(item?.usageUnitId).toBe('unit-gramo');
      expect(item?.countUnit).toBe('Gramo');
      expect(item?.countUnitId).toBe('unit-gramo');
    });

    it('returns null if item has no name', () => {
      const row: ExcelProductRawRow = {
        'Linea de Produccion': 'Bar'
      };
      expect(normalizeExcelProductRow(row, 1)).toBeNull();
    });
  });

  describe('End-to-End Excel Sheet Parsing via SheetJS (XLSX)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('creates an in-memory workbook, parses preview data, and commits upsert to Dexie', async () => {
      // Create test rows matching the Malibu format
      const rows = [
        {
          Proveedor: 'Avícola Santa Anita',
          'Linea de Produccion': 'Cocina',
          Insumos: 'Aceite de Oliva',
          'Precio de compra': 25000,
          'Peso bruto': 1000,
          'Peso neto': 1000,
          'Unidad de medida': 'ml'
        },
        {
          Proveedor: 'Licorera La Cava',
          'Linea de Produccion': 'Bar',
          Insumos: 'Ginebra Tanqueray 750ml',
          'Precio de compra': 85000,
          'Peso bruto': 750,
          'Peso neto': 750,
          'Unidad de medida': 'ml'
        },
        {
          Proveedor: 'Salsamentaria',
          'Linea de Produccion': 'Batidos',
          Insumos: 'Pulpa de Mango',
          'Precio de compra': 12000,
          'Peso bruto': 1000,
          'Peso neto': 900,
          'Unidad de medida': 'gr'
        }
      ];

      // Generate binary Excel buffer with SheetJS
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

      // 1. Preview
      const preview = await parseInventoryExcel(buffer);
      expect(preview.totalRows).toBe(3);
      expect(preview.validCount).toBe(3);
      expect(preview.newCount).toBe(3);
      expect(preview.suppliersDetected.length).toBe(3);
      expect(preview.previewItems.length).toBe(3);
      expect(preview.previewItems[0].item.name).toBe('Aceite de Oliva');

      // 2. Commit
      const result = await commitInventoryExcelImport(preview);
      expect(result.totalProcessed).toBe(3);
      expect(result.importedCount).toBe(3);
      expect(result.suppliersCreated).toBe(3);
      expect(result.categoriesCreated).toBeGreaterThanOrEqual(1);
      expect(db.inventoryItems.bulkPut).toHaveBeenCalled();
      expect(db.suppliers.bulkPut).toHaveBeenCalled();
      expect(db.categories.bulkPut).toHaveBeenCalled();

      // 3. Direct processInventoryExcel call with File-like object
      const fakeFile = new File([buffer], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const directResult = await processInventoryExcel(fakeFile);
      expect(directResult.totalProcessed).toBe(3);
    });
  });

  describe('parseDelimitedTextToRows', () => {
    it('parses CSV text into row objects', () => {
      const csv = `Insumos,Linea de Produccion,Precio de compra\nVodka Absolut,Bar,68000\nCarne Hamburguesa,Cocina,15000`;
      const rows = parseDelimitedTextToRows(csv, ',');
      expect(rows.length).toBe(2);
      expect(rows[0].Insumos).toBe('Vodka Absolut');
      expect(rows[0]['Linea de Produccion']).toBe('Bar');
      expect(rows[1].Insumos).toBe('Carne Hamburguesa');
      expect(rows[1]['Linea de Produccion']).toBe('Cocina');
    });
  });
});
