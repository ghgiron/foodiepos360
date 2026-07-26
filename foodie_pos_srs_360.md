# **ESPECIFICACIÓN DE REQUERIMIENTOS DE SOFTWARE (SRS) \- FOODIE POS 360**

Este documento consolida la arquitectura funcional, de negocio y técnica de **Foodie POS (Gastrobar 360\)**. Está diseñado bajo el estándar **Vibecoding-Ready**, permitiendo que agentes de IA e IDEs generativos lean y entiendan con absoluta precisión las historias de usuario, modelos de datos, flujos de eventos y el stack técnico del sistema.

## **1\. STACK TECNOLÓGICO & ARQUITECTURA DE INFRAESTRUCTURA**

### **1.1. Stack de Desarrollo Core**

Para garantizar velocidad, compatibilidad multi-plataforma e interoperabilidad offline, se establece el siguiente stack:

* **Frontend Cliente:** Progressive Web App (PWA) construida con **React (Vite)**, **TypeScript** y **Tailwind CSS**.  
* **Persistencia en Cliente:** **IndexedDB** administrado mediante **Dexie.js** o **RxDB** para replicación reactiva local.  
* **Backend Serverless:** **Firebase Cloud Functions** (Node.js/TypeScript) como capa de APIs seguras y tareas en segundo plano.  
* **Base de Datos Centralizada:** **Google Cloud Firestore** (NoSQL) con sincronización de estado reactivo.  
* **Autenticación:** **Firebase Auth** (Soporte multitenant y Custom Claims).  
* **IA en la Nube:** **Google AI Studio SDK** (Llamadas seguras a Gemini 2.5 Flash y Gemini 2.5 Pro).  
* **IA Local (Costo $0/Offline):** Integración local mediante API de **Ollama** cargando **Gemma 2 (2B / 9B)** para procesamiento semántico offline de comandas y mermas en la red local del gastrobar.

### **1.2. Arquitectura RESTful API & Event-Driven (Microservices-Ready)**

El sistema operará bajo una arquitectura de **Eventos de Dominio**. El cliente PWA interactúa con el backend mediante endpoints **RESTful estructurados**, pero cada mutación de datos clave publica un evento asíncrono para permitir la adición futura de microservicios autónomos (como Nómina, Compras Predictivas o Fidelización).

                  ┌────────────────────────────────────────┐  
                  │          CORE POS (PWA Client)         │  
                  └───────────────────┬────────────────────┘  
                                      │ (Llamadas RESTful API)  
                                      ▼  
                  ┌────────────────────────────────────────┐  
                  │        GATEWAY / SERVERLESS APIS       │  
                  └───────────────────┬────────────────────┘  
                                      │ (Despacha)  
                                      ▼  
                  ┌────────────────────────────────────────┐  
                  │        BUS DE EVENTOS DE DOMINIO       │  
                  └───────────────────┬────────────────────┘  
                                      │  
         ┌────────────────────────────┼────────────────────────────┐  
         ▼                            ▼                            ▼  
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐  
│ Módulo Finanzas  │          │Módulo Inventario│          │Módulo Asistencia│  
│(Arqueo / Gastos)│          │(Descuento Stock)│          │(Nómina Ready)   │  
└─────────────────┘          └─────────────────┘          └─────────────────┘

#### **Eventos de Dominio Clave:**

* SubscriptionUpdated: Emitido desde el módulo EMI para habilitar/deshabilitar características operativas por tenant.  
* OrderPlaced: Emitido al enviar un pedido a cocina o barra.  
* OrderPaid: Emitido al procesar el pago final de una mesa o pedido omnicanal.  
* InventoryItemUpdated: Emitido ante compras, mermas o producción de subrecetas.  
* HaccpAlertTriggered: Emitido cuando un equipo de frío registra temperaturas críticas de peligro.  
* PurchaseOcrScanned: Emitido al digitalizar una factura de proveedor.

## **2\. ESTRATEGIA PWA OFFLINE-FIRST & COMUNICACIÓN CON HARDWARE NATIVO**

### **2.1. Resiliencia de Persistencia Offline-First**

La PWA utiliza **IndexedDB** como la Fuente Única de Verdad (*Single Source of Truth*) para la interfaz del cliente, asegurando la operación ininterrumpida ante pérdidas de internet:

1. **IndexedDB Local:** Almacenamiento local estructurado del catálogo, mesas, inventario y comandas en tránsito.  
2. **Cola Outbox:** Las transacciones locales se encolan en una tabla OutboxQueue con estados PENDING, PROCESSING o COMPLETED.  
3. **Sincronización:** Un ServiceWorker monitorea el evento de red online. Al conectarse, consume secuencialmente (FIFO) la OutboxQueue para actualizar la base de datos centralizada (ej. Firebase Firestore/Cloud DB).

### **2.2. Integración de Hardware POS mediante Web APIs Estándar**

Para prescindir de pesados drivers y programas intermedios, Foodie POS utiliza las APIs de hardware de los navegadores modernos para interactuar directamente con periféricos de la tienda física:

* **Web Bluetooth API:** Conexión y transmisión de buffers en protocolo **ESC/POS** de forma directa a impresoras térmicas portátiles y de mesa para tickets y comandas.  
* **Web USB API:** Conexión directa a impresoras de cocina alámbricas y cajones monederos mediante secuencias de control por pulsos.  
* **Web Serial API:** Comunicación con balanzas de peso físicas de cocina para ingredientes porciones pesadas y licores.

## **3\. ORGANIZACIÓN FUNCIONAL POR MÓDULOS (VIBECODING READY)**

### **MÓDULO I: EMI (ENTERPRISE MANAGEMENT INTERFACE) & MULTI-SUCURSAL**

#### **RF-I1: Habilitación Modular Dinámica y Multitenancy**

* **Historia de Usuario:**  
  Como **Superadministrador del POS (EMI)**,  
  quiero **activar o desactivar módulos funcionales de manera dinámica sobre la cuenta de un restaurante según su plan de suscripción**,  
  para **ejecutar un modelo de negocio SaaS escalable donde el restaurante solo pague y visualice las características que utiliza en su operación.**  
* **Criterios de Aceptación:**  
  * **Dado que** el Superadministrador accede al panel EMI, **cuando** modifica el estado de suscripción de un restaurante (ej. activa el Módulo VII de Abastecimiento Predictivo por IA), **entonces** el sistema debe publicar el evento SubscriptionUpdated y reconfigurar la barra de navegación del cliente de inmediato.  
  * **Dado que** se procesa la restricción del plan, **cuando** el sistema detecta que el cliente excede los límites permitidos de su nivel (ej. número de mesas configuradas, usuarios concurrentes o sedes activas), **entonces** debe bloquear visualmente la creación de nuevos recursos y sugerir un "Upgrade de Plan".

#### **RF-I2: Arquitectura Multi-sede Consolidada**

* **Historia de Usuario:**  
  Como **Dueño de Restaurante (Multisede)**,  
  quiero **consolidar la operación de múltiples sucursales bajo una única vista administrativa corporativa**,  
  para **comparar el rendimiento, auditar stocks y analizar la rentabilidad global del grupo gastronómico sin alternar entre cuentas independientes.**  
* **Criterios de Aceptación:**  
  * **Dado que** un usuario con rol "Dueño" o "Administrador Corporativo" inicia sesión, **cuando** accede al panel principal de Foodie POS, **entonces** el sistema debe presentar un selector de sedes en la parte superior y un dashboard con la consolidación financiera agregada de todas las sucursales activas.  
  * **Dado que** el usuario corporativo realiza una consulta, **cuando** filtra por sucursal específica, **entonces** todos los módulos operativos (Inventario, Ventas, Caja, KDS) deben limitar su alcance de datos únicamente a la sucursal seleccionada.

### **MÓDULO II: ASISTENTE DE CONFIGURACIÓN & DIGITALIZACIÓN (OCR)**

#### **RF-II1: Asistente Inicial de Configuración (Wizard) con Onboarding OCR**

* **Historia de Usuario:**  
  Como **Administrador / Dueño de Restaurante Nuevo**,  
  quiero **configurar los datos básicos de mi negocio a través de un asistente interactivo capaz de escanear y digitalizar mi documentación comercial (PDF o Imagen)**,  
  para **completar el onboarding de manera ágil, reduciendo errores de tipografía manual y acelerando el tiempo de puesta en marcha del POS.**  
* **Criterios de Aceptación:**  
  * **Dado que** el administrador inicia sesión por primera vez en un restaurante vacío, **cuando** el sistema inicia el "Wizard de Configuración", **entonces** debe solicitar de manera secuencial: Nombre del administrador, Nombre comercial, Dirección, Teléfono, Logotipo y régimen fiscal.  
  * **Dado que** el usuario prefiere automatizar el proceso, **cuando** selecciona "Subir Documento Comercial (OCR)" y carga una imagen o PDF de su registro de empresa, **entonces** el sistema debe digitalizar el documento, extraer campos clave mediante IA (RUT/RFC, Nombre de Representante, Dirección, Régimen Tributario), mapearlos en los inputs correspondientes del formulario y marcar con un indicador ámbar los datos que requieran verificación manual.

### **MÓDULO III: GESTIÓN DE MENÚ, RECETAS E INGENIERÍA DE MENÚS (BCG)**

#### **RF-III1: Carga de Menú Asistida por OCR**

* **Historia de Usuario:**  
  Como **Chef / Administrador**,  
  quiero **subir una foto o PDF de mi carta física de menú y dejar que la IA extraiga los nombres, descripciones y precios de venta**,  
  para **eliminar la digitalización manual del catálogo de ventas y agilizar el diseño inicial de mi carta en el POS.**  
* **Criterios de Aceptación:**  
  * **Dado que** el usuario está en el módulo "Creación de Elementos", **cuando** selecciona "Importar Carta por OCR" y arrastra una imagen o PDF del menú, **entonces** el sistema procesa el archivo y publica el evento MenuOcrProcessed con el listado estructurado de productos.  
  * **Dado que** finaliza la extracción de datos, **cuando** el sistema presenta el borrador digital de la carta, **entonces** debe permitir al chef asignar fotos, editar descripciones mediante un botón integrado de "Optimizar Copy con IA" (generando descripciones persuasivas con un tono orientado a la conversión) y vincular los productos a las categorías de venta.

#### **RF-III2: Recetario Técnico, Subrecetas e Ingeniería de Menú (Matriz BCG)**

* **Historia de Usuario:**  
  Como **Chef / Encargado de Costos**,  
  quiero **estructurar fichas técnicas con subrecetas y analizar la rentabilidad de mi menú mediante la Matriz BCG integrada**,  
  para **estandarizar la producción, calcular el CMV teórico exacto de cada plato y optimizar comercialmente mi carta con datos reales de popularidad y rentabilidad.**  
* **Criterios de Aceptación:**  
  * **Dado que** estoy estructurando un producto compuesto en el recetario, **cuando** defino sus ingredientes, **entonces** el sistema debe permitir incluir "Insumos Crudos" y "Subrecetas" (preparaciones intermedias fabricadas por lotes en el local, ej. salsas, jarabes) de forma anidada, calculando el costo total y el CMV teórico:  
    ![][image1]  
  * **Dado que** el POS registra ventas históricas, **cuando** el administrador accede al submódulo "Ingeniería de Menú", **entonces** el sistema debe procesar las transacciones y clasificar de forma interactiva los platos en la Matriz BCG bajo 4 cuadrantes:  
    * *Estrella:* Alta rentabilidad y alta popularidad.  
    * *Caballo de Batalla:* Baja rentabilidad y alta popularidad.  
    * *Rompecabezas:* Alta rentabilidad y baja popularidad.  
    * *Perro:* Baja rentabilidad y baja popularidad.

### **MÓDULO IV: OMNICANALIDAD, GESTIÓN DE COMANDAS Y CANALES DE VENTA**

#### **RF-IV1: Gestión Unificada de Comandas (POS, QR, Delivery y Asistente IA)**

* **Historia de Usuario:**  
  Como **Cajero / Administrador**,  
  quiero **procesar en un único hilo de control las comandas del salón (meseros), pedidos de auto-servicio QR de mesa, despachos para domicilios directos, integraciones con apps de terceros (Rappi) y reservas gestionadas por el Asistente IA**,  
  para **centralizar la producción y facturación de mi restaurante sin dispersar la operación en múltiples tabletas físicas.**  
* **Criterios de Aceptación:**  
  * **Dado que** entra un pedido por cualquiera de los canales activos (salón, QR, App Delivery, Rappi o Asistente IA conversacional), **cuando** la orden es confirmada, **entonces** el sistema debe enrutar automáticamente la comanda al KDS correspondiente (Cocina o Barra) marcando de forma visual su origen (ej. "Mesa 14", "Rappi \#1029" o "Llamada Telefónica IA").  
  * El sistema debe permitir integrar un asistente virtual de IA (Gemini 2.5 Flash o Gemma local) que reciba pedidos, asigne reservas o responda preguntas frecuentes por llamadas de voz o mensajes de WhatsApp de clientes, insertándolos en la cola de comandas en estado "Por Confirmar".

### **MÓDULO V: CULTURA DE SERVICIO, CHECKLISTS Y PROTOCOLOS (MODELO DISNEY)**

#### **RF-V1: Briefing Diario Rotativo de 15 Minutos y Misiones de Hospitalidad**

* **Historia de Usuario:**  
  Como **Administrador / Líder de Turno**,  
  quiero **iniciar obligatoriamente una reunión digital de briefing de 15 minutos al inicio del día antes de abrir el POS**,  
  para **revisar metas diarias, asignar un mesero diferente como líder rotativo y alinear al equipo de cara a la cultura de excelencia y hospitalidad Disney.**  
* **Criterios de Aceptación:**  
  * Al iniciar el turno diario, el POS debe permanecer bloqueado para la toma de comandas hasta que el administrador complete el checklist de "Briefing Diario" de 15 minutos en su dispositivo móvil.  
  * **Dado que** se inicia la reunión de briefing, **cuando** el sistema asigna el liderazgo, **entonces** debe seleccionar de manera aleatoria a un mesero o bartender diferente cada día (fomentando el empoderamiento y pertenencia al equipo).  
  * La pantalla del briefing diario de Foodie POS debe desplegar obligatoriamente de forma integrada:  
    * *Meta Financiera del Turno:* Presupuesto de ventas netas esperado y meta de ticket promedio por persona.  
    * *Faltantes del Menú:* Lista automática de recetas bloqueadas por quiebres de inventario.  
    * *Push de Venta del Día:* Plato o cóctel seleccionado para impulsar la venta cruzada.  
    * *Mística Disney:* Un consejo de hospitalidad corto generado de forma inteligente.

#### **RF-V2: Listas de Verificación Digitales y Protocolo Disney por Rol**

* **Historia de Usuario:**  
  Como **Colaborador (Mesero, Bartender, Cocinero, Administrador)**,  
  quiero **marcar mis listas de verificación de apertura, servicio y cierre directamente en mi teléfono de forma offline**,  
  para **asegurar la consistencia operativa de mi área y garantizar el protocolo de servicio de "Mesero Asesor de Ventas" (Modelo Disney).**  
* **Criterios de Aceptación:**  
  * **Dado que** un colaborador inicia o finaliza su turno, **cuando** la PWA se encuentra offline, **entonces** debe permitir rellenar las listas de chequeo correspondientes a su rol (ej. "Revisar faltantes en barra", "Limpiar y reponer salsas", "Sanitizar mesas recién utilizadas") en IndexedDB, y sincronizarlas de forma asíncrona una vez detectada conexión a internet.  
  * El checklist de servicio del mesero debe contener de forma obligatoria el flujo del "Protocolo Santo Mar/Malibu":  
    * *Fase 1 (Recibir):* Escoger mesas esparcidas para balancear el salón; presentarse por nombre al comensal.  
    * *Fase 2 (Sugerir bebidas/entradas):* Presentar código QR del menú; sugerir bebidas y entradas antes de tomar el plato fuerte.  
    * *Fase 3 (Platos fuertes y adicionales):* Sugerir maridaje específico.  
    * *Fase 4 (Cierre):* Ofrecer postre y café de cortesía rápida; solicitar retroalimentación del servicio (¿cómo estuvo la comida?, ¿qué tal el servicio?) antes de entregar la cuenta.

### **MÓDULO VI: TURNOS Y GESTIÓN OPERATIVA DEL PERSONAL**

#### **RF-VI1: Reloj de Asistencia Georreferenciado por GPS y Permutas de Turno**

* **Historia de Usuario:**  
  Como **Colaborador**,  
  quiero **marcar mi entrada y salida de turno (reloj de asistencia) mediante la geolocalización de mi móvil e intercambiar turnos de forma colaborativa**,  
  para **registrar mis horas laborales reales con transparencia, facilitar la flexibilidad laboral y evitar el papeleo manual.**  
* **Criterios de Aceptación:**  
  * **Dado que** el colaborador está listo para iniciar su turno, **cuando** presiona "Marcar Entrada" en su PWA, **entonces** el sistema debe validar mediante geolocalización de coordenadas (GPS) que el usuario se encuentra dentro del rango geográfico permitido del establecimiento (radio máx. de 50 metros) antes de registrar el evento ShiftClockedIn.  
  * **Dado que** dos colaboradores necesitan realizar una permuta de turno, **cuando** el usuario solicita el intercambio desde el "Módulo Horarios", **entonces** el sistema envía una alerta de aprobación de forma directa al dispositivo del Administrador para su validación o rechazo.  
  * El sistema debe calcular en tiempo real el costo proyectado de mano de obra (*Labor Cost %*) del local cruzando el registro de horas del reloj con las ventas brutas de las franjas horarias:  
    ![][image2]

### **MÓDULO VII: ABASTECIMIENTO PREDICTIVO POR IA**

#### **RF-VII1: Predicción de Demanda de Ventas y Abastecimiento Sugerido**

* **Historia de Usuario:**  
  Como **Administrador / Encargado de Compras**,  
  quiero **que el sistema use algoritmos de IA para predecir la demanda de ventas, transacciones y comensales diarios, cruzándola con mi inventario maestro**,  
  para **generar sugerencias inteligentes de compras por proveedor en base a plazos de entrega y estacionalidad, minimizando el desperdicio de materia prima perecedera.**  
* **Criterios de Aceptación:**  
  * **Dado que** el sistema procesa datos históricos de ventas, estacionalidad, tendencias locales y pronóstico climático (API meteorológica), **cuando** el administrador accede al submódulo predictivo, **entonces** el sistema debe proyectar con un modelo IA (Gemini 2.5 Flash o Gemma local) el volumen de transacciones de cada día de la semana entrante con un margen de aproximación meta del 99%.  
  * El sistema debe calcular las cantidades de materia prima perecedera y licores por pedir de forma automática bajo la regla:  
    ![][image3]  
  * Las cantidades calculadas deben consolidarse en una "Propuesta de Orden de Compra" agrupada por proveedor, permitiendo al administrador editar detalles finales antes de enviar las cotizaciones/pedidos de forma directa por WhatsApp o Email al proveedor.

### **MÓDULO VIII: AUDITORÍA DE COMPRAS Y CONCILIACIÓN AUTOMATIZADA**

#### **RF-VIII1: Digitalización OCR de Facturas de Compra y Alertas de Precios de Insumos**

* **Historia de Usuario:**  
  Como **Administrador / Dueño de Gastrobar**,  
  quiero **digitalizar mis facturas de compras (PDF o Fotos) mediante el motor OCR para conciliar de forma automática cantidades y precios con mi inventario maestro**,  
  para **actualizar mis stocks de inmediato sin digitación manual y recibir alertas críticas si algún insumo de mis proveedores experimenta un alza desmedida de precios.**  
* **Criterios de Aceptación:**  
  * **Dado que** se recibe mercancía de un proveedor, **cuando** el administrador toma una fotografía o carga el archivo de la factura de compra, **entonces** el motor OCR del sistema debe extraer automáticamente: Nombre del proveedor, Número de factura, Ítems de compra, Cantidades, Impuestos y Precios unitarios de compra.  
  * **Dado que** el sistema finaliza el escaneo, **cuando** procesa el ingreso de mercancía, **entonces** debe:  
    1. Actualizar el stock teórico del inventario maestro multiplicando por las unidades correspondientes.  
    2. Comparar el precio unitario cobrado en la factura contra el último "Precio de Compra Registrado" en la ficha técnica del insumo.  
    3. Si la variación de precio unitario es positiva (incremento) y supera el ![][image4] de margen, pintar el insumo en color rojo en la bandeja de auditoría y enviar una alerta crítica al administrador notificando el impacto potencial sobre el CMV real del restaurante.

### **MÓDULO IX: GESTIÓN DE EFECTIVO, FINANZAS & CONCILIACIÓN**

#### **RF-IX1: Arqueo Ciego de Caja Registradora, Movimientos de Caja y Depósito Bancario**

* **Historia de Usuario:**  
  Como **Cajero / Gerente de Turno**,  
  quiero **realizar arqueos físicos de caja registradora de forma ciega y registrar los depósitos bancarios de efectivo**,  
  para **garantizar la rendición de cuentas, mitigar robos hormiga y registrar la trazabilidad exacta del efectivo desde la mesa hasta la cuenta bancaria del negocio.**  
* **Criterios de Aceptación:**  
  * **Dado que** el cajero activa la pantalla de "Arqueo de Caja", **cuando** completa el conteo de efectivo, **entonces** el sistema debe obligar a ingresar las cantidades físicas de billetes y monedas por denominación (sin mostrar el saldo de ventas teórico esperado del sistema para forzar transparencia y evitar arqueos manipulados).  
  * **Dado que** se ingresa el arqueo físico, **cuando** el sistema compara el conteo contra el saldo teórico registrado (Ventas netas \+ base inicial \- cortesías/anulaciones), **entonces** calcula la diferencia y asocia cualquier faltante de caja al ID del cajero responsable.  
  * El sistema debe permitir registrar retiros parciales de caja (ej. para pagos de gastos menores o proveedores autorizados) y el depósito de efectivo final hacia el banco, cambiando el estado contable de "Efectivo en Caja" a "En Tránsito" y finalmente "Consignado en Banco".

#### **RF-IX2: Indicadores Técnicos de Salud Financiera (Dashboard David Penagos)**

* **Historia de Usuario:**  
  Como **Dueño de Gastrobar / Empresario Gastronómico**,  
  quiero **visualizar en un panel de control interactivo los indicadores de CMV Real y la Tasa de Esfuerzo de mi arriendo en tiempo real antes de impuestos**,  
  para **evaluar con rigurosidad matemática si mi negocio es verdaderamente rentable o si debo ajustar los precios de venta o renegociar costos fijos.**  
* **Criterios de Aceptación:**  
  * El sistema debe realizar de forma dinámica e interactiva todos sus cálculos financieros utilizando las ventas netas reales del periodo (restando obligatoriamente impuestos gubernamentales como IVA o Impoconsumo antes de aplicar las ecuaciones):  
    ![][image5]  
  * El panel debe calcular mensualmente la Tasa de Esfuerzo de Arriendo utilizando el canon de arrendamiento neto, los cobros de administración y el IVA de ocupación:  
    ![][image6]  
  * El sistema debe pintar en color verde si la Tasa de Esfuerzo se mantiene inferior al ![][image7] corporativo y si el CMV de barra de licores se mantiene entre el ![][image8] y el ![][image9], de lo contrario, emitir una alerta crítica roja con sugerencias inmediatas de corrección del menú.

### **MÓDULO X: SEGURIDAD ALIMENTARIA E INTEGRACIÓN IOT (HACCP)**

#### **RF-X1: Registro de Temperatura de Cadena de Frío e Integración IoT (HACCP)**

* **Historia de Usuario:**  
  Como **Administrador / Jefe de Cocina**,  
  quiero **registrar la temperatura de mis equipos de frío (neveras y congeladores) mediante termómetros Bluetooth o entradas del sistema**,  
  para **garantizar la inocuidad de las materias primas perecederas, prevenir intoxicaciones alimentarias y cumplir rigurosamente con el plan de control de peligros HACCP.**  
* **Criterios de Aceptación:**  
  * **Dado que** se inicia el checklist operativo de apertura, **cuando** el cocinero encargado ingresa las temperaturas de los equipos, **entonces** el sistema debe permitir capturar la información de manera directa mediante conexión con termómetros de mano Bluetooth o mediante ingreso manual de datos.  
  * **Dado que** se registra una temperatura por encima de los límites críticos de inocuidad alimentaria (ej. nevera de pescados frescos superior a 5°C o congelador de carnes superior a \-18°C), **cuando** se confirma el registro de la temperatura, **entonces** el sistema debe disparar de forma automática una notificación push de "Alerta Crítica HACCP" al celular del administrador y bloquear la aceptación de materias primas perecederas de ese lote por riesgo de contaminación.  
  * Los checklists completados se guardan localmente en IndexedDB ante fallas de conexión y se sincronizan al servidor centralizando el histórico de cumplimiento APPCC/HACCP.

### **MÓDULO XI: INTEGRACIÓN FISCAL DIAN Y CONTROL DE HARDWARE LOCAL**

#### **RF-XI1: Módulo Serverless Seguro para Firma de Facturación Electrónica DIAN**

* **Historia de Usuario:**  
  Como **Administrador / Dueño de Gastrobar en Colombia**,  
  quiero **transmitir automáticamente mis transacciones aprobadas a la DIAN mediante una arquitectura serverless de firmas criptográficas**,  
  para **cumplir con la obligatoriedad legal de facturación electrónica sin ralentizar el flujo táctil de cobro del POS y protegiendo mis llaves digitales privadas de accesos externos.**  
* **Criterios de Aceptación:**  
  * **Dado que** se emite el evento de dominio OrderPaid por un canal tributable de Colombia, **cuando** la transacción es guardada en la base de datos centralizada, **entonces** una función serverless independiente (Firebase Cloud Function en Node.js/TypeScript) debe interceptar la orden, estructurar el archivo XML tributario obligatorio de la DIAN, aplicar la firma digital utilizando el certificado SSL (.p12) almacenado de forma segura en las variables de entorno de Firebase Secrets, y transmitir la transacción con mTLS de doble factor al proveedor tecnológico autorizado.  
  * **Dado que** la transmisión a la DIAN falla o presenta latencia de red, **cuando** se procesa la fila de reintentos asíncrona, **entonces** el POS en mesa debe permitir imprimir un ticket bajo la figura de "Factura por Contingencia" con un identificador temporal único de control local para que el cliente pueda retirarse del gastrobar sin demoras de cobro.

#### **RF-XI2: Control Inalámbrico y ESC/POS Directo a Hardware Local (Web APIs)**

* **Historia de Usuario:**  
  Como **Cajero / Bartender / Mesero**,  
  quiero **comunicar directamente mi PWA con impresoras térmicas, balanzas de porciones y sensores de temperatura locales de forma nativa**,  
  para **ejecutar impresiones automáticas de comandas, comanda rápida, tiquetes de pago y pesajes precisos de porciones e insumos de barra sin recurrir a drivers o instalar aplicaciones pesadas nativas.**  
* **Criterios de Aceptación:**  
  * **Dado que** se inicia un proceso de pesaje de botella abierta (Módulo VIII), **cuando** el bartender coloca la botella en la balanza USB, **entonces** el sistema debe abrir un canal de lectura directa de peso utilizando **Web Serial API** para inyectar automáticamente el peso neto en gramos en el input correspondiente del POS eliminando la digitación manual.  
  * **Dado que** se manda una comanda a producción, **cuando** la PWA detecta conexión con el periférico asignado, **entonces** debe enviar ráfagas de comandos directos binarios de control estándar **ESC/POS** utilizando **Web Bluetooth API** (para impresoras portátiles de cinturón de meseros) o **Web USB API** (para impresoras fijas de barra y cocina) sin intervención de wrappers nativos.

### **MÓDULO XII: ECOSISTEMA AGENTICO,Skills Y MODEL CONTEXT PROTOCOL (MCP) PARA VIBECODING**

#### **RF-XII1: Servidor MCP (Model Context Protocol) de Foodie POS para Desarrollo Ágil**

* **Historia de Usuario:**  
  As an **AI Agent / Vibecoder (Cursor, Manus, Claucode, Antigravity IDE)**,  
  I want to **connect to the Foodie POS local code base via a standardized Model Context Protocol (MCP) server**,  
  so that **I can inspect collections, read JSON database schemas, auto-generate React components in sync with domain events and execute test runners autonomously.**  
* **Criterios de Aceptación:**  
  * **Dado que** el desarrollador arranca el entorno local de desarrollo con npm run dev:mcp, **cuando** el agente de IA (ej. Cursor) inicializa la sesión de Vibecoding, **entonces** el sistema debe levantar un servidor local MCP compatible con la especificación de Anthropic que exponga los recursos: esquemas JSON, tipos de TypeScript de los eventos de dominio de Foodie POS y rutas de API REST.  
  * **Dado que** el agente de IA solicita generar una nueva pantalla para el Módulo III, **cuando** lee los recursos a través del servidor MCP, **entonces** el agente debe autogenerar código libre de colisiones relacionales, alineado 100% con los tipos de IndexedDB/RxDB declarados en el repositorio.

#### **RF-XII2: Skills y Orquestación Multi-Agente con Google Genkit**

* **Historia de Usuario:**  
  Como **Desarrollador / Vibecoder**,  
  quiero **contar con flujos de IA empaquetados como "Skills" u Orquestas Multi-Agente mediante un framework modular como Google Genkit**,  
  para **manejar flujos conversacionales complejos de clientes (WhatsApp/Voz), procesamiento inteligente de imágenes y análisis financiero desacoplado del POS principal.**  
* **Criterios de Aceptación:**  
  * El backend de Foodie POS debe integrar **Google Genkit** como framework unificado para empaquetar flujos de IA como unidades lógicas reactivas independientes ("Skills") que asocian inputs estructurados, prompts parametrizados y outputs validados en formato JSON Schema.  
  * El sistema debe orquestar tres agentes especializados con flujos cruzados:  
    1. *Agente de Menú (OCR Skill):* Extrae datos semánticos, calcula CMV de recetas y genera descripciones optimizadas de marketing.  
    2. *Agente Conversacional (WhatsApp/Voz Skill):* Interactúa de forma directa con clientes finales para reservas y pedidos omnicanal, alimentando la cola de comandas mediante el evento OrderPlaced.  
    3. *Agente de Finanzas (Audit Skill):* Analiza mermas, fluctuación de precios de proveedores, y calcula indicadores macro financieros antes de impuestos (Tasa de esfuerzo y CMV).

## **5\. DICCIONARIO DE DATOS DE DOMINIO (ESQUEMAS INDEXEDDB & CENTRALIZADOS)**

### **5.1. Colección / Tabla: InventoryItem (Insumos Maestro con Logistics & Costeo)**

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
  "sucursalStock": \[  
    { "sucursalId": "sede-norte-01", "stockActual": 150 },  
    { "sucursalId": "sede-sur-02", "stockActual": 85 },  
    { "sucursalId": "sede-centro-03", "stockActual": 0 }  
  \],  
  "updatedAt": "2026-06-08T15:30:00Z"  
}

### **5.2. Colección / Tabla: LoyaltyPlan (Configuración de Redención y Puntos)**

{  
  "id": "loy-plan-gastro-01",  
  "planName": "Club Gastrobar Platinum",  
  "valueToPointRatio": 10000.00,   
  "pointValueWhenRedeemed": 1500.00,   
  "minimumPurchaseToEarnPoints": 50000.00,  
  "pointsExpirationMonths": 6,  
  "sendWelcomeEmail": true,  
  "applyToAllCustomers": true,  
  "createdAt": "2026-06-08T15:40:00Z"  
}

### **5.3. Colección / Tabla: PromotionBook (Libros de Precios y Happy Hours)**

{  
  "id": "promo-happy-hour-01",  
  "name": "Happy Hour Autor",  
  "startDate": "2026-06-01",  
  "endDate": "2026-08-31",  
  "startTime": "16:00",  
  "endTime": "19:00",  
  "activeDays": {  
    "monday": false, "martes": true, "miercoles": true, "jueves": true,   
    "viernes": false, "sabado": false, "domingo": false  
  },  
  "sucursalId": "sede-norte-01",  
  "rules": \[  
    {  
      "recipeId": "rec-gin-tonic-01",  
      "discountType": "PERCENTAGE",  
      "discountValue": 50.0   
    },  
    {  
      "recipeId": "rec-margarita-01",  
      "discountType": "FIXED\_PRICE",  
      "discountValue": 15000.00   
    }  
  \],  
  "isActive": true,  
  "updatedAt": "2026-06-08T15:45:00Z"  
}

### **5.4. Colección / Tabla: DailyBriefing (Briefing Diario Rotativo)**

{  
  "id": "brief-2026-06-08",  
  "date": "2026-06-08",  
  "briefingLeaderId": "user-mesero-camilo",  
  "salesTarget": 4500000.00,  
  "targetTicketPerPerson": 35000.00,  
  "promotedRecipeId": "rec-gin-tonic-01",  
  "notifiedShortages": \["rec-cerveza-artesanal-ipa-01"\],  
  "attendees": \["user-mesero-camilo", "user-bartender-lina", "user-chef-sergio"\],  
  "misticaApproved": true,  
  "completedAt": "2026-06-08T11:15:00Z"  
}

### **5.5. Colección / Tabla: KdsOrderTicket (Comanda KDS / Barra)**

{  
  "id": "kds-20260608-0192",  
  "orderId": "ord-20260608-0192",  
  "tableId": 14,  
  "paxCount": 4,  
  "waiterId": "user-mesero-camilo",  
  "comandaTime": "2026-06-08T17:40:00Z",  
  "timeLimitMinutes": 15,  
  "isRushHourOrder": true,  
  "items": \[  
    {  
      "recipeId": "rec-gin-tonic-01",  
      "name": "Gin Tonic Clásico",  
      "category": "BAR",   
      "quantity": 3,  
      "modifiers": \["Doble hielo", "Botanical Mist"\],  
      "status": "COMPLETED",   
      "completedAt": "2026-06-08T17:48:00Z"  
    },  
    {  
      "recipeId": "rec-hamburguesa-gourmet-01",  
      "name": "Hamburguesa de la Casa",  
      "category": "KITCHEN",   
      "quantity": 1,  
      "modifiers": \["Sin cebolla"\],  
      "status": "COOKING",  
      "completedAt": null  
    }  
  \],  
  "overallStatus": "ATTENTION"   
}

### **5.6. Colección / Tabla: DomainOutbox (Cola de Eventos Offline)**

{  
  "eventId": "evt-evt-orderpaid-10029",  
  "eventType": "OrderPaid",  
  "payload": {  
    "orderId": "ord-20260608-0192",  
    "tableId": 14,  
    "waiterId": "user-mesero-camilo",  
    "totalAmount": 145000.00,  
    "netAmountBeforeTax": 134259.25,  
    "taxAmount": 10740.75,  
    "paymentMethod": "Tarjeta Debito",  
    "items": \[  
      { "recipeId": "rec-gin-tonic-01", "quantity": 3, "unitPrice": 32000.00 },  
      { "recipeId": "rec-hamburguesa-gourmet-01", "quantity": 1, "unitPrice": 49000.00 }  
    \],  
    "clientData": {  
      "name": "Giovanni Guerrero",  
      "email": "giovanni.guerrero@malibugastrobar.com"  
    }  
  },  
  "status": "PENDING",   
  "createdAt": "2026-06-08T17:40:00Z",  
  "syncedAt": null  
}

eof  


[image1]: <data:image/png;base64,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>

[image2]: <data:image/png;base64,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>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAABCCAYAAADqrIpKAAAR0ElEQVR4Xu2cC9AlR1WA/4So4BPUGNjd3L67Gw2soMJaSAS1CKASUMQosRQJL4khPoMGSFVQKZEIiSAkyCuRl6YEC98pCiq8H8YykAUjIVGTQEwIAnnJumQ3u54zc878557bM//97/3/7L/L91V1TZ9z+j09Pd09fe/SEgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgDIajc7KOjh4lFJu27lz59dlPQBsAGTAfKo8pAfM7Vfd9u3bj83h1pItW7Z8d9Y5UoZbtCxZPwsed8eOHV+fbfNi7XO3t4+U/SHr3T6HE9Jmnwr9662mm+v+bmSkn7xW6rUruE+Iu0Lcr+WwhwNSr72L3keJf0Pw/+OAe7mH27p16/e7vw+5F4+UOPs1bratFZLHn63kcpzxeHx/KdNHsn4eZmmHeVn0vq4WaavnaJ7qxP8KuX48h1kUaftPlgX67IJxv+j1k/fHt69H/WZhaCIu7fM6LZ/0qx/PtpXwuPO2z6xs27Zt5PlIP7lcridL3qfkcIsi6X551rqU6bFqwlXCD6Yr7f99Wddhlf+dpPvrlRJdDXng2rRp03eulP5K9iE07lpN2GrtIxyxSPm+VjjuuOO+tdZO8oBdU9MfLljdjgqqpr+Ie3LQHXTkuTxLBodjsn5WNm/e/B2L3EeJe7eUYWfSaTtNpCn96BuizsKcE8PUkH52WqkMmGuFlekI9etLI5c7y326eSjtgmBN0upD0j8/69YDyeer0n5/mnS5LT8d5XmxCfNc7TZvf9f6RVnKcOo86awFmu9Q3mL71DwTNkXjDqW9Fkj6u5N8IE7YpOwPj/ZFWE1dSs8mk+juSLKW995Rl6ml0zB080pY+S5KnrDNQl+5ZkHjrsWETdJ5Z1851rJ9DkeOP/74b7HOed9sU/ra9XCgVrehZ+1gIeXZs8iEbcuWLfdZpE4S97aKrtpONd1KSJxnlnWcsEnf/kn3Sz4n5zKKvDfJz43yRifXZwhpi5/IulnRfHQSk3TNl54gr8mErW8ROQvz9vdanFy/jYLuWs07YbMdr6m6rhU20b0u6kQ+P07YRP5YtC/CaupSeiZsRrOo2759+3dlw6rQDMRdmPWKNP7Tsm4eJP1LDuEJ27q3z+GKPEQfHLqHQ7ZDnVrdrC9N6Q8mWp6DNWHTYwXyDL0o63M7aT8y/SeWQ82GPqNlHSdsSzYQK5LPz+a2EPnSKB9q5PoMIWFPyrpZsXueJ2jPc7/0gV8tazRhO+aYY75pNfWKzNvfNY70xV9Puq5+q0HLkHVryUaesEn635vT1/FL9I9yOdsXYTVplTRhE/+J7pf++wj3z02xAebYY4/dnm0ZK8hR+v3b/EeqXhpqm8h7rEN+1sK+p9gkR66PFvdhcR8Vd6YU/Emql+u5uTFEvlXDL7WfjzR8HLRPFfkuC/dL4m7sIrY6j6v+Jm7fhE1s+6WszzH/HeOelWFZRfuM2vMy/2D++4n/v82v7fMGTSe1z+8WW32rrdhOg1yfJ+560z3TdHpuohnMgv0/pNz31XCqt/Zp/KVtn67tJN+zLL1bw/1bdyzPmfLScGPbrRD//4l7tfnPMdtp2pYeNsTrzjWJ/xfdJtcr3b9t27bvEf9FKd7HVRZ3vcnq/1yx1Zvk9YESPgfZC6OJr+cLYlo1st3bXfrSj6g8as+6aZ7ab5uzLaofykf8r7E4rzH5Myrr/TV511Y705Tyj5/vj3S/XM+0+L+nfg+sOinng92/efPmLW6T8v1MSEvTnTjTM1T+jIT9l6xTNI7H0xVpTkPi/b6Vu5vsifyFsvz8H/CVbGmfhUvDs6fxusWjpT01rpmtmyDkMtQolQlbRG21+yPleZPLcr3B/VLPv1e/uPdo39czvyne3+b8olzz53qK/+Xi3mb+7vlxRD5b3AlR14eU56eyblYk7uOsru6udpvU+zhpizeX9oWofbY7D1rsnWB+bbtud8Xa9aJga8aKOGGT6/stv9d7vIyHXar0d/FfIm6f+XXc6sodyfWT+pwe7aI70/ul2K7ROqvfdgO1jveS6xUS5lfEvVTkI+X656ksL0nyOyw/P3utu80PMn8Mp7o71a/nssW/N07YNGzfeBDiHuFxY9rrgZff3FeSrRnT7NqNaVL+TSJfa6KOgXvcJu39CJFvVr9cn63x3eb+cG5ut4T/IbdHyuSETfPo+qYyas9o6jumW5iUyhhT2mduug0l42eoQb/LZ1smVeIMcR8N8kQlTRfDXxgHyaCPYXQSM5TGQ8V9Ido2bdr0jeavxh2YsN2sNynI042zNH/7uCx1/qMhu5dP8nlhtNfO95l8L/X7p0b1S9zXmV3bJ7ZX1z4uS3meon65vsL1kdJOLN+a3Fts4LtY3BvFPSHH60PzjGXqQ3dayuTq+ahUl7clWf3NzkZOvxKuanN5bGcJ5PrbNXv0i3uAyxL+r8Y9E33Fwn+ptAdXv6Ky3tccRu+J9kW/JyvlY3GeaLYfEP/z1S/Xn0vlfbK4d5p/t9gfa6aJs5fq1xWqy6bb531n1K5omxeS2SYmShL3+JzeUPkjpeeTkKUx4WphvBzFFkTRFvwTixfx3z4QNo9rlwT/VBkypW3zaji7Px9yWcOV5fujdWnuj/ivyuUT244oL1nfD7L7tR0m8ujzF6un+uX+nFYLp4jtF8Q9I+r6GC0wYVPsha9lc+cvWE3750vaYbPdrrwr15Q/T27Ff5W8tH9a/WnCNnjwv7ST5cH+rpMq9cv16GjLFOunwcUJxES8UL49Uu4fzPrVyPp8Sx2eumT9ZjQ90ctxbs4TtvCu1XJPjAfuN/nmrFsH/Dxw56IxyzWdyb5o6WzSNk+Jsvv1Hoj/i66vUWzC1lcuRdpV1BMTtuoYU4vboIbxjL+wKO2A9HkrzO2uH7WfHWoN4v5ZJmxajubTR81uaMf+E3H7rAwP9XC1uH0TNkXCP1DCXG3p5Hw6LO0V2yenIfLuqKvYYyf5jSgfffTR31wJf52Eu1z9Q1v6pdI+pq+GX09K+wu93nylXf9OrxomDhCu03Yw/8Vjm5i6zT8LaDyrq96nazyMh5tV1pfWkD3bJN+HZ13EynP/rI/U4mddzkf817qcy1dz/hL0cBm15QmbIn3tUWV596G3HWz3steeyx8Z0qc0u4Va0MUJ20T4SGknbJ8J8k05bOkZ1zxdC99NkvqwdPrK0aUV3Sz3J8vxk1i0q193ElzO2It6op5Dz48i+gdJvNdmvVLsV3QruK7tV4vGd39twibyHaOwKDad5nmS5x9tjo+f6qTOb872SE4j9fdmYZldDN9HacfpJqxcL8tpBNudUsfHhHhT/WE1sule7fpx2iww+015PLbx4PpYNgs7FTfrAs3EdMjlCLNgceMkKJdJv0pl3aVj2+HPtojapO6/ORTGKdOfRKfOq9qPVibK6m6pZyE2QQg8RbFPcr4d6Hq7ed0vH0paxZouFvyCsrw1PbUF6H5x/+VytmvjlsnVr4Z/WPBPxR33/BLDbOMoB/MEYvtYn71Y+5h/qv5RV7MH/3OjXJuQifzVYqvBmt3aJ6apk7amfUyu1iEiYV4s7mVDbrSKVbRtQx/o+xm52L5kV70fE6t41fnfpoj/DePwCzK1hRVft5tT2s9iM7V5lsX/rBXsEzZ/0UVdxOq0FhO2qXxc1ucy6nI4RcJ8W03vqC3/PY3q4mJnqB1mmLBNld8p4bNEpK8uEbXPMmGTe3CquE+6XNpPEl37xXh5XAv6x2q4cc+PZ5yy8oTt2Vk/y/3Jct45j/7a8Y1cTytLU88y8PwoUudTdEEZdX2sZmzIFDuakHTx3ugO5X+avvnsKddbx2nCpXEk7C+X9vNktV1t/PzyUtrJr5HtK/X3PobqV9rPqtV0dDEltjtKO/5Phcm6lWRFx9KQ96tyGJFvGi//mKZpIx8Pim0GhLBTcbNuLSmVSZDoLu0rk/59itTlt3KZSntsyvtTb3ndJtfbhsIpZfhHBw2j9rjU1JcFH2Nc7k1HKvOCPqMnrBWLYcbtOZY75To2+ek5jRT+lSK/JeuzfyiNmk0quVPT7YsbBzbHHuapsKJ/U9RFcninDM/qtUwTq/VsD379FNPJtQmZpddMwHp24LQOzTmdIDft4/Jy6HsOKcO7SuUlqOj2sF5H7X8uNef/nFhevTciXxBt2kY5XJaHbFkuK3/WV3/zSdrk86Rfv9vljIaXwWJz1kdyfkE3mE9pn8eJ//Eq6fyKMrYdE9WPwmc18T8xnPFSW3M20InpjMM5SbfF8D0vsMHyO2LblXWKppHrkrFy+ITtfTn8yHZeSntf/8314r/Rw5aVx7VuwWdl+mGXa5ThCZven3+PuqH74/6cnsre97Nd/O+TNN/u8pKt2K2ezThgstblTrtOpR/lcft+GKy3M1pswjbVblGn98bHN9Hfaronud/xOGL7sZxmsRf0qH1p+pklPevUjdMZTWOl/j4OC7MSJsCRXJao00lFto+Xf2jzF1GfyfFWkk3X7bAttWfjchyddJ1k/ou83U0+YO56l91m8npP2M6IC1XT6TP9v0Hu8rfP1RPHQJTSnrVr+nW2LfXsdJk//lXTBGWGCVveYctjTM1fRQOIO8cOOT56HFalvgqUG/dIcc8ftS9YDX+duBPK8qFG/XGBHu72b7mXxfT1O7DEfZzJGlY7e7MtabpbRD593P6fUfM5TdxVZtNVyOetfNeZXb+1N59zPK51fo87NZNVzH62HgDXeBb27hwuYmFu9PbJadv/RO0dtRPCN0pZXmnxTtC2tPgfNp3neeWonVn7J8zm/EnYsn+xT87E/avF1fN6zTkcce/1/Iut0rx9tJ2LtU9Z3nLXjt3dk3sKyfNCy/9ZKkt7vFv8f5nC6Cpyl92TZrJp+vdb3GYXTstv8u2Wjoa9XAfN0k7euzMp4v/cuH0Jn6CDjsW7wmx+D3aN28G9OSxb2n6pZ/f+x+Tml4n+6UpfSnJ9b0n/BeRIWn9cltO+S8uYwyjFfhRR2nvS/TfbrPmUSt8u7aeg3Xbe4h3Jpu13ulxP1D4a9FpvPWPX9M0Q9hQ7S/kRlYv1Tbk+TGWdbNtz+k9mb57TWcuv6G6QpPHCqBvbL4vN/fMofA5yynKf2OefAK1u+uONx5fllXNtbFK/usuGxjWLr37dedWDJ9VFh1NsJ97cLZLWB8TdL4XRHSy/P3FwfoDKVocL/P4Um1CKu3bc9n3/oUwzwVC9yVeGtPZJ2HMljR3FJvVeT9HfW+tZ7FBzae+PXptJR0nPj6U3OC5G9J5n3axYOfRs8akm/+G4snsm7kS1Bd2nxZ03ahenei9j327a1c7INgu+EsZPTX/UfmrVdHVH7gyPG1F7X3/3s3KSzovEvbTYn4JnLI7m6fXbG+vn47yes9Ny6HvMTLXPrid7PPGfLem8vbR9dI/apRyf1R8JjO2/LsVdPbJJp/UjT6d5f1j/2G/vnfOL7SZpH7Y8mvFA3Wj5xxO3xLiaXy3uWlPazY2/GbXPqtyWrT9a0tkykW+Qsv6BXC9O+ua9Mm5/tNS9O90m+nP1/hR7bsryGO3jwV0mN+/iiKZnNnX6X3TdAimE0XeXvuc0rxeY7oAtAroxxsJpOvp8P34yFdhw1HbQACJ9n5kPNejnG5vV3J9FJmxQp9b+NR0AHCTm/TdtOLzxPiHX87LtUEXqsl9Wmw/MetgYyP15VdbBPUPtU6lS0wHAQUBfYPpAust2+NrF+sS+hf8te4NRwvkT2Dgw/mwM7Lm/atz+sGz34fb8AwDAIUSxP72FjUGp/BoPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgnuH/AV2P9HM/rFXNAAAAAElFTkSuQmCC>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABsAAAAZCAYAAADAHFVeAAAByklEQVR4Xu2UzytEURTHZxoWSti8JPPmzbyZIrKaZCHFQhIrS/IvCCWJssBSyc5KpLBhpSgbWxubSUnxF4yFhY1mxufo3ZnbmTczWZtvne79fs/33nPufT8ikSYCpFKp7kQiMah1G9lstlVrf0YymXz0PO+cYkuMHzoviMfjbeRKWi+DTVaISzYZCHg/C84Yl40H3mNvwvye+CSeiRlimngTj+u6Y8ZXBQy7YlLxZHto5EJ0w9lwGG02oC1youBUr8YTChZtYzrkJCeMW0gx7UHP2cVADL5jcfEUbB4KKUBMaN0GDa3bxeCTNDdluDRb9/oMMG42Kub7fqddzLNeEMdx2htenwEdbmDek83o+FhGtCPtQ58jvol3fIuWXrR9dYF5lcV3Sit56pmEQZpi7ajhpmli3vbVRbCg9vcCMplMB54Xw5nfUPg2mF+l02m34q4gqgXMhUbFdD6EV3/4wSnyIVrNYvJsucIRS4pqv+ZlkVgL0arNkd/n1EUup3Xt19yIX9y/YzibjYuRn26f7TMI3SRSrXth1yggkTenkeCafO0RkDvltzSkdQG5ffnHBvNrfL3a8yfQxIPWbFDsgEJFYkHnmmjin+IH4KKFhE/pdBoAAAAASUVORK5CYII=>

[image5]: <data:image/png;base64,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>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAABLCAYAAADNo9uCAAAXlklEQVR4Xu2dCbRlRXWGH2ASzGgGRLv73Tq81xHtDGraGFFMC0ZAIEHFQAAzEDLIInEZiIQpBFGCsELWAjGJCeoCREQIGQQkiJE4AAoGGiIBldCo0DSDMjZTNy/7P2fv+/bZt85593a/1/3uvf+3Vq1TtXdVnTrDrbNvjRMThBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEDJkpJSeiLI2Op3OqeL+3sLT09OTXr8YkfL+XJQNitynjVG22Njaz2KQezQ1NfUTctgmyseZ5cuX7xBlw4a8A3futNNOr47yuSiK4lD5nR69td/h+UCuY98oGxS5jx+c4O+DEGJIpTATZU1I3HvFfdeJtpXw7YPksTWYnJycno8yIg9x10T5oEgen56P8kTkI/HrC5HvIPR7fjFMfghxV6xY8YNR1w+WftmyZb8QdTkk7lH9lk0Mh1VRNp/oe/QnUS5s128Z5xs572Hx3BL+vsqe5+Xynr0dcjHKXu7lhl5f39eh8ddEmTyH3/OyxURqeZ9E/n5xz0T5piD5rEf9FeWEkDFDKoOHpFJ8S5TnQMWRq6BEdl5OvtjY3DKa0be5+QD50P2q5POtKJ8P5qN8QPL5YpTNhd0j+aD/adTlQNxNNdgA0q9cufIHojzH9PT0C/u9N/3G21TwW8q1Ion8uR133PFHonwz2DYKmpB64BXxuiW8S5QZIn82ygykaUoXkfPulYsrskNy8sVC0/uE55qTbwbbzHN+hJBhQ4yGPaSy/LMoz4GPqlbCL446MAwVyuaWEenRDby5+Sw081W+NGA3ORj0HiHe5hhsC0W/5V/syO97+yhrAkMGctctsufEfS/IHmzKW3QXoJ7QvGotczk03nZRDvR9+naUjxvLli17vtyLG6KcEDIm5CrnJiTurW3xRbe7etFFOiPuL8XdLZXtV1wcyOH+V9xD4p6IeS5dunSZyNamqksB3V0/lUsrH4uvxrQRiXO4xHla3I1o8YnxU9WVe6Hme7DXRcS43Vny+Ff4Nf5RXq8yuA+Ku9POZXJJ+1ep+vCtFv87TB7ziMaOjyfHxzR852yq8kNbphH3LbnmPWO+eq8uRfnleKHXtZEGNNjmukdgamqqo7rPS9wr4TeDTeV2rRvVWRjP8X5x37e8LD5aKzPp79P0V8f4FtbWwEvFnezSPWvxfHzzS5nfmKrnWxowcu4dxX9D0vcoGp8i+464JyTdJ+W4LuR1osXT7t3H5Fl9wM6pcW+0+OJuStV1tb73np133vnHoqwJKc+KXN7II8pTS+uwxZXjhhQMvRwxb0+8H9YNLvJPyfFJyHbYYYcf1ftj5/2QD8tzfr2GrxV3RdIhHPLsftHylfDFkudpcrzb0nk0PZ7FNUm7OlUW78sRqPPkeFbS5+3jyjkOTFU9gHqs77GeIJ6LEDJGSAXweJQ1kauccsQKNqbRfJ524QfF7eL15heeF/Lapy2tR8rxYZ9WKtF9Q17fS1qhogsqljMi+lvxYVD/Pbn4Ijve5OFcM+LOSWoMeHnOL2V/jYT/2euSVu6xrOgODPm8z4fF4F0q4c85/W3RqGgiDWiwpfo9Qplz9wgfyh3hX7JkyQ8j7Muj6R5pC5vfwmawWTjG912mPr33F661CIP+43mA5n2b+fV4vbjn4NdWEJ//L4lb78Jed7k32OL5kvttIg+vh6Er5T3Wwm0MYrDJOV4Wy2FEuZy/8GGPxH0fjhLlj2O6SLxnEcnjmHDfan5xR6p/96BbHcInIGz3Q/wXx7zkvh6g/o+L+6jTrRG3v/ovienMH8PiP0TKf5DXJTUyLWz+fpDynVr0OXyFEDJCDFpZJNdqNAiS5lmpZF7hwqi0uvmI7iJxH4AfFZLobjIdkPAGq/TwkWhKG0E8X1mazPsxWB3Gg7aStF5bqhsv2TElqTIoe1oUcnFBLI+VJZZHdcmHvT+Fbuqo97qJhrKDycnJV3kn8Z6MspjGk9w9SlXLUu08Ej5D3B1B1mOwBf06+5A26HsMtqiX92CvnB7lVX3tPWkz2KLMYwaohdWfneEnug+ZwVZkWkW1XB9W/xqvL6qW4+tnY88Sn5fEXRVlMY3R1MIGIBd3t/prLbweyeM3fbgpP09bHNFdZ/o0283aQ6wbUhhXK9f9G1Z+FwfX9AdeBuIYtKZzghBvoxRjvxY9jMKP+XDR0K3cRFtZCCEjSJEZXDwX9jHKDZQGoluNIwwLrZhep3J0i7zSxZsJldj5Up7T1H+H+G8xncoeSdqtpa1F2bQRPc9uUeb9kvYFXt+GXM9Uqj4Y5mDw/ayPI7J9JM+vepnKs/c6lsfrPNDJ/f8ZHw7+2jihjL5GTpYjDdjC5u+RfCCXxHsk4Uclzn/5NIiDbi4fDnoYfnu36Oc02MS9uUV/hMbBO/uTkOFex3gaNyfbzcub/BF5T850BlutNRhomazr7Zsh38M6bqhBG4O0sHUaxrABM2K1HvCzxGtouWu/E3EXxHgexJF78KIoB5q+bKWU45FN5bNzufD5IYw/Uz0Gm5z339R/na97QtrsOUGMJ+5tUS/3dVenP9vr0MI4G3tuNL8ro5wQMqLAqGirhJrQCu4bUQ5Et0GPqJRiJYauoSMa9KhYT1c/xhLVumk1flkJZv75dtNGNN1xUeb9ci17en0TSbt4ggzpo3GJj8KXvEzl2Xsdy+N1HujMmLCw94t7rYVz+gk3U1DCsKgbz+VJAxhsqY97JP73JtelbXH8RyuWLc2PwZZNn/SdBVK2VRK+Ef6lS5f+tMWT4yUufs99U1nXYEYYa8tJmV4Of5PBJLqzzGBLoTtPZSj3WeqvtW6L/zD8hmdjN9N0/hxocY7l8GiZrhb3sqgDOpbsdi+Ta/yPtjxBqsZm1tIBuY8v0XNaC3I5PrYWSfHPDKSwbE5qMNjkOe0hx98P+do43G6d5XQ1wjmelus9ukWP38OZPgwD2ML9kEJrKyFkYdimGKBFZyHRiuPcKO8HSfuUuI8HWW2cTtIxPRrGuK39UZk5fbfCkXJcFbsJnP9gH5Z4K9vSelJYI0n8dyBs3W+S7i+C/j/N74ljxIyka1b5D6LKal1+Ku9JD8L5L/OtTxL+rPPPJPeRDPnVujjF/7gPa4uIfx7ZsuRIfRps+tHryTfl1/XqDvZO2mIiz/F3vT50kT4s+kO9fsLNKES44xYozaTvyT/nx29T8vm1qMvEr81mhMwmxuA8er43yPHNMLIRXr58+Y9r3EddOkxS+Bufj/nV2OsO6hf/A6EcxxUNf5wigxhsRaZr1gNdH/qLvcxml0ve7/TyiKZdm5Fh4Vgve0ryOlCD27UMFYjjRWGwdcdPiv+7ppf89gtxUcfh3FZn/a24e52+7E1Qf+1+hHyunZyc/GWvk3Nd5MO+/P3Qaem2JmQgioZm7S2BnPvwyUW8uKD8yO6RMv57oU3wQfdYlC0k+MHLD/9NUd4vkv5rWqFhDFCtxWSiMiDK8UviHtb4mBWFriNUhNDBYdbfw6mqOOFO0PT27xbuCstU02LRXkt7tkvbHWTusQ8QnHXpwpneDEC4TmYXBJHvLW6dnsMbpVgfCjNZURY8V3RpoXyQIa4fMG7p1zpDBRMDTN69f51qdtlMcgtupupjjfPgg4FJGJgliPB9Lt27NB2urTTg1F9iHyQ43BOTz0Xqw2BL1T0qF1NO9XuEgfJ2j9bhHkEuxxekqpsc5dnFyqVpYGwi/loYr6maSYx875HwrqlqiSn1+C2l6v0pw5oe99SHkb58Rpoe9xL52WxNPDPMPJ2B3MquuvKDbu+FxoMM19p9vn6GYqq6xD+Fsple/O82vcmQXvNZ6+usVL3XiHuzyYqqNRznxXXg94Z7gEkvkPWMl4z0a7Cl6l4h3/J5ifvvTJzjUL4oByiLpu2+lyq3Z1J713N0qpm0M+Ju0+NOMQ5I+v74Pzgq/7qme1LcKeq3d6tsYetU42Qh/5pP657Tw/onDUMxukMq0uxs3UesRTiF9wnoLHfEgzvZpbd3FfHx+8e7V/6uk/vd9APyjjKySNEKDy/De/SfGKYPw1J/dQoV4JZmU86rs4T+B2nxj1TDL7YfUDH3rBh8xOxHOeP/0SwWUv0DfnuqlrxApY0K+v+w1IGPv9BsynMi44e8J7dGGRku/PjAcaao/rTUukSHFf0uvjTK5xN066eGZUdS1Xr51lRN7Ci7jY2iamXGn2no+l6FYGTBbJfCLXba0S1CfJwY3lJs6nnlei7KpZVr/fnkljfIkao1kHrSLiZ8+eRaT3Kqcl0qH15ozOCPckIIGUVSNSHh5lTN4nx31A8bqRomULZYLyS570SqWgezwzNU1w2LbbJv0TCLf2yQG3BM6LfH+KDajS36HN8w38Ry9Es02Dr19YnuN3+OFNbbWYyk+nIHX3b+7piWLUVHF22NckIIGUV01u9rU9UDZQt8Dy2pmvjROFPXkDhvjTLQCUuvNJH7TkSZhJ+2lQOgS7pOodP35DHWyA15W9NNSdWg3mflAf014kxOTr7edGIk7dWpVkjH2kjeSrYVn9Gsmc3Xow8J/fu2SXAXTOlP1dgPTEtvHG8RDbaYj8pwjtqq5JLuJD1/6WDRm9+lq4VVhjFVp4vb6AahlvEkz6vE3ZJ0YL3JvbN85HwfS9Xq5OemzJgPj+jP0y7sSxGWtFMxzpYghQUjCSGEDA8ptGQ1kZswldxEl7mIaXOyVA3xKZdtgU7c5UHfk8dYk6q+5OxNSdWg3+7UdR+vJc0Gm2qMAbc+vQfGX8wj5F8z+Ipq3aF3WdhjBpsalrUFD42QV3fgfsq0sLWFxb/eZm1ldKUfLzq6nlVW9uN3wuwcKcPhMHgtHPVtiCG7vKNr6RTVwPjnbKZZjlQtXxHdeWowflTcOUWfe4KmasJAd5AsIYSQ4SHp2oFR3oTFleMZUddG5hw9y6qk6vv7TfXPJG2QcPqYx3iTWgw2j3zQX+Tj6c3FoPd9fDxPXPfKo+njw4v5d1dvF+PiTRL+oo9vmMFmYZTL/Nb9a/kVvavXD2qwta4ob36jU98b0XdtlustzcbMp8+RO2dqGOA536RqJlXP0hOEEEIWPyksdzQXWFpFvptfkDR/F3Vt5M4RZamaMFh+16Gz76XT9+Qx1qQWg01bYKArF3aM8VI1W3HGy1PLis+emM5kbfomosHmEfldzt+zKnkawGBDK1bUeZp0+rKX27Ek/ZeCuLFVTNNnt6IxJM6fmx/Gp1zHO7x+odH79UCUE0IIWfygp6rpW5UDdoActhskDcjFjzIJ34ueMdOl0CgT4489qcVgg7zjxkr5eN4/PT39wqSrwnt50TKjMFXjyeLD8/l/OaO/zIeNJoPNb3QtcY4xuchWS/gq9d8a04ZyYLBp7boLt15ccvswxnxANPLMn6quxaNMDgMyl94jcY6WOIdYuKi6VfsaADpfyPk/O1c5CSGELE6KzFZmTSS3ib2G+0oHcnFFdptvqAjfxnL9PAvrUmOftjCZKG9SuaK7X93b6WCcHKt+DA7sMTyAxHkN9oqL8qQrPjet5aNxyxYlGEGxHHr+An7kUTSs9A/jy58XmKGUtBsylOu+jq5KLv67Y9oQFwsg+peosRs05mMyO9dE6MMPfkyu6K5OniOFli01SMsWt6Y9OucbOd9HctdJCCFk8SP19xX91OHy3foHiXdKEG9b9D/eGd/+0i4w9Lt8l48TdP6b+BjGg1uY9IE8nJd2dPNZD1ZkxuB7MWC6+/AZEv+ApBt2z7XXGcaYYQ86+JFODbRut6C2PDWOkxsEGINyvj2iPIcUYz8590r45fz7R4MILVswVL1sU9A97LqbSzchca6PMiDyZ6Qc70xh5e2FQs71K/382MnwkarW5M+kapurKztuko/IbuhU+zqisj/ep1sMdKpV7tFdj9bzvbyuqIYkXI6yF2Edw61B0r0nO9oV1AJ2nahtkeQR+ef0mm8St3/Ug1RN3sIaYqv98yTjS6oaKT4f5VsK3TXmWnFHRh1I1bZr0HX3MCZkqJAPzfZRZmB7myhbSJo+IGT4mZycXILnK+58L9cp/nelhj1TB0Xe51VRNh9o2Wvvp666XtuHsY2FKptHynN/HwYb4mEfysbfG3ZmSZklkYyku8D4me1kvJH3YWNyY6EJISMMPgD97jFIhg95vv+UMwBSw56rm0Iu//kgaXdPzD+5zbfnIqZdCOQcp/djsOn44LbyYJhF6zCFNh0ZP/A+5IZAEUJGEP0gnh3lZHSIH3ld7X1elnPRLeMWxIiQfK/QI1rUvuDkfRlsC1k2j5TttH4MNh0S0lYeM9gwXvg9XmHPa470ZIywzeWjnBAyouAHn1p2niDDD56xLf4MxHD4Sty3Fl3xEm+9uPeL22D/2vX9gMMejBhfhfFab4eu0Jnj3ll+8MOQkePdOJ/JVfekyP5Qjs/4NJE0a7DtrfmX+xamYLC5sl+TdHHvpOPFvLP4GsYyRrmyrbGySfkP9zpPqs6H2eHokjrDG2y6q4st/t39bfVrsBXVAtqxVbEc1xrlKrPdWro6jAOUfI4Vd0wuDRl+ki7FFeWEkBFFKvT38kc/2qRq4K83WB73epV5fW15IPgLN+7S6zBzLPf+QGaTlOBPs4bUAyiPj2f+iOg+4/wwSsq4yRlsMB5DWVH2coX1trJ5vytnbeZ2k8GGNDBWXfhCb7D5/CXemRbu02Arl15APHEHq/9qi+DTx8XM9XrLawhl6GsmIBku9B15JsoJISPMHB8RMgLgGcuH+6Rly5Y9fyLM2LKt5aIzfXw/fLjJKAJioOwqujU+v1S11Nk5HpxoWVy60PUVDYm/QV3XYHN51Rx0bWVL1QQAK1s5Cz71lq2HVG0aHu/HJ8xgS24Bcu+g68dgk2s+Fx6J97jFFdlpFsGnT9XuNNlzeZ2k39PSkNEBz1Z+u9NRTggZYeSHfwNmqEU5GR3s493RfWuDrnHBbRB1Pqzj4XrSqqFQ7pKSKiPLx8ESF9dbmZy8RnItSwDdtJqmx2Dz8Yy2ssl9eJ36UbbSYNPwbq5sJ8+m6uqPjHmmymA7FX7fohbpx2AT/XnwSD6rcnG9TMvYE8cQ3TnJtUySkQK/IT5XQsYR/vhHG3m+l+kH/qmoA/H5+zFvUefDhdsBRY7/osePiHHybR9f3Roci4bu1UjKLDsisut8GvGfEvOQ/L+hx77KJuGVVjaTm86HjSiX8CfEnd6kN2MuLtSdAQbbBRZI1fi49T6CT9+p9mSOZVmjuq5hDiNSDttZmAw/qZrlzbXNCBlHpAK4dUL3mSWjiX7cs884VQP713eqvQkvluMfqXwd0qVqEdtVSdcCE/cllxZG2EEZ2YFwZli4vGampqZeIscTxD1qaYxOtSp72TIk7utRD3kIl2UXI/NVcrw46FCOVSmUDWuZubKtTbNlW2dl67it/DxJl0rR3UmOl3xu0bTXQi/hYxGW9L8jx5tRrolq/8ZHNV7Pwtkiu0R1cKshk3y2lzxOVD3GIT6s+jvFHQa5m+BwohqGZRezxttfFzZtMxLJEMJnSsiYkzKD0cnoIB/0T0aZB12OEue3JwZsjVHD4oAg3hYy6BCwgf0wknCUd213vw/h5qJlx168tbJr2cruTwdasg6xsmGBYRwHLZvEP0jP+0ZJ80os6hv0h/rwQoJrhwHpZRjfJGXYz8vI8CPv2iXyvFdEOSFkjJDK/bekMvhOlBNCCNn6FNUyLT2tzoSQMQRdLFIpvCXKCSGEbF3EWPvHKCOEjDFSKTyEAdJRTgghZOvAcWuEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCFDwv8D+2B2P7bjHisAAAAASUVORK5CYII=>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACYAAAAZCAYAAABdEVzWAAAB90lEQVR4Xu1VzytEURQeJT9SotRkmpk7jUkZG8V/ICtJNha2Un5ExErZWCkWLKxYKgs72YmdBStqIrJiErGimDTT+E5zb3M67n3NS1MW76uve853zr33e3PvexMKBfgniMfjQ1KTSCQSPVKrGmCoWymV02M+Fov1yR4CTN2hPiJ1J9C8hElTUjdAfQV8Bz/BcUu9CDMdFMNcK/IvsAAuIh/AuEM94LOc+wto2ge/9QTitOwhQL8Gj1meAc9ET9GVI27XY67cUSFcxlKpVLPclEAafuEWiiORSJvsseTLys8RGriMQbuUm2id+nd5LussrVWVHKENHsZIdxnjx0VXYoxi3Kl+cILXTOwbfzXGtD3wjWmrOPJh3ucLetEZh16RMYl0Ol2HnieTI+5Spbf6lPd5gjbBzz9r020GXDoH6nkT85coHA43Ib4pd3pAG5uz6TYDLt0Ax7eG+qDJsfYDtEOTo3ZvYk/QJpg4b9E/bAa0MetTY50G1LJc0/3brGeT153QxhakjicddRlDrVfqBNQKFk0a2+J1K8wHEtyQNYI2PcnydZtZAq1BnwupQztH7cjkyusoUTwAX8Es+KjHFyW+O9FotFGbu8B4pUp/LTW8h6CP0LohLn+9eRh9+TOyp2rAZrdS40gmk5300OCJrAUIECCAT/wAyoK0MslSk+AAAAAASUVORK5CYII=>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACYAAAAZCAYAAABdEVzWAAAB7UlEQVR4Xu1UQShEURQdJZRSSk2mZt40JmVsLOwsZSVJdhayQYiIlaWVhQULK1tlYSdbNlbKUk1kxZCJIgsziTg39zV37rz/5/+Fsvinbu/ec8977/z/Xi8Wi/BPkEqlRjSnkU6n+zT3Z4ChXmNMmcfPZDLZrzUEmLpGf0zznoB4DZPmNO8CtG+IccV9w0wX5TDXjrqE+EKsoh7CuEcaxKOc5wREB4gPnkAxrzUaMD/L2hpjXjXyTh7LFUVABDUGzZM2lkgkOvyMcb1uwhyhRRBj6L/yWGXMcj51owlyhC7UM4Z7MoljnKLcwxhdiQnWDiKmZa+iDIl6xtB7E3mNMcHvI54Ft4EPGpW6UOBFFzRPAF/E0CBqpzGNXC7XBN2DrZH3IN4Rp1LnC9oMv3/RwQ+DX1JcIGPQfNo8m8220TzK4/F4K/J8RekDNlZlgPmSg6trDMe3SR9la6x9C+7I1ujd2NwXtBkmLjv4MxUXbCxPtdYTsE4LegXJ8ZxdodmWfU+wsRXNa2QymW7exPOPoffl4LSxHdl3wj6QiC3d08CRDJAW44zuEWgNei40D+4cvWNbG7+jRPPQ/L7kBcQdj0Xj8e6Af0HcC+2L7PMROjfE5W821Zf/Umv+DNjsSnMSfA3oIT7RvQgRIkQIiR+hv6YyIcqEZQAAAABJRU5ErkJggg==>

[image9]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACYAAAAZCAYAAABdEVzWAAACHklEQVR4Xu2UMUhbURSGHUqtFAWhEgxJXpIGg5FCB6GDg4N0EildOrh3sFJRFBEHQScpHSqSqavg4CLi2g7dBEdBKk6tSkUpCNKGEtHv4L14PL48jCB0eD8c7j3//997zrv3Jg0NMf4TZDKZActZZLPZ55a7N9BQVxAEFTdW0+l0t/UIaGoH/bXlawLzBIuGLO9BwUk8/4hzfL1WF55mnjpvK/lf4owYJ3/J+Fk8xC+79gYwLftiLt5ZjwD+lNhU+W/ig/Gc18qZt7uxcuW4JWo1Ble2RQuFQpvmksnkE+sJyaeDeq7QI6Ix4a8V8TxXOqVzq6v0QXCbKwzDXRrTxYLLJzEoc95UH/FWa35eN+7Y2I1TIpaIY8XNcbKvtK8uuE2HLc+ms7YBTuNNWGMWpVLpIZ4DnzPvJP4QX7UvElKEgu8tL0A7pcFvKj90jUVeEXrVz/nBtPgPSSQSj5lvXzkj4BobsbwH2gyeE2JRcvHrZi3Q5vH0+5z1P+DWfI626+eRcIVGLR+GVCrVJP5cLle0moB9HqHvac6dcFl5Pmm9JlxjY5aneOC0F57j61eF0z4NtLMQzja2oPVQ+D9I4qPVaKJHNE7pmeTFYrHZeXPWK5A95O/C8nAbaOs+D6KuEnGFOCL2iJ9ulId97VE7TprZl5GvzWrdw11haEEef6Oslbl7/FvWc2+g2HfLaeTz+Q75aOKL1WLEiBGjTlwAu1+0p3uLOiUAAAAASUVORK5CYII=>