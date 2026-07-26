# **MANUAL DE REQUERIMIENTOS, ARQUITECTURA Y ESPECIFICACIÓN TÉCNICA**
## **SISTEMA FOODIE POS 360 (GASTROBAR 360)**

> **Documento de Referencia para el Analista de Requerimientos**  
> **Versión:** 1.0  
> **Estado:** Consolidado y Estandarizado (Vibecoding Ready)  
> **Proyecto:** Foodie POS 360 (Gastrobar 360)

---

## **1. RESUMEN EJECUTIVO Y VISIÓN DEL PRODUCTO**

### **1.1. Propósito del Sistema**
**Foodie POS 360** es un ecosistema integral de Gestión Gastronómica y Punto de Venta (POS) diseñado para restaurantes, bares y gastrobares. Combina la operación táctil en salón/cocina con módulos de inteligencia de negocios, inteligencia artificial predictiva (nube y local), control de costos, seguridad alimentaria (HACCP) y facturación electrónica.

### **1.2. Modelo de Negocio**
- **SaaS Multitenant:** Modelo de suscripción donde cada restaurante (tenant) opera de forma aislada, pudiendo activar o desactivar módulos según su plan contratado.
- **Soporte Multi-Sucursal:** Consolidación de información a nivel corporativo/dueño para administrar múltiples sedes físicas desde una única interfaz administrativa (EMI).
- **Filosofía Offline-First:** La operación táctil en mesa, barra y cocina jamás depende de una conexión activa a internet.

---

## **2. ARQUITECTURA TÉCNICA E INFRAESTRUCTURA**

### **2.1. Stack Tecnológico Core**

| Capa / Componente | Tecnología Seleccionada | Propósito y Función |
| :--- | :--- | :--- |
| **Frontend Cliente** | React (Vite) + TypeScript + Tailwind CSS | Progressive Web App (PWA) de alto rendimiento, optimizada para dispositivos móviles y pantallas táctiles POS. |
| **Persistencia Local (Offline)** | IndexedDB administrado por Dexie.js | Fuente Única de Verdad (*Single Source of Truth*) en el cliente. Permite operar al 100% sin internet. |
| **Backend Serverless** | Firebase Cloud Functions (Node.js / TS) | Capa de API segura, microservicios serverless, firmas criptográficas y tareas programadas en segundo plano. |
| **Base de Datos Central** | Google Cloud Firestore (NoSQL) | Base de datos documental reactiva para sincronización multitenant entre cliente y nube. |
| **Autenticación & Roles** | Firebase Auth + Custom Claims | Gestión de usuarios, perfiles (Mesero, Cajero, Bartender, Chef, Administrador, Dueño) y segregación por tenant. |
| **IA en la Nube** | Google AI Studio SDK (Gemini 2.5 Flash / Pro) | OCR para facturas de compra, análisis financiero avanzado y asistente conversacional omnicanal. |
| **IA Local (Costo $0/Offline)** | Ollama + Gemma 2 (2B / 9B) | Procesamiento semántico de comandas y mermas en la red LAN local del restaurante sin consumir cuotas cloud. |

---

### **2.2. Arquitectura Orientada a Eventos y Event-Driven Sync**

El sistema opera bajo un desacoplamiento por **Eventos de Dominio**. Cada mutación crítica en el cliente PWA genera un evento que se encola localmente y luego se procesa de forma asíncrona.

```
                  ┌────────────────────────────────────────┐  
                  │          CORE POS (PWA Client)         │  
                  └───────────────────┬────────────────────┘  
                                      │ (Llamadas REST / IndexedDB)  
                                      ▼  
                  ┌────────────────────────────────────────┐  
                  │   OUTBOX QUEUE & SERVICE WORKER SYNC   │  
                  └───────────────────┬────────────────────┘  
                                      │ (Despacha al conectar)  
                                      ▼  
                  ┌────────────────────────────────────────┐  
                  │        BUS DE EVENTOS DE DOMINIO       │  
                  └───────────────────┬────────────────────┘  
                                      │  
         ┌────────────────────────────┼────────────────────────────┐  
         ▼                            ▼                            ▼  
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐  
│ Módulo Finanzas  │          │Módulo Inventario│          │Módulo Asistencia│  
│ (Arqueo/Gastos) │          │ (Descuento Stock)│          │ (Nómina Ready)  │  
└─────────────────┘          └─────────────────┘          └─────────────────┘
```

---

### **2.3. Estrategia PWA Offline-First & Integración con Hardware Nativo**

1. **Patrón Outbox Queue:**
   - Toda transacción (ej. pedido pagado, marcación de turno, checklist completado) se guarda primero en la tabla `DomainOutbox` de IndexedDB con estado `PENDING`.
   - El `ServiceWorker` detecta la conectividad y procesa la cola mediante un algoritmo **FIFO** hacia Cloud Firestore / Firebase Backend.

2. **Comunicación Directa con Periféricos (Sin Drivers/Intermediate Softwares):**
   - **Web Bluetooth API:** Transmisión de comandos binarios **ESC/POS** a impresoras portátiles de cinturón para meseros.
   - **Web USB API:** Conexión directa a impresoras de cocina fijas y apertura de cajones monederos por pulsos eléctricos.
   - **Web Serial API:** Lectura en tiempo real del peso transmitido por balanzas electrónicas de cocina y barra.

---

## **3. CATÁLOGO DE EVENTOS DE DOMINIO**

Como Analista de Requerimientos, debes saber que las siguientes acciones desencadenan integraciones asíncronas en el sistema:

| Evento | Origen | Impacto / Suscriptores |
| :--- | :--- | :--- |
| `SubscriptionUpdated` | Módulo EMI (SuperAdmin) | Habilita/Deshabilita módulos funcionales y vistas en la PWA del restaurante de forma inmediata. |
| `OrderPlaced` | Salón / QR / WhatsApp / App Delivery | Genera ticket KDS para Cocina/Barra, bloquea insumos en inventario teórico. |
| `OrderPaid` | Caja POS | Descuenta stock definitivo en receta/subreceta, registra transacción en Arqueo de Caja y activa microservicio tributario (DIAN). |
| `InventoryItemUpdated` | Inventario / Compras | Actualiza costos teóricos, recalcula CMV y evalúa alertas de stock mínimo. |
| `HaccpAlertTriggered` | Módulo HACCP / Sensores IoT | Dispara notificación push crítica de temperatura por fuera de rango de inocuidad. |
| `PurchaseOcrScanned` | Auditoría de Compras | Compara precios facturados vs. históricos y alerta si la variación del insumo supera el margen permitido. |
| `ShiftClockedIn` / `ShiftClockedOut` | Reloj de Asistencia | Registra horas trabajadas validadas por GPS y recalcula en tiempo real el *Labor Cost %*. |

---

## **4. ESPECIFICACIÓN DETALLADA POR MÓDULOS DE NEGOCIO**

---

### **MÓDULO I: EMI (ENTERPRISE MANAGEMENT INTERFACE) & MULTI-SUCURSAL**

#### **RF-I1: Habilitación Modular Dinámica (Multitenant)**
- **Descripción:** El Superadministrador habilita o deshabilita módulos funcionales dinámicamente según la suscripción del restaurante.
- **Regla de Negocio:** Al detectar que un tenant excede los límites (ej. número de mesas, usuarios o sedes creadas), el sistema bloquea la creación de nuevos recursos e invita a realizar un upgrade de plan.
- **Criterio de Aceptación:** Al emitir `SubscriptionUpdated`, el cliente reconfigura su menú de navegación en tiempo real sin requerir reinicio.

#### **RF-I2: Consolidación Multi-Sede**
- **Descripción:** Permite a usuarios con rol Dueño/Administrador Corporativo ver consolidados financieros o filtrar por sucursal específica (`sede-norte`, `sede-sur`, etc.).
- **Regla de Negocio:** El cambio de sucursal en la barra superior filtra automáticamente todos los datos mostrados en Inventario, Ventas, Caja y KDS.

---

### **MÓDULO II: ASISTENTE DE CONFIGURACIÓN & ONBOARDING (OCR)**

#### **RF-II1: Wizard de Inicio con Digitalización OCR**
- **Descripción:** Permite la carga inicial de datos del establecimiento de forma manual o escaneando documentos legales/tributarios (RUT, RFC, Certificados de Cámara de Comercio).
- **Criterio de Aceptación:** La IA extrae el NIT/RUT, Razón Social, Dirección, Régimen Fiscal y asigna los valores en los campos del formulario con un indicador ámbar en los datos que requieren verificación humana.

---

### **MÓDULO III: MENÚ, RECETARIO TÉCNICO E INGENIERÍA DE MENÚS (BCG)**

#### **RF-III1: Carga de Menú por OCR y Optimización con IA**
- **Descripción:** Digitalización de cartas físicas en imagen o PDF. Extracción automática de platos, descripciones y precios.
- **Herramienta IA:** Botón "Optimizar Copy con IA" para enriquecer descripciones con sintaxis persuasiva orientada al aumento del ticket promedio.

#### **RF-III2: Recetario Técnico, Subrecetas y Matriz BCG**
- **Ficha Técnica Anidada:** Permite vincular Insumos Crudos (ej. Carne de Res) y Subrecetas intermedias (ej. Salsa Demiglace producida por lotes), calculando automáticamente el costo unitario y el CMV teórico.
- **Matriz BCG (Ingeniería de Menús):** Clasificación matemática de los productos en 4 cuadrantes basada en ventas reales y margen de contribución:
  1. **Estrella:** Alta popularidad, Alta rentabilidad.
  2. **Caballo de Batalla:** Alta popularidad, Baja rentabilidad.
  3. **Rompecabezas:** Baja popularidad, Alta rentabilidad.
  4. **Perro:** Baja popularidad, Baja rentabilidad.

---

### **MÓDULO IV: OMNICANALIDAD, COMANDAS Y KDS (KITCHEN DISPLAY SYSTEM)**

#### **RF-IV1: Hub Unificado de Comandas**
- **Canales Soportados:** Meseros en Salón, Auto-servicio QR en mesa, Domicilios directos, Apps de terceros (Rappi) y Asistente Conversacional IA (WhatsApp/Voz).
- **Flujo KDS:** Las comandas se enrutan automáticamente a la pantalla de Cocina o Barra según la categoría del ítem. Muestra temporizadores de alerta por color (Verde, Amarillo, Rojo ante retrasos).
- **Asistente IA:** Los pedidos tomados por voz o WhatsApp entran en estado "Por Confirmar" a la cola de comandas.

---

### **MÓDULO V: CULTURA DE SERVICIO, CHECKLISTS Y PROTOCOLO DISNEY**

#### **RF-V1: Briefing Diario Rotativo de 15 Minutos**
- **Bloqueo Operativo:** El POS permanece bloqueado para tomar comandas al inicio del turno hasta que el Administrador complete la reunión digital de briefing.
- **Líder Rotativo:** El sistema elige aleatoriamente un mesero/bartender diferente cada día para liderar la reunión.
- **Contenido Obligatorio:** Meta financiera del turno, productos faltantes/bloqueados, plato "push" del día y un consejo de hospitalidad estilo Disney.

#### **RF-V2: Checklists Operativos y Protocolo de Atención "Santo Mar/Malibu"**
- **Checklists por Rol:** Formularios digitales de Apertura, Servicio y Cierre guardados offline en IndexedDB.
- **Protocolo de Servicio en Salón (4 Fases):**
  1. *Fase 1 (Recibir):* Bienvenida personalizada y balanceo de mesas.
  2. *Fase 2 (Sugerir):* Menú QR, recomendación activa de bebidas y entradas.
  3. *Fase 3 (Plato Fuerte):* Sugerencia de maridaje.
  4. *Fase 4 (Cierre):* Postre/café, encuesta rápida de satisfacción y entrega de cuenta.

---

### **MÓDULO VI: TURNOS Y GESTIÓN OPERATIVA DE PERSONAL**

#### **RF-VI1: Reloj de Asistencia Georreferenciado y Permutas**
- **Validación GPS:** El colaborador solo puede marcar entrada/salida (`ShiftClockedIn`) si la geolocalización de su dispositivo confirma que está a menos de 50 metros del establecimiento.
- **Permutas de Turno:** Solicitud colaborativa entre empleados con flujo de aprobación directa en el dispositivo del Administrador.
- **Labor Cost % en Tiempo Real:** Relación porcentual inmediata entre el costo de nómina de las horas marcadas y la venta bruta obtenida en el turno.

---

### **MÓDULO VII: ABASTECIMIENTO PREDICTIVO POR IA**

#### **RF-VII1: Sugerencia Automática de Compras**
- **Motor Predictivo:** Algoritmo impulsado por Gemini 2.5 / Gemma local que cruza histórico de ventas, estacionalidad y pronóstico del clima.
- **Regla de Cálculo de Compra:**
  $$\text{Cantidad a Pedir} = (\text{Stock Teórico Requerido} + \text{Stock de Seguridad}) - \text{Stock Físico Actual}$$
- **Generación de Órdenes:** Propuesta consolidada agrupada por proveedor lista para enviar con un clic por WhatsApp o Email.

---

### **MÓDULO VIII: AUDITORÍA DE COMPRAS Y ALERTAS DE PRECIO**

#### **RF-VIII1: Escaneo OCR de Facturas de Proveedores**
- **Extracción Automática:** Proveedor, número de factura, ítems, cantidad y precio unitario de compra.
- **Alertas de Desviación de Costo:** Si el precio unitario facturado supera el margen de tolerancia histórica respecto a la ficha técnica, el sistema pinta el insumo de rojo en la bandeja de auditoría y envía una alerta crítica de impacto en el CMV.

---

### **MÓDULO IX: GESTIÓN DE EFECTIVO Y DASHBOARD DE SALUD FINANCIERA**

#### **RF-IX1: Arqueo Ciego de Caja Registradora**
- **Arqueo Ciego:** El cajero debe contar y digitar billetes y monedas por denominación física **sin conocer el saldo teórico del sistema**, evitando manipulación de arqueos.
- **Control de Faltantes:** El sistema calcula la diferencia entre el arqueo físico y las ventas netas (menos gastos autorizados), asociando cualquier descuadre directamente al usuario responsable.

#### **RF-IX2: Panel de Salud Financiera (Indicadores Clave)**
- **CMV Real (Costo de Materia Prima Solamente):**
  $$\text{CMV Real \%} = \left( \frac{\text{Inventario Inicial} + \text{Compras del Periodo} - \text{Inventario Final}}{\text{Ventas Netas Reales Sin Impuestos}} \right) \times 100$$
- **Tasa de Esfuerzo de Arriendo:**
  $$\text{Tasa Esfuerzo \%} = \left( \frac{\text{Canon Arriendo Neto} + \text{Administración} + \text{IVA Ocupación}}{\text{Ventas Netas Reales Sin Impuestos}} \right) \times 100$$
- **Límites Saludables:** Arriendo $< 10\%-15\%$, CMV Licores entre $18\% - 25\%$, CMV Comida $< 30\% - 33\%$. Si se superan estos límites, el panel despliega alertas rojas con sugerencias de ajuste en menú.

---

### **MÓDULO X: SEGURIDAD ALIMENTARIA E INTEGRACIÓN IOT (HACCP)**

#### **RF-X1: Control de Cadena de Frío e Inocuidad**
- **Captura de Temperatura:** Manual o vía termómetros Bluetooth a neveras y congeladores.
- **Límites Críticos HACCP:**
  - Refrigeración / Carnes / Pescados: $\le 5^\circ\text{C}$
  - Congelación: $\le -18^\circ\text{C}$
- **Acción Ante Falla:** Bloqueo de recepción de lotes perecederos y notificación push inmediata al administrador ante temperaturas fuera de rango.

---

### **MÓDULO XI: INTEGRACIÓN FISCAL DIAN Y CONTROL HARDWARE**

#### **RF-XI1: Facturación Electrónica DIAN (Serverless)**
- **Emisión:** Al registrar `OrderPaid`, una Firebase Cloud Function genera el XML tributario, firma digitalmente con el certificado `.p12` de las variables secretas y lo transmite vía mTLS al proveedor tecnológico.
- **Contingencia Offline:** Si la DIAN o la red fallan, se imprime una "Factura por Contingencia" con un hash/código de control local para no frenar la atención al cliente.

#### **RF-XI2: Hardware nativo vía Web APIs**
- Impresión directa ESC/POS vía Bluetooth y USB.
- Inyección directa de pesaje de insumos/licores desde balanzas por Web Serial API.

---

### **MÓDULO XII: ECOSISTEMA AGÉNTICO (MCP & GOOGLE GENKIT)**

#### **RF-XII1: Servidor MCP (Model Context Protocol)**
- Permite a agentes de IA de desarrollo (Cursor, Antigravity IDE, etc.) inspeccionar la base de datos local, validar esquemas JSON y generar componentes React en sincronía con los eventos de dominio.

#### **RF-XII2: Orquestación Multi-Agente con Genkit**
1. **Agente de Menú (OCR Skill):** Digitalización de cartas y costeo de recetas.
2. **Agente Conversacional (WhatsApp/Voz Skill):** Toma de comandas y reservas omnicanal.
3. **Agente de Finanzas (Audit Skill):** Auditoría de mermas, facturas de compras e indicadores macroeconómicos.

---

## **5. DICCIONARIO DE ESTRUCTURA DE DATOS (ESQUEMAS PRINCIPALES)**

### **5.1. InventoryItem (Insumo Maestro)**
```json
{
  "id": "ins-lic-gin-001",
  "name": "Ginebra Tanqueray London Dry",
  "category": "Licores",
  "purchaseUnit": "Botella 750ml",
  "countUnit": "ml",
  "yieldFactor": 1.0,
  "density": 0.94,
  "bottleTareWeightGrams": 450.0,
  "purchaseCost": 95000.00,
  "gainPercentage": 220.0,
  "isTaxable": true,
  "taxPercentage": 8.0,
  "stockMinLimit": 2250.0,
  "theoreticalStock": 5250.0,
  "realPhysicalStock": 5000.0,
  "abcClassification": "A",
  "supplierId": "prov-diageo-colombia",
  "sucursalStock": [
    { "sucursalId": "sede-norte-01", "stockActual": 150 },
    { "sucursalId": "sede-sur-02", "stockActual": 85 }
  ],
  "updatedAt": "2026-06-08T15:30:00Z"
}
```

### **5.2. KdsOrderTicket (Comanda KDS Cocina/Barra)**
```json
{
  "id": "kds-20260608-0192",
  "orderId": "ord-20260608-0192",
  "tableId": 14,
  "paxCount": 4,
  "waiterId": "user-mesero-camilo",
  "comandaTime": "2026-06-08T17:40:00Z",
  "timeLimitMinutes": 15,
  "isRushHourOrder": true,
  "items": [
    {
      "recipeId": "rec-gin-tonic-01",
      "name": "Gin Tonic Clásico",
      "category": "BAR",
      "quantity": 3,
      "modifiers": ["Doble hielo"],
      "status": "COMPLETED",
      "completedAt": "2026-06-08T17:48:00Z"
    }
  ],
  "overallStatus": "ATTENTION"
}
```

### **5.3. DomainOutbox (Cola de Eventos Offline)**
```json
{
  "eventId": "evt-orderpaid-10029",
  "eventType": "OrderPaid",
  "payload": {
    "orderId": "ord-20260608-0192",
    "tableId": 14,
    "totalAmount": 145000.00,
    "netAmountBeforeTax": 134259.25,
    "taxAmount": 10740.75,
    "paymentMethod": "Tarjeta Debito"
  },
  "status": "PENDING",
  "createdAt": "2026-06-08T17:40:00Z",
  "syncedAt": null
}
```

---

## **6. REQUERIMIENTOS NO FUNCIONALES (RNF)**

1. **Rendimiento de Interfaz:** Tiempo de respuesta táctil $< 100\text{ ms}$ al agregar ítems a una comanda en la PWA.
2. **Resiliencia Operativa:** Funcionamiento ininterrumpido en salón y cocina aun tras 8 horas continuas sin conexión a internet.
3. **Seguridad e Aislamiento Multitenant:** Cero filtración de datos entre tenants mediante validación estricta de Custom Claims en Firebase Rules y Cloud Functions.
4. **Protección de Llaves:** Almacenamiento seguro del certificado tributario `.p12` y API Keys en Google Secret Manager.
5. **Eficiencia en Costo IA:** Priorización del modelo local Ollama Gemma 2 para operaciones rutinarias en LAN local, reservando Gemini Cloud para OCR y análisis macro.

---

## **7. GUÍA PRÁCTICA PARA LA VALIDACIÓN DEL ANALISTA**

En tu rol como Analista de Requerimientos, asegúrate de verificar los siguientes escenarios borde (*edge cases*) durante el ciclo de vida del desarrollo:

1. **Prueba de Pérdida Transitoria de Conexión:**
   - Cortar la red mientras se cierra una orden y verificar que `DomainOutbox` almacene el pago y lo envíe automáticamente cuando retorne la red sin duplicar transacciones en Firestore.
2. **Prueba del Arqueo Ciego:**
   - Garantizar que la vista del cajero no entregue ningún indicio del total teórico calculado por el sistema hasta que el usuario haya presionado "Confirmar Arqueo".
3. **Prueba de Desviación de Costo de Insumos:**
   - Escanear una factura de compra simulada con un incremento del $15\%$ en un insumo clave y validar la generación del indicador rojo en la bandeja de auditoría.
4. **Prueba de Marcación GPS:**
   - Intentar marcar entrada al turno a más de 50 metros del establecimiento y confirmar que el sistema deniegue el registro e informe la distancia actual.

---
*Fin del documento de requerimientos.*
