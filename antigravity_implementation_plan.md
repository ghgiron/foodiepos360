# **PLAN DE IMPLEMENTACIÓN AGÉNTICO EN ANTIGRAVITY IDE \- FOODIE POS 360**

Este documento define la ruta de desarrollo y ensamble de **Foodie POS 360** utilizando el ecosistema de **Antigravity (IDE, SDK, CLI)**, agentes autónomos y el protocolo **MCP (Model Context Protocol)**. Está diseñado como el plano de construcción principal para que tu agente de IA lo analice, entienda los límites del sistema y ejecute la codificación modular.

## **FASE 1: PREPARACIÓN DEL WORKSPACE & WORKFLOW DE ANTIGRAVITY**

El primer paso es inicializar el entorno local de desarrollo para que el compilador y los agentes de Antigravity trabajen sobre una arquitectura de carpetas predecible y fuertemente tipada.

### **1.1. Inicialización del Repositorio y CLI**

Ejecuta la creación del proyecto base desde tu terminal utilizando el CLI de Antigravity para estructurar una PWA con React \+ TypeScript \+ Vite:

\# Crear la estructura de la PWA Fullstack  
antigravity init foodie-pos \--template react-ts-tailwind-firebase

\# Acceder al directorio  
cd foodie-pos

\# Instalar dependencias de producción locales necesarias para la resiliencia offline-first  
npm install dexie dexie-react-hooks lucide-react firebase google-genai @google/genkit

### **1.2. Configuración del Workspace agéntico**

Crea un archivo de configuración para indicarle a los agentes de Antigravity cómo compilar, validar tipos de datos y desplegar de manera progresiva y gratuita:

// Archivo: .antigravity/config.json  
{  
  "project": "Foodie POS 360",  
  "version": "1.0.0",  
  "stack": {  
    "frontend": "React 18 (Vite)",  
    "language": "TypeScript 5.x",  
    "styling": "Tailwind CSS",  
    "clientDB": "IndexedDB (Dexie.js)",  
    "cloudDB": "Firebase Firestore"  
  },  
  "agentSettings": {  
    "strictTypes": true,  
    "architecturePattern": "Clean Architecture / Event-Driven",  
    "mcpServerPort": 3012  
  },  
  "deployment": {  
    "provider": "Firebase Hosting",  
    "sparkPlan": true  
  }  
}

## **FASE 2: CONFIGURACIÓN DEL SERVIDOR MCP (MODEL CONTEXT PROTOCOL)**

Para evitar que los agentes de Antigravity cometan errores semánticos al interactuar con tu base de datos o inventen APIs, levantaremos un **Servidor MCP local**. Este servidor expondrá de manera dinámica el esquema de tu base de datos y la firmas de tus métodos.

### **2.1. Implementación del Servidor MCP para Desarrollo**

Crea un script de arranque que sirva de puente para los agentes del IDE.

// Archivo: scripts/foodie-mcp-server.ts  
import { Server } from "@modelcontextprotocol/sdk/server/index.js";  
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";  
import {   
  ListResourcesRequestSchema,   
  ReadResourceRequestSchema   
} from "@modelcontextprotocol/sdk/types.js";

const server \= new Server({  
  name: "foodie-pos-context",  
  version: "1.0.0"  
}, {  
  capabilities: {  
    resources: {}  
  }  
});

// Registrar los esquemas de datos del SRS 360 como recursos para el IDE  
server.onRequest(ListResourcesRequestSchema, async () \=\> {  
  return {  
    resources: \[  
      {  
        uri: "schemas://inventory-item",  
        name: "Esquema JSON del Insumo de Inventario (InventoryItem)",  
        mimeType: "application/json"  
      },  
      {  
        uri: "schemas://recipe",  
        name: "Esquema JSON de Recetas e Ingeniería de Menú (Recipe)",  
        mimeType: "application/json"  
      },  
      {  
        uri: "architecture://event-bus",  
        name: "Contrato del Bus de Eventos de Dominio",  
        mimeType: "text/plain"  
      }  
    \]  
  };  
});

// Responder a las consultas de recursos de los agentes del IDE  
server.onRequest(ReadResourceRequestSchema, async (request) \=\> {  
  const { uri } \= request.params;  
  if (uri \=== "schemas://inventory-item") {  
    return {  
      contents: \[{  
        uri,  
        mimeType: "application/json",  
        text: JSON.stringify({  
          id: "string",  
          name: "string",  
          category: "string",  
          purchaseUnit: "string",  
          countUnit: "string",  
          yieldFactor: "number",  
          density: "number",  
          bottleTareWeightGrams: "number",  
          purchaseCost: "number",  
          gainPercentage: "number",  
          isTaxable: "boolean",  
          taxPercentage: "number",  
          stockMinLimit: "number",  
          theoreticalStock: "number",  
          realPhysicalStock: "number",  
          abcClassification: "A | B | C",  
          sucursalStock: "array"  
        }, null, 2\)  
      }\]  
    };  
  }  
  // Añadir resoluciones para recetas y bus de eventos...  
  throw new Error("Recurso no encontrado");  
});

const transport \= new StdioServerTransport();  
await server.connect(transport);

*Los agentes de Antigravity leerán este servidor automáticamente mediante el protocolo stdio para entender qué tipos usar.*

## **FASE 3: PLAN DE CONSTRUCCIÓN ITERATIVA (THE ANTIGRAVITY WAY)**

Dividiremos la codificación en **3 Sprints de Alto Impacto** optimizados para el autocompletado y validación ágil.

┌─────────────────────────────────────────────────────────────┐  
│ SPRINT 1: El Esqueleto de Datos (IndexedDB \+ Event Bus)      │  
├─────────────────────────────────────────────────────────────┤  
│ SPRINT 2: El Frente Operativo (POS Salón \+ Venta Disney)    │  
├─────────────────────────────────────────────────────────────┤  
│ SPRINT 3: El Control Back-Office (Licores \+ Finanzas IOT)    │  
└─────────────────────────────────────────────────────────────┘

### **SPRINT 1: El Esqueleto del Sistema (Core & Resiliencia)**

* **Objetivo:** Crear la base de datos offline, los tipos de datos estrictos de TypeScript y el Event Bus local.  
* **Archivos a generar por los agentes:**  
  1. src/types/index.ts: Interfaces de datos limpias.  
  2. src/db/localDb.ts: Inicialización de Dexie.js para IndexedDB.  
  3. src/events/eventBus.ts: Bus de eventos con Tipos de Eventos de Dominio.  
* **Prompt de Antigravity CLI:**  
  antigravity code "Crea el módulo localDb.ts con Dexie para IndexedDB e implementa el bus de eventos de dominio typed de acuerdo con foodie\_pos\_srs\_360.md"

### **SPRINT 2: El Frente Operativo (Salón, Comandas & Venta Disney)**

* **Objetivo:** Crear la pantalla táctil de mesas, el KDS de cocina y la barra, y el flujo de caja.  
* **Archivos a generar por los agentes:**  
  1. src/components/salondeck.tsx: Mapa dinámico de mesas.  
  2. src/components/kdsDisplay.tsx: Pantalla de órdenes priorizadas por semáforo (Verde, Ámbar, Rojo).  
  3. src/components/orderFlow.tsx: Flujo de toma de pedidos con el modal inteligente de "Venta Sugerida Disney" (bloqueo táctil para forzar upselling de bebidas/postres).  
* **Prompt de Antigravity CLI:**  
  antigravity code "Genera la pantalla visual de mesas salonDeck.tsx interactiva y conecta el flujo de comandas con el KDS aplicando los tiempos de semáforo del SRS"

### **SPRINT 3: El Control de Pérdidas (Inventario por Peso, OCR & Finanzas 360\)**

* **Objetivo:** Crear las rutinas numéricas de costos, el módulo de control de botellas por peso, y el cuadro financiero.  
* **Archivos a generar por los agentes:**  
  1. src/components/barInventory.tsx: Interfaz para pesaje de botellas abiertas mediante balanza o decimales, cruzándolo con el inventario teórico para calcular mermas.  
  2. src/services/geminiAi.ts: Conexión de Google AI Studio SDK para predicción de demanda de ventas semanales.  
  3. src/components/financialDashboard.tsx: Dashboard de rentabilidad que calcula dinámicamente el CMV Real y la Tasa de Esfuerzo de Arriendo (![][image1]) sobre ventas netas.  
* **Prompt de Antigravity CLI:**  
  antigravity code "Implementa la lógica del pesaje de licores en barInventory.tsx y el cálculo dinámico de la Tasa de Esfuerzo en el Dashboard de Finanzas"

## **FASE 4: INTEGRACIONES DE HARDWARE Y SERVICIOS COLOMBIANOS (SERVERLESS)**

Para las integraciones que no deben correr en el navegador por motivos de seguridad o drivers, utilizaremos **Firebase Cloud Functions (TypeScript)**.

 PWA (Frontend TS) ──\[Web Serial API\]──► Balanzas / Cajón POS Local  
 PWA (Frontend TS) ──\[Web Bluetooth\]───► Impresoras Térmicas Directas  
 PWA (Frontend TS) ──\[mTLS / API Secure\]► Cloud Functions ──► Proveedor Fiscal DIAN

### **4.1. Integración Fiscal DIAN (XML & mTLS Seguro)**

Las llaves criptográficas de tu firma digital de facturación electrónica no pueden estar en el cliente.

* **Flujo:** Al confirmarse OrderPaid, una Cloud Function intercepta la orden, firma el XML mediante el certificado SSL seguro guardado en *Firebase Secret Manager* y envía el payload a tu proveedor autorizado de la DIAN.

### **4.2. Impresión Directa ESC/POS y Balanzas**

* **Impresoras Térmicas:** Uso de navigator.bluetooth.requestDevice para conectarse a la impresora del mesero y transmitir buffers binarios con la especificación ESC/POS sin necesidad de middleware nativo.  
* **Balanzas USB de Cocina:** Uso de navigator.serial.requestPort para leer el stream de datos continuo de la balanza de ingredientes, inyectando el peso de los insumos en tiempo real.

## **FASE 5: DESPLIEGUE CONTINUO Y SOSTENIBILIDAD A COSTE $0 (FIREBASE SPARK)**

Al usar el plan gratuito de **Firebase (Spark Plan)**, la operación de tu SaaS para los primeros clientes te generará un costo de mantenimiento de **$0 USD**:

1. **Hosting:** Firebase Hosting ofrece despliegue rápido, CDN global de baja latencia y SSL gratis para tu PWA.  
2. **Base de Datos:** Firestore ofrece hasta 50,000 lecturas y 20,000 escrituras diarias gratuitas por base de datos, perfecto para el piloto de Malibu y San Agustín.  
3. **Comandos de Despliegue en Antigravity:**  
   \# Configurar el despliegue con un comando  
   antigravity deploy \--target firebase-hosting

## **FASE 6: PROMPTS LISTOS PARA USAR EN EL CHAT DE ANTIGRAVITY IDE**

Copia y pega de forma secuencial estos prompts estructurados en la consola o chat de Antigravity para dejar que la IA codifique el sistema de forma autónoma.

### **Paso 1: Configurar la Estructura de Datos y Persistencia Offline**

*"Utilizando la especificación foodie\_pos\_srs\_360.md y conectando con el servidor MCP en el puerto 3012, genera el archivo localDb.ts con Dexie.js para estructurar IndexedDB. Asegura que contenga las tablas para InventoryItem, Recipe, DailyBriefing, y la cola de eventos asíncronos offline DomainOutbox con estados de sincronización reactivos."*

### **Paso 2: Construir el Módulo de Salón y POS Interactivo de Mesas**

*"Genera el componente interactivo React salondeck.tsx utilizando Tailwind CSS para maquetar el plano del bar. Debe leer las mesas en tiempo real, mostrar un semáforo de estados (Libre, Ocupada con temporizador, Reservada) y permitir mover comas y consumos arrastrando visualmente los ítems de una mesa a otra mediante eventos de drag-and-drop táctiles."*

### **Paso 3: Crear el Módulo Financiero de Control de Licores y CMV**

*"Crea la pantalla de control de inventario de barra barInventory.tsx que permita registrar botellas de licor fraccionadas. Implementa la Web Serial API para capturar el peso directo de una balanza USB, realizar el cálculo matemático restando la tara de la botella para hallar los mililitros netos, y contrastar el stock real contra el teórico para arrojar la varianza de costos y el reporte de pérdidas ABC."*

eof

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADsAAAAZCAYAAACPQVaOAAAClElEQVR4Xu2Vy2sUQRCHN7oH34KyruxrZh+wUUFUEBEPCgoevIj+DR70LnjyFK+CoCCKCII5CVEvogSEHMQnIuLrJBJCFEUxGsEYjV/F6aWobA/7CBuE+eDHTv2quqdrpqc3lUpIWFBKpdLGfD5fsL4mDMP11vvvCILgExpAp9ELmxfwy2jG+r0mzSKmrOkoFAo13toDWSgatnm8w+i3ij/KfLzFEbQfHST+IuN582v12J7BzV9HDczK5gUWulvniLfYWuL36JGKj9fr9ZVyncvllvGT5mFtwh9sDJovmPSA9eKgfsI24BCfBo8abwrd1zXoroup30Nze13sanTcNUx4Af3iZv02F4ev2Wq1uk58+dU+89/R9VzfCtR3yvUpapao+Mm8bV8mG0Zf7aJaxdcsb+ekx7+sfRrbYZq32/6qiztFDpWX6B0HyFKbbIeYZq838/HOWZ+mzgT/DqGJcrm8WdXOGd8ytVptFRN8QI8JF9l8J/iapYERjy+NzfCQ8zanoeY5NWtcHO0I+d636ro5yMQUTXKjmzbXLb5m8QY9/tnIT9uco1gsbqfmiou5HmftJ6LrUX76GsUWCvspmubpnLe5bvE16/tm8S418zUm32friYd03BT1hm/YXKfENLtLfHvwheY0tpB7ValUVqt4p62XHnQcSyaTWcGAMW78MBW3JVrA16wgPjpkvO/os/YcUWMXjbfBzt9Ws4rFDHyK3obqv60dGPvDLsbB271NblpZs1uSe4XKa0Duj/UEO3/QyjaOQ7a2PPFW/8Cp/YbG0WikMRnP4VI1dc/QJLomi+YB7NN5B7k32Wx2ufUFcvfQseg6/oBqBxZzxHq9gCYGrKchP4R+om02l5CQkJCQsED8BQAz0oT3kIuGAAAAAElFTkSuQmCC>