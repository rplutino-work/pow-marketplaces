"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WEBHOOK ROUTES - Recepción de Webhooks de Marketplaces
 * ═══════════════════════════════════════════════════════════════════════════
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const ordersService = __importStar(require("../services/orders"));
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
/**
 * POST /webhook/meli - Webhook de MercadoLibre (endpoint principal)
 */
router.post('/meli', async (req, res) => {
    await handleMercadoLibreWebhook(req, res);
});
/**
 * POST /webhook/mercadolibre - Webhook de MercadoLibre (compatibilidad)
 * @deprecated Usar /webhook/meli
 */
router.post('/mercadolibre', async (req, res) => {
    logger_1.logger.warn('⚠️ Usando endpoint deprecado /webhook/mercadolibre, usar /webhook/meli');
    await handleMercadoLibreWebhook(req, res);
});
/**
 * POST /webhook/:marketplace - Webhook genérico
 */
router.post('/:marketplace', async (req, res) => {
    const { marketplace } = req.params;
    logger_1.logger.info(`📥 Webhook recibido para marketplace: ${marketplace}`);
    // Por ahora solo soportamos MercadoLibre
    if (marketplace === 'meli' || marketplace === 'mercadolibre') {
        return handleMercadoLibreWebhook(req, res);
    }
    res.status(200).json({ received: true, marketplace });
});
// ═══════════════════════════════════════════════════════════════════════════
// HANDLER DE MERCADOLIBRE
// ═══════════════════════════════════════════════════════════════════════════
async function handleMercadoLibreWebhook(req, res) {
    const webhook = req.body;
    logger_1.logger.info('📥 Webhook MercadoLibre recibido:', {
        topic: webhook.topic,
        resource: webhook.resource,
        user_id: webhook.user_id,
    });
    // Responder rápido para evitar reenvíos
    res.status(200).json({ received: true });
    try {
        const prisma = (0, database_1.getPrisma)();
        // Buscar integración por user_id
        const credential = await prisma.integrationCredential.findFirst({
            where: { user_id: String(webhook.user_id) },
            include: { integration: true },
        });
        if (!credential) {
            logger_1.logger.warn(`No se encontró integración para user_id: ${webhook.user_id}`);
            return;
        }
        const integrationId = credential.integration_id;
        // Log del webhook
        await prisma.syncLog.create({
            data: {
                integration_id: integrationId,
                tipo: 'webhook_received',
                detalle: JSON.stringify(webhook),
                resultado: 'success',
            },
        });
        // Procesar según topic
        switch (webhook.topic) {
            case 'orders_v2':
            case 'orders':
                await processOrderWebhook(integrationId, webhook);
                break;
            case 'items':
                await processItemWebhook(integrationId, webhook);
                break;
            case 'questions':
                await processQuestionWebhook(integrationId, webhook);
                break;
            case 'messages':
                await processMessageWebhook(integrationId, webhook);
                break;
            case 'shipments':
                await processShipmentWebhook(integrationId, webhook);
                break;
            default:
                logger_1.logger.info(`Topic no manejado: ${webhook.topic}`);
        }
    }
    catch (error) {
        logger_1.logger.error('Error procesando webhook:', { error: error.message });
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// PROCESADORES POR TOPIC
// ═══════════════════════════════════════════════════════════════════════════
async function processOrderWebhook(integrationId, webhook) {
    logger_1.logger.info(`📦 Procesando webhook de orden: ${webhook.resource}`);
    // Extraer order_id del resource
    const orderId = webhook.resource.replace('/orders/', '');
    try {
        await ordersService.processOrderFromWebhook(integrationId, orderId);
        logger_1.logger.info(`✅ Orden ${orderId} procesada exitosamente`);
    }
    catch (error) {
        logger_1.logger.error(`Error procesando orden ${orderId}: ${error.message}`);
    }
}
async function processItemWebhook(integrationId, webhook) {
    logger_1.logger.info(`📦 Procesando webhook de item: ${webhook.resource}`);
    // Los webhooks de items pueden indicar cambios de stock/precio
    // Por ahora solo logueamos
    const prisma = (0, database_1.getPrisma)();
    await prisma.syncLog.create({
        data: {
            integration_id: integrationId,
            tipo: 'item_update',
            detalle: JSON.stringify({
                resource: webhook.resource,
                actions: webhook.actions || [],
            }),
            resultado: 'success',
        },
    });
}
async function processQuestionWebhook(integrationId, webhook) {
    logger_1.logger.info(`❓ Procesando webhook de pregunta: ${webhook.resource}`);
    const prisma = (0, database_1.getPrisma)();
    await prisma.syncLog.create({
        data: {
            integration_id: integrationId,
            tipo: 'question_received',
            detalle: JSON.stringify(webhook),
            resultado: 'success',
        },
    });
}
async function processMessageWebhook(integrationId, webhook) {
    logger_1.logger.info(`💬 Procesando webhook de mensaje: ${webhook.resource}`);
    const prisma = (0, database_1.getPrisma)();
    await prisma.syncLog.create({
        data: {
            integration_id: integrationId,
            tipo: 'message_received',
            detalle: JSON.stringify(webhook),
            resultado: 'success',
        },
    });
}
async function processShipmentWebhook(integrationId, webhook) {
    logger_1.logger.info(`🚚 Procesando webhook de envío: ${webhook.resource}`);
    const prisma = (0, database_1.getPrisma)();
    await prisma.syncLog.create({
        data: {
            integration_id: integrationId,
            tipo: 'shipment_update',
            detalle: JSON.stringify(webhook),
            resultado: 'success',
        },
    });
}
exports.default = router;
//# sourceMappingURL=webhook.js.map