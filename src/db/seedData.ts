// src/db/seedData.ts
import { db } from './localDb';
import type { InventoryItem, Recipe, KdsOrderTicket, LoyaltyPlan, PromotionBook, FixedAsset } from '../types';
import { initializeSettings, DEFAULT_SETTINGS } from './settingsStore';

export async function seedDatabase() {
  // Initialize system configuration settings
  await initializeSettings();

  // Seed category tables if empty
  const menuCatCount = await db.menuCategories.count();
  if (menuCatCount === 0) {
    const menuCats = DEFAULT_SETTINGS.menu_categories.map(name => ({
      id: `cat-menu-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name
    }));
    await db.menuCategories.bulkPut(menuCats);
    console.log('Menu categories seeded.');
  }

  const ingCatCount = await db.ingredientCategories.count();
  if (ingCatCount === 0) {
    const ingCats = DEFAULT_SETTINGS.ingredient_categories.map(name => ({
      id: `cat-ing-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name
    }));
    await db.ingredientCategories.bulkPut(ingCats);
    console.log('Ingredient categories seeded.');
  }

  const supplyCatCount = await db.supplyCategories.count();
  if (supplyCatCount === 0) {
    const supplyCats = DEFAULT_SETTINGS.supply_categories.map(name => ({
      id: `cat-supply-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name
    }));
    await db.supplyCategories.bulkPut(supplyCats);
    console.log('Supply categories seeded.');
  }

  // 0. Seed Global Configs & Allergens if empty (independent of other tables)
  const configCount = await db.globalConfigs.count();
  if (configCount === 0) {
    await db.globalConfigs.put({ key: 'min_utility_margin', value: 35 });
    console.log('Global configuration seeded.');
  }

  const allergensCount = await db.allergens.count();
  if (allergensCount === 0) {
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
    console.log('Default allergens seeded.');
  }

  const suppliersCount = await db.suppliers.count();
  if (suppliersCount === 0) {
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
    console.log('Default suppliers seeded.');
  }

  // Seed Clients if empty
  const clientsCount = await db.clients.count();
  if (clientsCount === 0) {
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
    console.log('Default clients seeded.');
  }

  // Check if we already have items to avoid double seeding
  const count = await db.inventoryItems.count();
  if (count > 0) {
    console.log('Database already seeded.');
    return;
  }

  console.log('Seeding local IndexedDB with mock data...');

  // 1. Seed Inventory Items
  const inventorySeeds: InventoryItem[] = [
    {
      id: "ins-lic-gin-001",
      name: "Ginebra Tanqueray London Dry",
      category: "Licores",
      purchaseUnit: "Botella 750ml",
      countUnit: "ml",
      yieldFactor: 1.0,
      density: 0.94,
      bottleTareWeightGrams: 450.0,
      purchaseCost: 95000.00,
      gainPercentage: 220.0,
      isTaxable: true,
      taxPercentage: 8.0,
      stockMinLimit: 2250.0,
      theoreticalStock: 5250.0,
      realPhysicalStock: 5000.0,
      abcClassification: "A",
      supplierId: "prov-diageo-colombia",
      sucursalStock: [
        { sucursalId: "sede-norte-01", stockActual: 150 },
        { sucursalId: "sede-sur-02", stockActual: 85 }
      ],
      updatedAt: new Date().toISOString()
    },
    {
      id: "ins-food-beef-01",
      name: "Carne de Res Molida Premium",
      category: "Carnes",
      purchaseUnit: "Kg",
      countUnit: "g",
      yieldFactor: 0.85,
      density: 1.0,
      bottleTareWeightGrams: 0,
      purchaseCost: 28000.00,
      gainPercentage: 150.0,
      isTaxable: false,
      taxPercentage: 0,
      stockMinLimit: 5000.0,
      theoreticalStock: 12000.0,
      realPhysicalStock: 11500.0,
      abcClassification: "A",
      supplierId: "prov-carnes-del-norte",
      sucursalStock: [{ sucursalId: "sede-norte-01", stockActual: 12 }],
      updatedAt: new Date().toISOString()
    },
    {
      id: "ins-food-burrata-01",
      name: "Queso Burrata Artesanal 150g",
      category: "Abarrotes",
      purchaseUnit: "Unidad",
      countUnit: "unidad",
      yieldFactor: 1.0,
      density: 1.0,
      bottleTareWeightGrams: 0,
      purchaseCost: 8500.00,
      gainPercentage: 180.0,
      isTaxable: true,
      taxPercentage: 8.0,
      stockMinLimit: 10,
      theoreticalStock: 35,
      realPhysicalStock: 32,
      abcClassification: "B",
      supplierId: "prov-lacteos-italianos",
      sucursalStock: [{ sucursalId: "sede-norte-01", stockActual: 35 }],
      updatedAt: new Date().toISOString()
    },
    {
      id: "ins-food-scallops-01",
      name: "Vieiras Frescas de Buceo",
      category: "Carnes",
      purchaseUnit: "Kg",
      countUnit: "g",
      yieldFactor: 0.9,
      density: 1.0,
      bottleTareWeightGrams: 0,
      purchaseCost: 98000.00,
      gainPercentage: 200.0,
      isTaxable: false,
      taxPercentage: 0,
      stockMinLimit: 1000.0,
      theoreticalStock: 3000.0,
      realPhysicalStock: 2800.0,
      abcClassification: "A",
      supplierId: "prov-mariscos-pacifico",
      sucursalStock: [{ sucursalId: "sede-norte-01", stockActual: 3 }],
      updatedAt: new Date().toISOString()
    },
    {
      id: "ins-food-tonic-01",
      name: "Tónica Premium Mezcla Casa",
      category: "Abarrotes",
      purchaseUnit: "Botella 200ml",
      countUnit: "ml",
      yieldFactor: 1.0,
      density: 1.0,
      bottleTareWeightGrams: 120.0,
      purchaseCost: 3500.00,
      gainPercentage: 250.0,
      isTaxable: true,
      taxPercentage: 8.0,
      stockMinLimit: 5000.0,
      theoreticalStock: 15000.0,
      realPhysicalStock: 14800.0,
      abcClassification: "C",
      supplierId: "prov-diageo-colombia",
      sucursalStock: [{ sucursalId: "sede-norte-01", stockActual: 75 }],
      updatedAt: new Date().toISOString()
    },
    {
      id: "ins-pkg-caja-01",
      name: "Caja Hamburguesa Kraft",
      category: "Empaques",
      purchaseUnit: "Unidad",
      countUnit: "unidad",
      yieldFactor: 1.0,
      density: 1.0,
      bottleTareWeightGrams: 0,
      purchaseCost: 450.00,
      gainPercentage: 0,
      isTaxable: false,
      taxPercentage: 0,
      stockMinLimit: 50.0,
      theoreticalStock: 200.0,
      realPhysicalStock: 180.0,
      abcClassification: "C",
      supplierId: "prov-empaques-locales",
      sucursalStock: [{ sucursalId: "sede-norte-01", stockActual: 180 }],
      updatedAt: new Date().toISOString()
    },
    {
      id: "ins-pkg-bolsa-01",
      name: "Bolsa Delivery Mediana",
      category: "Empaques",
      purchaseUnit: "Unidad",
      countUnit: "unidad",
      yieldFactor: 1.0,
      density: 1.0,
      bottleTareWeightGrams: 0,
      purchaseCost: 300.00,
      gainPercentage: 0,
      isTaxable: false,
      taxPercentage: 0,
      stockMinLimit: 50.0,
      theoreticalStock: 200.0,
      realPhysicalStock: 190.0,
      abcClassification: "C",
      supplierId: "prov-empaques-locales",
      sucursalStock: [{ sucursalId: "sede-norte-01", stockActual: 190 }],
      updatedAt: new Date().toISOString()
    },
    {
      id: "ins-pkg-servilletas-01",
      name: "Servilletas Elite (Pack x2)",
      category: "Empaques",
      purchaseUnit: "Unidad",
      countUnit: "unidad",
      yieldFactor: 1.0,
      density: 1.0,
      bottleTareWeightGrams: 0,
      purchaseCost: 120.00,
      gainPercentage: 0,
      isTaxable: false,
      taxPercentage: 0,
      stockMinLimit: 100.0,
      theoreticalStock: 500.0,
      realPhysicalStock: 480.0,
      abcClassification: "C",
      supplierId: "prov-empaques-locales",
      sucursalStock: [{ sucursalId: "sede-norte-01", stockActual: 480 }],
      updatedAt: new Date().toISOString()
    }
  ];

  await db.inventoryItems.bulkPut(inventorySeeds);

  // 2. Seed Recipes
  const recipeSeeds: Recipe[] = [
    {
      id: "rec-gin-tonic-01",
      name: "Gin Tonic Clásico",
      description: "Ginebra Tanqueray, tónica artesanal de la casa y un toque de mist botánico de romero.",
      category: "BAR",
      sellPrice: 32000.00,
      costPrice: 9500.00,
      yieldFactor: 1.0,
      cmvPercentage: 29.6,
      bcgClassification: "ESTRELLA",
      isSubRecipe: false,
      ingredients: [
        { inventoryItemId: "ins-lic-gin-001", type: "item", quantity: 50, unit: "ml" },
        { inventoryItemId: "ins-food-tonic-01", type: "item", quantity: 200, unit: "ml" }
      ],
      img: "https://images.unsplash.com/photo-1570598912132-0ba1dc952b7d?auto=format&fit=crop&w=500&q=80",
      mostrar_en_catalogo: true,
      productionZone: "Bar",
      updatedAt: new Date().toISOString()
    },
    {
      id: "rec-hamburguesa-gourmet-01",
      name: "Hamburguesa de la Casa",
      description: "Carne angus seleccionada de 200g, queso cheddar fundido, lechuga hidropónica y salsa secreta.",
      category: "KITCHEN",
      sellPrice: 49000.00,
      costPrice: 16800.00,
      yieldFactor: 1.0,
      cmvPercentage: 34.3,
      bcgClassification: "CABALLO_DE_BATALLA",
      isSubRecipe: false,
      ingredients: [
        { inventoryItemId: "ins-food-beef-01", type: "item", quantity: 200, unit: "g" }
      ],
      img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80",
      mostrar_en_catalogo: true,
      productionZone: "Cocina",
      updatedAt: new Date().toISOString()
    },
    {
      id: "rec-burrata-01",
      name: "Burrata de Herencia",
      description: "Queso burrata fresco sobre cama de tomates heirloom y aceite de albahaca emulsionado.",
      category: "KITCHEN",
      sellPrice: 38000.00,
      costPrice: 10500.00,
      yieldFactor: 1.0,
      cmvPercentage: 27.6,
      bcgClassification: "ESTRELLA",
      isSubRecipe: false,
      ingredients: [
        { inventoryItemId: "ins-food-burrata-01", type: "item", quantity: 1, unit: "unidad" }
      ],
      img: "https://images.unsplash.com/photo-1592417817098-8f3d6eb19675?auto=format&fit=crop&w=500&q=80",
      mostrar_en_catalogo: true,
      productionZone: "Cocina",
      updatedAt: new Date().toISOString()
    },
    {
      id: "rec-vieiras-01",
      name: "Vieiras de Buceo",
      description: "Vieiras selladas al sartén con puré de guisantes, panceta crujiente y aire de limón.",
      category: "KITCHEN",
      sellPrice: 65000.00,
      costPrice: 22000.00,
      yieldFactor: 1.0,
      cmvPercentage: 33.8,
      bcgClassification: "ROMPECABEZAS",
      isSubRecipe: false,
      ingredients: [
        { inventoryItemId: "ins-food-scallops-01", type: "item", quantity: 150, unit: "g" }
      ],
      img: "https://images.unsplash.com/photo-1534080391025-a7f0e67c2a13?auto=format&fit=crop&w=500&q=80",
      mostrar_en_catalogo: true,
      productionZone: "Cocina",
      updatedAt: new Date().toISOString()
    }
  ];

  await db.recipes.bulkPut(recipeSeeds);

  // 3. Seed Loyalty Plan
  const loyaltyPlanSeed: LoyaltyPlan = {
    id: "loy-plan-gastro-01",
    planName: "Club Gastrobar Platinum",
    valueToPointRatio: 10000.00,
    pointValueWhenRedeemed: 1500.00,
    minimumPurchaseToEarnPoints: 50000.00,
    pointsExpirationMonths: 6,
    sendWelcomeEmail: true,
    applyToAllCustomers: true,
    createdAt: new Date().toISOString()
  };

  await db.loyaltyPlans.put(loyaltyPlanSeed);

  // 4. Seed Promotion Book
  const promotionBookSeed: PromotionBook = {
    id: "promo-happy-hour-01",
    name: "Happy Hour Autor",
    startDate: "2026-06-01",
    endDate: "2026-08-31",
    startTime: "16:00",
    endTime: "19:00",
    activeDays: {
      monday: false,
      martes: true,
      miercoles: true,
      jueves: true,
      viernes: false,
      sabado: false,
      domingo: false
    },
    sucursalId: "sede-norte-01",
    rules: [
      {
        recipeId: "rec-gin-tonic-01",
        discountType: "PERCENTAGE",
        discountValue: 50.0
      }
    ],
    isActive: true,
    updatedAt: new Date().toISOString()
  };

  await db.promotionBooks.put(promotionBookSeed);

  // 5. Seed KDS Order Tickets (Active comanda tickets)
  const kdsSeeds: KdsOrderTicket[] = [
    {
      id: "kds-20260608-0192",
      orderId: "ord-20260608-0192",
      tableId: 12,
      paxCount: 4,
      waiterId: "Sarah Jenkins",
      comandaTime: new Date(Date.now() - 14 * 60 * 1000 - 32 * 1000).toISOString(), // 14:32 ago
      timeLimitMinutes: 15,
      isRushHourOrder: true,
      items: [
        {
          recipeId: "rec-vieiras-01",
          name: "Vieiras de Buceo",
          category: "KITCHEN",
          quantity: 2,
          modifiers: ["Sartén bien caliente", "Puré caliente"],
          status: "COOKING",
          completedAt: null
        },
        {
          recipeId: "rec-burrata-01",
          name: "Burrata de Herencia",
          category: "KITCHEN",
          quantity: 1,
          modifiers: ["Sin croutones"],
          status: "COMPLETED",
          completedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
        }
      ],
      overallStatus: "PREPARANDO"
    },
    {
      id: "kds-20260608-0195",
      orderId: "ord-20260608-0195",
      tableId: 4,
      paxCount: 2,
      waiterId: "Michael R.",
      comandaTime: new Date(Date.now() - 6 * 60 * 1000 - 15 * 1000).toISOString(), // 6:15 ago
      timeLimitMinutes: 20,
      isRushHourOrder: false,
      items: [
        {
          recipeId: "rec-hamburguesa-gourmet-01",
          name: "Hamburguesa de la Casa",
          category: "KITCHEN",
          quantity: 2,
          modifiers: ["Término Medio", "Sin cebolla"],
          status: "COOKING",
          completedAt: null
        }
      ],
      overallStatus: "PREPARANDO"
    },
    {
      id: "kds-20260608-0198",
      orderId: "ord-20260608-0198",
      tableId: 22,
      paxCount: 2,
      waiterId: "Emma Watts",
      comandaTime: new Date(Date.now() - 2 * 60 * 1000 - 10 * 1000).toISOString(), // 2:10 ago
      timeLimitMinutes: 10,
      isRushHourOrder: false,
      items: [
        {
          recipeId: "rec-gin-tonic-01",
          name: "Gin Tonic Clásico",
          category: "BAR",
          quantity: 2,
          modifiers: ["Doble Hielo", "Botanical Mist de Romero"],
          status: "PENDING",
          completedAt: null
        }
      ],
      overallStatus: "ORDEN TOMADA"
    }
  ];

  await db.kdsOrderTickets.bulkPut(kdsSeeds);
  
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
    console.log('Fixed Assets seeded.');
  }

  console.log('IndexedDB seeded successfully!');
}
