"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POW MARKETPLACES - MICROSERVICIO EXPRESS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Microservicio de integración de marketplaces para POW/Hermes.
 * Reescrito en Express puro desde NestJS para mayor claridad y control.
 *
 * ARQUITECTURA:
 * - Express para HTTP routing
 * - Prisma para base de datos PostgreSQL
 * - Workers con node-cron para tareas programadas
 *
 * MÓDULOS PRINCIPALES:
 * - OAuth: Autenticación con MercadoLibre (PKCE flow)
 * - Webhooks: Recepción de notificaciones de marketplaces
 * - Catálogo: Sincronización bidireccional de productos
 * - Órdenes: Procesamiento y envío a Hermes
 * - Reglas: Motor de reglas de negocio
 *
 * @author POW Team
 * @version 2.0.0
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const logger_1 = require("./utils/logger");
const database_1 = require("./config/database");
// Rutas
const health_1 = __importDefault(require("./routes/health"));
const oauth_1 = __importDefault(require("./routes/oauth"));
const webhook_1 = __importDefault(require("./routes/webhook"));
const catalog_1 = __importDefault(require("./routes/catalog"));
const integrations_1 = __importDefault(require("./routes/integrations"));
const admin_1 = __importDefault(require("./routes/admin"));
const hermes_1 = __importDefault(require("./routes/hermes"));
const orders_1 = __importDefault(require("./routes/orders"));
// Workers
const scheduler_1 = require("./workers/scheduler");
// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════
const PORT = parseInt(process.env.PORT || '10000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
// ═══════════════════════════════════════════════════════════════════════════
// APLICACIÓN EXPRESS
// ═══════════════════════════════════════════════════════════════════════════
const app = (0, express_1.default)();
// Middleware de seguridad y parsing
app.use((0, helmet_1.default)({ contentSecurityPolicy: false }));
app.use((0, cors_1.default)({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Logging de requests en desarrollo
if (NODE_ENV === 'development') {
    app.use((req, res, next) => {
        logger_1.logger.debug(`${req.method} ${req.path}`);
        next();
    });
}
// ═══════════════════════════════════════════════════════════════════════════
// RUTAS
// ═══════════════════════════════════════════════════════════════════════════
// Health check (raíz)
app.use('/', health_1.default);
// API v1
app.use('/api/v1/oauth', oauth_1.default);
app.use('/api/v1/integrations', integrations_1.default);
app.use('/api/v1/hermes', hermes_1.default);
// Webhooks
app.use('/webhook', webhook_1.default);
// Catálogo y órdenes
app.use('/catalog', catalog_1.default);
app.use('/orders', orders_1.default);
// Administración
app.use('/admin', admin_1.default);
// Rutas legacy/compatibilidad
app.use('/marketplaces', (req, res) => {
    res.json({ message: 'Use /api/v1/integrations instead' });
});
// ═══════════════════════════════════════════════════════════════════════════
// MANEJO DE ERRORES
// ═══════════════════════════════════════════════════════════════════════════
// 404
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.path,
        method: req.method,
    });
});
// Error handler global
app.use((err, req, res, next) => {
    logger_1.logger.error('Error no manejado:', { error: err.message, stack: err.stack });
    res.status(500).json({
        error: 'Internal Server Error',
        message: NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    });
});
// ═══════════════════════════════════════════════════════════════════════════
// INICIO DEL SERVIDOR
// ═══════════════════════════════════════════════════════════════════════════
async function startServer() {
    try {
        logger_1.logger.info('🚀 Iniciando POW Marketplaces Microservice...');
        // Conectar base de datos
        await (0, database_1.initDatabase)();
        logger_1.logger.info('✅ Base de datos conectada');
        // Iniciar workers programados
        (0, scheduler_1.startScheduler)();
        logger_1.logger.info('✅ Workers iniciados');
        // Iniciar servidor HTTP
        app.listen(PORT, '0.0.0.0', () => {
            logger_1.logger.info(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🚀 POW MARKETPLACES MICROSERVICE                              ║
║                                                                  ║
║   Environment: ${NODE_ENV.padEnd(46)}║
║   Port: ${String(PORT).padEnd(54)}║
║   URL: ${APP_URL.padEnd(55)}║
║                                                                  ║
║   Endpoints:                                                     ║
║   • Health:       /health                                        ║
║   • OAuth:        /api/v1/oauth/meli/link                        ║
║   • Webhooks:     /webhook/meli                                  ║
║   • Catalog:      /api/v1/hermes/catalog/sync                    ║
║   • Integrations: /api/v1/integrations                           ║
║   • Admin:        /admin/health                                  ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
      `);
        });
    }
    catch (error) {
        logger_1.logger.error('❌ Error iniciando servidor:', { error: error.message });
        process.exit(1);
    }
}
// Manejo de señales de terminación
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM recibido, cerrando servidor...');
    process.exit(0);
});
process.on('SIGINT', () => {
    logger_1.logger.info('SIGINT recibido, cerrando servidor...');
    process.exit(0);
});
process.on('unhandledRejection', (reason) => {
    logger_1.logger.error('Unhandled Rejection:', { reason: reason?.message || reason });
});
process.on('uncaughtException', (error) => {
    logger_1.logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
    process.exit(1);
});
// Iniciar
startServer();
exports.default = app;
//# sourceMappingURL=index.js.map