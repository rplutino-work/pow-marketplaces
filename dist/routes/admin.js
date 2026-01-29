"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADMIN ROUTES - Rutas de Administración
 * ═══════════════════════════════════════════════════════════════════════════
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
/**
 * GET /admin/health - Estado general del sistema
 */
router.get('/health', async (req, res) => {
    try {
        const prisma = (0, database_1.getPrisma)();
        const [marketplaces, integrations, orders, credentials] = await Promise.all([
            prisma.marketplace.count(),
            prisma.integration.count(),
            prisma.order.count(),
            prisma.integrationCredential.count(),
        ]);
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            counts: {
                marketplaces,
                integrations,
                orders,
                credentials,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Error en health check:', { error: error.message });
        res.status(500).json({ error: 'Error en health check' });
    }
});
/**
 * GET /admin/marketplaces/status - Estado de todos los marketplaces
 */
router.get('/marketplaces/status', async (req, res) => {
    try {
        const prisma = (0, database_1.getPrisma)();
        const marketplaces = await prisma.marketplace.findMany({
            include: {
                _count: { select: { integrations: true, orders: true } },
            },
        });
        const result = marketplaces.map(m => ({
            id: m.id,
            name: m.name,
            health_status: m.health_status,
            last_health_check: m.last_health_check_at?.toISOString() || null,
            response_time_ms: m.response_time_ms,
            integrations_count: m._count.integrations,
            orders_count: m._count.orders,
        }));
        res.json(result);
    }
    catch (error) {
        logger_1.logger.error('Error obteniendo estado de marketplaces:', { error: error.message });
        res.status(500).json({ error: 'Error interno' });
    }
});
/**
 * GET /admin/integrations/:id - Detalle de integración
 */
router.get('/integrations/:id', async (req, res) => {
    try {
        const prisma = (0, database_1.getPrisma)();
        const integration = await prisma.integration.findUnique({
            where: { id: req.params.id },
            include: {
                marketplace: true,
                credentials: {
                    orderBy: { updated_at: 'desc' },
                    take: 1,
                },
                rules: true,
                _count: { select: { orders: true, sync_logs: true } },
            },
        });
        if (!integration) {
            return res.status(404).json({ error: 'Integración no encontrada' });
        }
        const credential = integration.credentials[0];
        res.json({
            id: integration.id,
            hermes_integration_id: integration.hermes_integration_id,
            cliente_name: integration.cliente_name,
            cliente_domain: integration.cliente_domain,
            marketplace: {
                id: integration.marketplace.id,
                name: integration.marketplace.name,
                health_status: integration.marketplace.health_status,
            },
            estado: integration.estado,
            hermes_api_url: integration.hermes_api_url,
            hermes_enabled: integration.hermes_enabled,
            token_info: credential ? {
                has_token: !!(credential.access_token || credential.credentials_encrypted),
                user_id: credential.user_id,
                expires_at: credential.expires_at?.toISOString(),
                is_valid: credential.expires_at ? credential.expires_at > new Date() : false,
            } : null,
            rules: integration.rules.map(r => ({
                id: r.id,
                rule_key: r.rule_key,
                rule_type: r.rule_type,
                enabled: r.enabled,
                priority: r.priority,
            })),
            counts: {
                orders: integration._count.orders,
                logs: integration._count.sync_logs,
            },
            created_at: integration.created_at,
            updated_at: integration.updated_at,
        });
    }
    catch (error) {
        logger_1.logger.error('Error obteniendo integración:', { error: error.message });
        res.status(500).json({ error: 'Error interno' });
    }
});
/**
 * PATCH /admin/integrations/:id - Actualizar integración
 */
router.patch('/integrations/:id', async (req, res) => {
    try {
        const prisma = (0, database_1.getPrisma)();
        const { estado, hermes_enabled, cliente_name } = req.body;
        const updateData = { updated_at: new Date() };
        if (estado !== undefined)
            updateData.estado = estado;
        if (hermes_enabled !== undefined)
            updateData.hermes_enabled = hermes_enabled;
        if (cliente_name !== undefined)
            updateData.cliente_name = cliente_name;
        const integration = await prisma.integration.update({
            where: { id: req.params.id },
            data: updateData,
        });
        logger_1.logger.info(`Integración actualizada por admin: ${integration.id}`);
        res.json({ success: true, integration });
    }
    catch (error) {
        logger_1.logger.error('Error actualizando integración:', { error: error.message });
        res.status(500).json({ error: 'Error interno' });
    }
});
/**
 * POST /admin/sync/catalog/:integration_id - Forzar sincronización de catálogo
 */
router.post('/sync/catalog/:integration_id', async (req, res) => {
    try {
        const prisma = (0, database_1.getPrisma)();
        const integration = await prisma.integration.findUnique({
            where: { id: req.params.integration_id },
        });
        if (!integration) {
            return res.status(404).json({ error: 'Integración no encontrada' });
        }
        // Crear job de sincronización
        const job = await prisma.syncJob.create({
            data: {
                integration_id: integration.id,
                job_type: 'catalog_sync',
                payload: JSON.stringify({ forced: true, requested_by: 'admin' }),
                status: 'pending',
            },
        });
        res.json({
            success: true,
            message: 'Sincronización de catálogo programada',
            job_id: job.id,
        });
    }
    catch (error) {
        logger_1.logger.error('Error programando sincronización:', { error: error.message });
        res.status(500).json({ error: 'Error interno' });
    }
});
/**
 * POST /admin/disable/all/:integration_id - Desactivar integración
 */
router.post('/disable/all/:integration_id', async (req, res) => {
    try {
        const prisma = (0, database_1.getPrisma)();
        await prisma.integration.update({
            where: { id: req.params.integration_id },
            data: { estado: 'suspended', hermes_enabled: false, updated_at: new Date() },
        });
        logger_1.logger.info(`Integración desactivada por admin: ${req.params.integration_id}`);
        res.json({ success: true, message: 'Integración desactivada' });
    }
    catch (error) {
        logger_1.logger.error('Error desactivando integración:', { error: error.message });
        res.status(500).json({ error: 'Error interno' });
    }
});
/**
 * POST /admin/resync/orders/:integration_id - Reenviar órdenes pendientes
 */
router.post('/resync/orders/:integration_id', async (req, res) => {
    try {
        const prisma = (0, database_1.getPrisma)();
        const pendingOrders = await prisma.order.count({
            where: {
                integration_id: req.params.integration_id,
                status: { in: ['pending', 'failed'] },
            },
        });
        // Crear jobs para reenvío
        if (pendingOrders > 0) {
            await prisma.syncJob.create({
                data: {
                    integration_id: req.params.integration_id,
                    job_type: 'order_reconciliation',
                    payload: JSON.stringify({ target_statuses: ['pending', 'failed'] }),
                    status: 'pending',
                },
            });
        }
        res.json({
            success: true,
            message: `${pendingOrders} órdenes programadas para reenvío`,
            pending_orders: pendingOrders,
        });
    }
    catch (error) {
        logger_1.logger.error('Error programando reenvío de órdenes:', { error: error.message });
        res.status(500).json({ error: 'Error interno' });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map