# Marketplace Microservice

Microservicio enterprise-grade desarrollado en Node.js/TypeScript con NestJS para la integración bidireccional con marketplaces externos (MercadoLibre, Garbarino, etc.). Gestiona webhooks, normaliza eventos comerciales, aplica reglas de negocio avanzadas y sincroniza catálogos de productos de manera segura y escalable.

## 🎯 Objetivo General

Este microservicio actúa como un intermediario inteligente entre marketplaces externos y el sistema interno OMS (Hermes), proporcionando:

- **Recepción de webhooks** de múltiples marketplaces
- **Normalización de eventos** a un formato estándar interno
- **Aplicación de reglas inbound** para filtrar, enriquecer o bloquear órdenes
- **Reenvío de órdenes válidas** al sistema OMS interno (Hermes)
- **Sincronización de catálogo** (precios, stock, publicaciones) desde Hermes hacia marketplaces
- **Aplicación de reglas outbound** para transformar datos antes del envío
- **Garantía de confiabilidad, seguridad y extensibilidad**

## 🏗️ Arquitectura Técnica

### Stack Tecnológico

- **Framework**: NestJS (Node.js + TypeScript)
- **Base de Datos**: PostgreSQL con Prisma ORM
- **Colas de Trabajo**: BullMQ + Redis
- **Logging**: Pino (logs estructurados)
- **Monitoreo**: Prometheus-ready metrics
- **Seguridad**: TLS en tránsito, encriptación AES-256-GCM para credenciales
- **Validación**: Webhook signature validation, JWT/API key para Hermes

### Flujo de Datos

```mermaid
graph TD
    A[Webhook Marketplace] --> B[Webhook Controller]
    B --> C[Validación Signature/Headers]
    C --> D[Respuesta 200 OK Rápida]
    D --> E[Encolar Payload]
    E --> F[WebhookProcessor]
    F --> G[Detectar Marketplace]
    G --> H[Adapter Específico]
    H --> I[Parsear a OrderEvent]
    I --> J[Enriquecer desde API]
    J --> K[Cola Orders]
    K --> L[OrdersProcessor]
    L --> M[Aplicar Reglas Inbound]
    M --> N{Regla Bloquea?}
    N -->|Sí| O[Guardar como BLOCKED_BY_RULE]
    N -->|No| P[Enviar a Hermes]
    P --> Q[Actualizar Estado]
    O --> R[Log Resultado]
    Q --> R
```

## 📋 Funcionalidades Principales

### 1. Rutas de Webhook

- **`/webhook/meli`** - Webhooks de Mercado Libre
- **`/webhook/{otro_marketplace}`** - Webhooks de otros marketplaces

**Características:**
- Validación de signature y credenciales
- Respuesta 200 OK rápida (< 200ms)
- Envío de payload raw a `WebhookProcessor`

### 2. WebhookProcessor

- Identifica integración y marketplace
- Usa parser específico del marketplace (ej: `MeliParser`)
- Convierte a formato estándar `OrderEvent`
- Encola job en BullMQ (`orders queue`)

### 3. OrdersService

- Worker consume jobs de la cola
- Aplica idempotencia (`marketplace_id + source_order_id`)
- Carga reglas inbound desde DB (`exclude_skus`, `add_tag_to_order`)
- **SIEMPRE guarda órdenes en DB**, incluso si son bloqueadas
- Si reglas pasan, reenvía orden a Hermes (POST `/orders`)
- Guarda resultado en DB (`ordenes + logs_sync`)

### 4. CatalogService

- Endpoint: `/admin/sync/catalog/:integration_id`
- Aplica reglas outbound (ej: `multiply_price`, `cap_stock`)
- Usa adapter del marketplace para transformar payload
- Llama API externa del marketplace y guarda logs
- Soporta actualizaciones masivas

### 5. Workers Nocturnos

- **Reconciliación de órdenes** (webhooks vs. API del marketplace)
- **Reintento de actualizaciones fallidas** (stock/precios)
- **Reprocesamiento de órdenes bloqueadas** si cambian las reglas
- **Verificación de expiración de tokens**

## 🗄️ Modelado de Base de Datos

### Tablas Principales

```sql
-- Marketplaces disponibles
marketplaces: id, name, health_status, last_health_check_at, response_time_ms

-- Integraciones por cliente
integraciones: id, cliente_id, marketplace_id, estado, ajustes_default JSON, created_at

-- Credenciales encriptadas
integration_credentials: id, integration_id, credentials_encrypted, token_last_refreshed_at

-- Reglas de negocio
integration_rules: id, integration_id, rule_key, rule_json, enabled

-- Órdenes procesadas
ordenes: id, integration_id, marketplace_id, source_order_id, payload_normalized, status, flag_reason, created_at, processed_at

-- Logs de sincronización
logs_sync: id, integration_id, tipo, detalle JSONB, resultado, created_at

-- Jobs de sincronización
sync_jobs: id, integration_id, job_type, payload, status, attempts, last_error, created_at
```

## 🔧 Configuración

### Variables de Entorno

```bash
# Base de datos
DATABASE_URL="postgresql://user:password@localhost:5432/marketplace_db"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Aplicación
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Hermes OMS
HERMES_API_URL=https://hermes.internal.com/api
HERMES_API_KEY=your_hermes_api_key

# Encriptación
ENCRYPTION_KEY=your_32_character_encryption_key_here
```

### Instalación

```bash
# Instalar dependencias
npm install

# Configurar base de datos
npx prisma generate
npx prisma db push

# Ejecutar aplicación
npm run start:dev
```

## 🚀 Uso del API

### Webhooks

```bash
# Mercado Libre
POST /webhook/meli
Headers: X-Signature, X-User-Id
Body: { "topic": "orders_v2", "resource": "/orders/123456", "user_id": 12345 }

# Garbarino
POST /webhook/garbarino
Headers: X-API-Key, X-Event-Type
Body: { "event": "order_created", "order_id": "GB123456", "data": {...} }
```

### Sincronización de Catálogo

```bash
# Sincronización completa
POST /catalog/sync/integration_123
Body: {
  "sync_type": "full_sync",
  "force_update": true
}

# Sincronización de productos específicos
POST /catalog/sync/integration_123
Body: {
  "sync_type": "partial_sync",
  "products": [
    {
      "id": "prod_123",
      "sku": "SKU-123",
      "price": 1500,
      "stock": 100
    }
  ]
}
```

### Administración

```bash
# Crear integración
POST /integrations
Body: {
  "client_id": "client_123",
  "marketplace_id": "mercadolibre",
  "default_settings": {
    "auto_sync": true,
    "sync_interval": "hourly"
  }
}

# Configurar credenciales
POST /integrations/integration_123/credentials
Body: {
  "access_token": "ML_ACCESS_TOKEN",
  "refresh_token": "ML_REFRESH_TOKEN",
  "webhook_secret": "WEBHOOK_SECRET"
}

# Aplicar reglas
POST /integrations/integration_123/rules
Body: {
  "rule_key": "exclude_skus",
  "rule_json": {
    "excluded_skus": ["SKU-001", "SKU-002"]
  },
  "enabled": true
}
```

## 🔒 Seguridad

### Credenciales

- **Nunca almacenadas en variables de entorno**
- **Encriptadas en reposo** usando AES-256-GCM
- **Almacenadas en tabla `integration_credentials`**
- **Refresh automático** de tokens por worker nocturno

### Validación de Webhooks

- **Signature validation** para Mercado Libre
- **API Key validation** para Garbarino
- **Headers de seguridad** con Helmet
- **Rate limiting** por integración

### Comunicación Interna

- **TLS en tránsito** para todas las comunicaciones
- **JWT/API Key** para autenticación con Hermes
- **Validación de payloads** con class-validator

## 📊 Monitoreo y Logs

### Logs Estructurados

```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.000Z",
  "msg": "Orden procesada: order_123",
  "order_id": "order_123",
  "integration_id": "integration_456",
  "marketplace": "mercadolibre",
  "status": "SENT_TO_HERMES",
  "processing_time_ms": 150
}
```

### Métricas Prometheus

- `webhook_received_total` - Total de webhooks recibidos
- `orders_processed_total` - Total de órdenes procesadas
- `orders_blocked_total` - Total de órdenes bloqueadas por reglas
- `catalog_sync_duration_seconds` - Duración de sincronizaciones
- `api_response_time_seconds` - Tiempo de respuesta de APIs externas

### Health Checks

```bash
# Estado general
GET /health

# Estado de integraciones
GET /integrations/integration_123/health

# Estado de marketplaces
GET /marketplaces/mercadolibre/health
```

## 🔄 Reglas de Negocio

### Reglas Inbound (Órdenes)

```typescript
// Excluir SKUs específicos
{
  "rule_key": "exclude_skus",
  "rule_json": {
    "excluded_skus": ["SKU-001", "SKU-002"],
    "action": "block"
  }
}

// Agregar tag a órdenes
{
  "rule_key": "add_tag_to_order",
  "rule_json": {
    "tag": "high_value",
    "condition": "total_amount > 10000"
  }
}

// Validar dirección de envío
{
  "rule_key": "validate_shipping_address",
  "rule_json": {
    "required_fields": ["street", "city", "postal_code"],
    "action": "block"
  }
}
```

### Reglas Outbound (Catálogo)

```typescript
// Multiplicar precios
{
  "rule_key": "multiply_price",
  "rule_json": {
    "multiplier": 1.15,
    "min_price": 100,
    "max_price": 50000
  }
}

// Limitar stock
{
  "rule_key": "cap_stock",
  "rule_json": {
    "max_stock": 100,
    "min_stock": 1
  }
}

// Filtrar categorías
{
  "rule_key": "filter_categories",
  "rule_json": {
    "allowed_categories": ["Electronics", "Home"],
    "action": "exclude"
  }
}
```

## 🏭 Adapters de Marketplace

### Mercado Libre

```typescript
// Parser de webhook
parseWebhookToOrderEvent(payload, headers): OrderEvent

// Enriquecimiento desde API
enrichOrderFromApi(orderEvent, credentials): OrderEvent

// Actualización de producto
updateProduct(product, credentials, syncType): ApiResponse
```

### Garbarino

```typescript
// Parser de webhook
parseWebhookToOrderEvent(payload, headers): OrderEvent

// Enriquecimiento desde API
enrichOrderFromApi(orderEvent, credentials): OrderEvent

// Actualización de producto
updateProduct(product, credentials, syncType): ApiResponse
```

## 🚨 Consideraciones Importantes

### Gestión de Órdenes

- **NUNCA rechazar órdenes entrantes**
- **SIEMPRE guardar en DB**, incluso si son bloqueadas
- **Marcar órdenes bloqueadas** con `status=blocked_by_rule` y `flag_reason`
- **Separar adapters** para inbound (webhook → interno) y outbound (interno → API marketplace)

### Motor de Reglas

- **Extensible** con reglas como funciones
- **Reglas inbound** solo para órdenes
- **Reglas outbound** solo para catálogo
- **Comentarios claros** en código

### Workers Nocturnos

- **Reconciliación automática** de órdenes
- **Reintento de jobs fallidos**
- **Verificación de tokens expirados**
- **Reprocesamiento** de órdenes bloqueadas si cambian reglas

## 📈 Escalabilidad

### BullMQ + Redis

**Justificación de la elección:**
- **Más simple** que RabbitMQ para jobs de alta concurrencia
- **Mejor rendimiento** para procesamiento de webhooks
- **RabbitMQ sería alternativa** para fanout o routing avanzado
- **Redis** proporciona persistencia y clustering

### Arquitectura Modular

- **Módulos independientes** (webhook, orders, catalog, rules)
- **Inyección de dependencias** para testing
- **Interfaces claras** entre componentes
- **Fácil extensión** para nuevos marketplaces

## 🧪 Testing

```bash
# Tests unitarios
npm run test

# Tests de integración
npm run test:e2e

# Tests de carga
npm run test:load
```

## 📚 Documentación API

La documentación completa de la API está disponible en Swagger:

```bash
# Desarrollo
http://localhost:3000/api

# Producción
https://marketplace-api.company.com/api
```

## 🤝 Contribución

1. Fork del repositorio
2. Crear branch de feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push al branch (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## 🚀 Despliegue

### Producción (Render)
- **URL**: `https://pow-marketplaces.onrender.com`
- **API Docs**: `https://pow-marketplaces.onrender.com/api/docs`
- **Health Check**: `https://pow-marketplaces.onrender.com/health`

### Desarrollo Local
```bash
npm install
npm run start:dev
```

### Variables de Entorno Requeridas
- `DATABASE_URL`: PostgreSQL connection string
- `ENCRYPTION_KEY`: AES-256-GCM encryption key
- `HERMES_BASE_URL`: Hermes OMS base URL
- `PORT`: Service port (default: 3002)

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 🆘 Soporte

Para soporte técnico o preguntas:

- **Email**: tech-support@company.com
- **Slack**: #marketplace-support
- **Documentación**: https://docs.company.com/marketplace

---

**Desarrollado con ❤️ por el equipo de Integraciones**