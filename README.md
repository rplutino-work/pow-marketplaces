# POW Marketplaces Microservice

Microservicio para integración con marketplaces (MercadoLibre, etc.) desarrollado con Express.js + TypeScript + Prisma.

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Express.js Application                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  Routes              │  Services              │  Workers                     │
│  ├── /health         │  ├── oauth.ts          │  ├── tokenRefresh (1h)      │
│  ├── /webhook        │  ├── catalog.ts        │  └── healthCheck (3min)     │
│  ├── /api/v1/oauth   │  ├── orders.ts         │                              │
│  ├── /api/v1/hermes  │  ├── webhooks.ts       │  Database                    │
│  ├── /api/v1/integrations│ ├── integrations.ts│  └── PostgreSQL + Prisma    │
│  ├── /orders         │  ├── mercadolibre.ts   │                              │
│  └── /admin          │  └── hermes.ts         │                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 📋 Endpoints Principales

### Webhooks
- `POST /webhook/meli` - Recibe webhooks de MercadoLibre

### OAuth
- `GET /api/v1/oauth/meli/link` - Inicia flujo OAuth simplificado
- `GET /api/v1/oauth/auth/callback` - Callback de MercadoLibre
- `GET /api/v1/oauth/integrations/:id/status` - Estado del token

### Catálogo
- `POST /api/v1/hermes/catalog/sync` - Sincronizar catálogo desde Hermes

### Integraciones
- `GET /api/v1/integrations` - Listar integraciones
- `GET /api/v1/integrations/:id` - Detalle de integración
- `POST /api/v1/integrations` - Crear integración
- `DELETE /api/v1/integrations/:id` - Eliminar integración

### Órdenes
- `GET /orders` - Listar órdenes
- `GET /orders/:id` - Detalle de orden
- `POST /orders/:id/retry` - Reintentar orden fallida

## 🚀 Instalación

```bash
# Clonar repositorio
cd msmarketplaces-express

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Generar cliente Prisma
npm run prisma:generate

# Ejecutar migraciones
npm run prisma:migrate

# Iniciar en desarrollo
npm run dev
```

## 🔧 Variables de Entorno

| Variable | Descripción | Requerido |
|----------|-------------|-----------|
| `DATABASE_URL` | URL de PostgreSQL | ✅ |
| `ENCRYPTION_KEY` | Clave de encriptación (32 bytes base64) | ✅ |
| `MELI_CENTRAL_APP_ID` | ID de app MercadoLibre POW | ✅ |
| `MELI_CENTRAL_APP_SECRET` | Secret de app MercadoLibre | ✅ |
| `APP_URL` | URL pública del microservicio | ✅ |
| `PORT` | Puerto del servidor | ❌ (default: 3002) |
| `NODE_ENV` | Entorno (development/production) | ❌ |
| `LOG_LEVEL` | Nivel de logs | ❌ (default: info) |

## 📦 Scripts

```bash
npm run dev          # Desarrollo con hot-reload
npm run build        # Compilar TypeScript
npm run start        # Iniciar producción
npm run prisma:studio # UI de base de datos
```

## 🔐 Flujo OAuth

1. Usuario clickea "Autorizar" en Hermes
2. Hermes redirige a `/api/v1/oauth/meli/link`
3. Microservicio genera PKCE y redirige a MercadoLibre
4. Usuario autoriza en MercadoLibre
5. MercadoLibre redirige a `/api/v1/oauth/auth/callback`
6. Microservicio intercambia code por tokens
7. Tokens se guardan encriptados
8. Usuario es redirigido a Hermes

## 🔄 Workers Automáticos

### Token Refresh (Cada hora)
Renueva automáticamente tokens próximos a expirar.

### Health Check (Cada 3 minutos)
Verifica conectividad con las APIs de marketplaces.

## 🚀 Deploy en Render

1. Crear Web Service en Render
2. Conectar repositorio
3. Build Command: `npm install && npm run prisma:generate && npm run build`
4. Start Command: `npm run start:prod`
5. Configurar variables de entorno en dashboard

## 📁 Estructura del Proyecto

```
src/
├── index.ts           # Punto de entrada
├── config/
│   └── database.ts    # Configuración Prisma
├── routes/
│   ├── health.ts      # Health checks
│   ├── webhook.ts     # Webhooks
│   ├── oauth.ts       # OAuth
│   ├── catalog.ts     # Catálogo
│   ├── integrations.ts # Integraciones
│   ├── orders.ts      # Órdenes
│   └── admin.ts       # Administración
├── services/
│   ├── oauth.ts       # Lógica OAuth
│   ├── catalog.ts     # Lógica catálogo
│   ├── orders.ts      # Lógica órdenes
│   ├── webhooks.ts    # Lógica webhooks
│   ├── integrations.ts # Lógica integraciones
│   ├── mercadolibre.ts # API MercadoLibre
│   ├── hermes.ts      # API Hermes
│   ├── rules.ts       # Reglas de negocio
│   └── encryption.ts  # Encriptación
├── workers/
│   ├── scheduler.ts   # Programador de tareas
│   ├── tokenRefresh.ts # Renovación de tokens
│   └── healthCheck.ts # Verificación de salud
├── types/
│   └── index.ts       # Tipos TypeScript
└── utils/
    └── logger.ts      # Utilidad de logging
```

## 📝 Licencia

Propietario - POW
