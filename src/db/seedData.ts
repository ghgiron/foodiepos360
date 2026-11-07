// src/db/seedData.ts
import { db } from './localDb';
import type { FixedAsset } from '../types';
import { initializeSettings, DEFAULT_SETTINGS } from './settingsStore';
import { hasRemoteData, fetchRemoteData } from '../services/syncService';

export const DB_INITIALIZED_KEY = 'foodiepos_db_initialized';
export const FOODIEPOS_SEEDED_KEY = 'foodiepos_seeded';

/**
 * Ensures legacy demo/mock data previously seeded into the user's browser IndexedDB is purged safely.
 */
export async function sanitizeVirginDatabase() {
  try {
    // 1. Remove demo KDS tickets
    const demoTicketIds = ['kds-20260608-0192', 'kds-20260608-0195', 'kds-20260608-0198'];
    await db.kdsOrderTickets.bulkDelete(demoTicketIds);

    // 2. Remove demo operational losses (e.g. mock losses from demo tickets)
    const allLosses = await db.operationalLosses.toArray();
    const demoLossIds = allLosses
      .filter(l => demoTicketIds.includes(l.ticketId || '') || (l.reason && l.reason.startsWith('TIEMPO DE PREPARACIÓN:')))
      .map(l => l.id);
    if (demoLossIds.length > 0) {
      await db.operationalLosses.bulkDelete(demoLossIds);
    }

    // 3. Remove demo recipes if they were from initial seed
    const demoRecipeIds = ['rec-gin-tonic-01', 'rec-hamburguesa-gourmet-01', 'rec-burrata-01', 'rec-vieiras-01'];
    await db.recipes.bulkDelete(demoRecipeIds);

    // 4. Remove demo inventory items if any remained
    const demoInventoryIds = [
      'ins-lic-gin-001', 'ins-food-beef-01', 'ins-food-burrata-01', 
      'ins-food-scallops-01', 'ins-food-tonic-01', 'ins-pkg-caja-01', 
      'ins-pkg-bolsa-01', 'ins-pkg-servilletas-01'
    ];
    await db.inventoryItems.bulkDelete(demoInventoryIds);

    console.log('[Sanitize] Lingering demo tickets, recipes and losses cleaned up from local database.');
  } catch (err) {
    console.warn('[Sanitize] Failed to sanitize demo records:', err);
  }
}

export async function seedDatabase() {
  // Always run sanitizer to clean up legacy mock records from older builds
  await sanitizeVirginDatabase();

  // 1. Safe check via localStorage: if already initialized or seeded, skip mock/demo seeding
  try {
    if (typeof window !== 'undefined') {
      const isSeeded = localStorage.getItem(FOODIEPOS_SEEDED_KEY) === 'true';
      const isInitialized = localStorage.getItem(DB_INITIALIZED_KEY) === 'true';
      if (isSeeded || isInitialized) {
        console.log('[Safe Seed] Database is marked as initialized/seeded in localStorage. Preserving user data intact.');
        await initializeSettings();
        return;
      }
    }
  } catch (err) {
    console.warn('[Safe Seed] localStorage access warning:', err);
  }

  // 2. Safe Seed Rule: Check if master records already exist in IndexedDB tables
  const [catCount, menuCatCount, ingCatCount, invCount, recipeCount] = await Promise.all([
    db.categories.count(),
    db.menuCategories.count(),
    db.ingredientCategories.count(),
    db.inventoryItems.count(),
    db.recipes.count()
  ]);

  if (catCount > 0 || menuCatCount > 0 || ingCatCount > 0 || invCount > 0 || recipeCount > 0) {
    console.log('[Safe Seed] Master tables contain existing user records in Dexie. Preserving user data intact.');
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(DB_INITIALIZED_KEY, 'true');
        localStorage.setItem(FOODIEPOS_SEEDED_KEY, 'true');
      }
    } catch {}
    await initializeSettings();
    return;
  }

  // 3. Remote Cloud Check: If remote Firestore already contains records, pull from cloud instead of seeding mock demo data
  try {
    const remoteExists = await hasRemoteData();
    if (remoteExists) {
      console.log('[Safe Seed] Remote data found in Firebase Firestore. Pulling remote data into local Dexie...');
      await fetchRemoteData();
      await initializeSettings();
      if (typeof window !== 'undefined') {
        localStorage.setItem(DB_INITIALIZED_KEY, 'true');
        localStorage.setItem(FOODIEPOS_SEEDED_KEY, 'true');
      }
      return;
    }
  } catch (err) {
    console.warn('[Safe Seed] Could not verify remote data. Proceeding with local safe check.', err);
  }

  console.log('[Safe Seed] Virgin database detected (local & cloud). Seeding initial configuration & demo data...');

  // Initialize system configuration settings (virgin defaults only)
  await initializeSettings();

  // Seed category tables
  const menuCats = DEFAULT_SETTINGS.menu_categories.map(name => ({
    id: `cat-menu-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name
  }));
  await db.menuCategories.bulkPut(menuCats);
  console.log('[Safe Seed] Menu categories seeded.');

  const ingCats = DEFAULT_SETTINGS.ingredient_categories.map(name => ({
    id: `cat-ing-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name
  }));
  await db.ingredientCategories.bulkPut(ingCats);
  console.log('[Safe Seed] Ingredient categories seeded.');

  const supplyCats = DEFAULT_SETTINGS.supply_categories.map(name => ({
    id: `cat-supply-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name
  }));
  await db.supplyCategories.bulkPut(supplyCats);
  console.log('[Safe Seed] Supply categories seeded.');

  // 0. Seed Global Configs & Allergens
  await db.globalConfigs.put({ key: 'min_utility_margin', value: 35 });
  console.log('[Safe Seed] Global configuration seeded.');

  const defaultAllergens = [
    { name: 'Gluten' },
    { name: 'Lácteos' },
    { name: 'Maní' },
    { name: 'Mariscos' },
    { name: 'Huevo' },
    { name: 'Soya' },
    { name: 'Pescado' },
    { name: 'Frutos Secos' }
  ];
  await db.allergens.bulkPut(defaultAllergens);
  console.log('[Safe Seed] Default allergens seeded.');

  const defaultSuppliers = [
    {
      id: "prov-diageo-colombia",
      name: "Diageo Colombia S.A.S.",
      contact: "Andrés Delgado - +57 301 987 6543",
      email: "diageo.colombia@diageo.com",
      paymentTerms: "30 días",
      categoriesSupplied: ["Licores", "Bebidas"],
      updatedAt: new Date().toISOString()
    },
    {
      id: "prov-carnes-del-norte",
      name: "Distribuidora Carnes del Norte",
      contact: "Carlos Mesa - +57 312 456 7890",
      email: "carlos.mesa@carnesdelnorte.com",
      paymentTerms: "Contado",
      categoriesSupplied: ["Proteínas", "Carnes"],
      updatedAt: new Date().toISOString()
    },
    {
      id: "prov-lacteos-italianos",
      name: "Lácteos Italianos S.A.",
      contact: "Filippo Rossi - +57 318 222 3344",
      email: "ventas@lacteositalianos.co",
      paymentTerms: "15 días",
      categoriesSupplied: ["Lácteos", "Abarrotes"],
      updatedAt: new Date().toISOString()
    },
    {
      id: "prov-mariscos-pacifico",
      name: "Mariscos del Pacífico Ltda.",
      contact: "Marta Gómez - +57 315 888 9900",
      email: "pedidos@mariscospacifico.com",
      paymentTerms: "Contado",
      categoriesSupplied: ["Carnes"],
      updatedAt: new Date().toISOString()
    },
    {
      id: "prov-empaques-locales",
      name: "Empaques y Desechables del Caribe",
      contact: "Laura Restrepo - +57 311 777 8899",
      email: "ventas@empaquesdelcaribe.com",
      paymentTerms: "15 días",
      categoriesSupplied: ["Empaques", "Desechables"],
      updatedAt: new Date().toISOString()
    },
    {
      id: "prov-textil",
      name: "Textiles del Viento",
      contact: "Pedro Alva - +57 300 555 4433",
      email: "pedro@textilesdelviento.com",
      paymentTerms: "30 días",
      categoriesSupplied: ["Dotación"],
      updatedAt: new Date().toISOString()
    },
    {
      id: "prov-cristal",
      name: "Cristal Cristalería Premium",
      contact: "Ana María - +57 304 444 5566",
      email: "soporte@cristalpremium.co",
      paymentTerms: "15 días",
      categoriesSupplied: ["Menaje / Cristalería"],
      updatedAt: new Date().toISOString()
    },
    {
      id: "prov-electro",
      name: "ElectroMaquinaria Industrial S.A.S.",
      contact: "Jorge Ortiz - +57 310 999 0011",
      email: "servicio@electromaq.com",
      paymentTerms: "30 días",
      categoriesSupplied: ["Electrodomésticos / Maquinaria"],
      updatedAt: new Date().toISOString()
    }
  ];
  await db.suppliers.bulkPut(defaultSuppliers);
  console.log('[Safe Seed] Default suppliers seeded.');

  const defaultClients = [
    {
      id: "cli-001",
      name: "María López",
      phone: "3001234567",
      address: "Calle 85 # 11-44, Bogotá",
      electronicInvoice: true,
      email: "maria@gmail.com",
      taxId: "109876543-2",
      createdAt: new Date().toISOString()
    },
    {
      id: "cli-002",
      name: "Juan Pérez",
      phone: "3119876543",
      address: "Carrera 15 # 72-10, Bogotá",
      electronicInvoice: false,
      email: "juan@outlook.com",
      taxId: "102938475-1",
      createdAt: new Date().toISOString()
    },
    {
      id: "cli-003",
      name: "Carlos Gomez",
      phone: "3204567890",
      address: "Calle 100 # 19-55, Bogotá",
      electronicInvoice: true,
      email: "carlos@gastro.com",
      taxId: "901234567-8",
      createdAt: new Date().toISOString()
    },
    {
      id: "cli-004",
      name: "Ana Rodriguez",
      phone: "3158889900",
      address: "Diagonal 45 # 22-80, Bogotá",
      electronicInvoice: false,
      email: "ana.rod@gmail.com",
      taxId: "103847592-3",
      createdAt: new Date().toISOString()
    }
  ];
  await db.clients.bulkPut(defaultClients);
  console.log('[Safe Seed] Default clients seeded.');

  // Seed virgin database configuration only (no mock inventory, recipes or comanda tickets)
  console.log('[Safe Seed] Master configuration initialized. Catalog tables left virgin for user entries.');

  
  // 6. Seed Fixed Assets if empty
  const assetCount = await db.fixedAssets.count();
  if (assetCount === 0) {
    const assetSeeds: FixedAsset[] = [
      {
        id: "ast-dot-001",
        name: "Camiseta Staff",
        category: "Dotación",
        location: "Salón",
        purchaseDate: "2026-01-10",
        purchaseCost: 12.50,
        status: "Operativo",
        description: "Talla M/L - Color Negro",
        unitOfMeasure: "Unidades",
        stockActual: 45,
        stockMinLimit: 10,
        supplierId: "prov-textil",
        materialType: "Algodón",
        updatedAt: new Date().toISOString()
      },
      {
        id: "ast-men-001",
        name: "Copas Gin Tonic",
        category: "Menaje / Cristalería",
        location: "Barra",
        purchaseDate: "2026-02-15",
        purchaseCost: 85.00,
        status: "Operativo",
        description: "Cristal Premium - 600ml",
        unitOfMeasure: "Cajas (x6)",
        stockActual: 12,
        stockMinLimit: 5,
        supplierId: "prov-cristal",
        materialType: "Vidrio Templado",
        capacity: "600ml",
        updatedAt: new Date().toISOString()
      },
      {
        id: "ast-maq-001",
        name: "Horno Microondas",
        category: "Electrodomésticos / Maquinaria",
        location: "Cocina",
        purchaseDate: "2025-11-20",
        purchaseCost: 450.00,
        status: "En Mantenimiento",
        description: "Panasonic Pro 1200W",
        unitOfMeasure: "Unidades",
        stockActual: 2,
        stockMinLimit: 1,
        supplierId: "prov-electro",
        brand: "Panasonic",
        model: "Pro 1200W",
        serialNumber: "PN-98234-A",
        voltage: "110V",
        nextMaintenanceDate: "2026-06-10", // already due (today is June 11)
        maintenanceType: "Preventivo",
        alertFrequency: "Semestral",
        updatedAt: new Date().toISOString()
      },
      {
        id: "ast-dot-002",
        name: "Buzo Malibu",
        category: "Dotación",
        location: "Salón",
        purchaseDate: "2026-03-01",
        purchaseCost: 38.00,
        status: "Operativo",
        description: "Hoodie Invierno - Staff",
        unitOfMeasure: "Unidades",
        stockActual: 15,
        stockMinLimit: 3,
        supplierId: "prov-textil",
        materialType: "Poliéster/Algodón",
        updatedAt: new Date().toISOString()
      }
    ];
    await db.fixedAssets.bulkPut(assetSeeds);
    console.log('[Safe Seed] Fixed Assets seeded.');
  }

  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DB_INITIALIZED_KEY, 'true');
      localStorage.setItem(FOODIEPOS_SEEDED_KEY, 'true');
    }
  } catch {}

  console.log('[Safe Seed] IndexedDB virgin initialization completed successfully!');
}
