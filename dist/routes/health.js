"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HEALTH ROUTES - Estado del servicio
 * ═══════════════════════════════════════════════════════════════════════════
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const router = (0, express_1.Router)();
/**
 * GET / - Página principal
 */
router.get('/', (req, res) => {
    res.json({
        service: 'POW Marketplaces Microservice',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: '/health',
            oauth: '/api/v1/oauth/meli/link',
            catalog: '/api/v1/hermes/catalog/sync',
            webhooks: '/webhook/meli',
        },
    });
});
/**
 * GET /health - Health check
 */
router.get('/health', async (req, res) => {
    try {
        // Verificar conexión a base de datos
        const prisma = (0, database_1.getPrisma)();
        await prisma.$queryRaw `SELECT 1`;
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            uptime: process.uptime(),
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: error.message,
        });
    }
});
/**
 * GET /status - Estado detallado
 */
router.get('/status', async (req, res) => {
    try {
        const prisma = (0, database_1.getPrisma)();
        // Obtener estadísticas básicas
        const [integrationsCount, ordersCount, marketplacesCount] = await Promise.all([
            prisma.integration.count(),
            prisma.order.count(),
            prisma.marketplace.count(),
        ]);
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            stats: {
                integrations: integrationsCount,
                orders: ordersCount,
                marketplaces: marketplacesCount,
            },
            uptime: process.uptime(),
            memory: process.memoryUsage(),
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
        });
    }
});
exports.default = router;
//# sourceMappingURL=health.js.map