"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WEBHOOKS SERVICE - Procesamiento de webhooks de marketplaces
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Procesa los webhooks recibidos de diferentes marketplaces:
 *
 * TIPOS DE WEBHOOKS (MercadoLibre):
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Topic          │ Descripción                       │ Acción            │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ orders_v2      │ Nueva orden o cambio de estado    │ Procesar orden    │
 * │ items          │ Cambio en publicación             │ Actualizar item   │
 * │ questions      │ Nueva pregunta                    │ Notificar         │
 * │ messages       │ Nuevo mensaje                     │ Notificar         │
 * │ shipments      │ Actualización de envío            │ Actualizar estado │
 * │ payments       │ Actualización de pago             │ Actualizar orden  │
 * └─────────────────────────────────────────────────────────────────────────┘
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
exports.processMercadoLibreWebhook = processMercadoLibreWebhook;
exports.validateWebhookSignature = validateWebhookSignature;
exports.getWebhookStats = getWebhookStats;
const database_1 = require("../config/database");
const ordersService = __importStar(require("../services/orders"));
const logger_1 = require("../utils/logger");
// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Procesa un webhook de MercadoLibre
 *
 * @param payload - Payload del webhook
 * @returns Resultado del procesamiento
 */
async function processMercadoLibreWebhook(payload) {
    const { topic, resource, user_id } = payload;
    logger_1.logger.info(`🔔 Webhook MercadoLibre recibido:`, { topic, resource, user_id });
    const prisma = (0, database_1.getPrisma)();
    try {
        // Buscar integración por user_id de MercadoLibre
        const credential = await prisma.integrationCredential.findFirst({
            where: { user_id: String(user_id) },
            include: { integration: true },
        });
        if (!credential) {
            logger_1.logger.warn(`No se encontró integración para user_id ${user_id}`);
            return { success: false, action: 'skipped', details: { reason: 'Integration not found' } };
        }
        const integrationId = credential.integration_id;
        // Procesar según el topic
        switch (topic) {
            case 'orders_v2':
                return await handleOrderWebhook(integrationId, resource);
            case 'items':
                return await handleItemWebhook(integrationId, resource);
            case 'questions':
                return await handleQuestionWebhook(integrationId, resource);
            case 'messages':
                return await handleMessageWebhook(integrationId, resource);
            case 'shipments':
                return await handleShipmentWebhook(integrationId, resource);
            case 'payments':
                return await handlePaymentWebhook(integrationId, resource);
            default:
                logger_1.logger.debug(`Topic no manejado: ${topic}`);
                return { success: true, action: 'ignored', details: { topic } };
        }
    }
    catch (error) {
        logger_1.logger.error('Error procesando webhook:', { error: error.message, payload });
        return { success: false, action: 'error', details: { error: error.message } };
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// HANDLERS POR TIPO DE WEBHOOK
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Maneja webhook de órdenes (orders_v2)
 * Este es el webhook más importante - procesa nuevas órdenes
 */
async function handleOrderWebhook(integrationId, resource) {
    // Extraer ID de orden del resource (formato: /orders/123456)
    const orderId = extractIdFromResource(resource);
    if (!orderId) {
        return { success: false, action: 'error', details: { reason: 'Invalid order resource' } };
    }
    logger_1.logger.info(`📦 Procesando orden ${orderId} para integración ${integrationId}`);
    try {
        // Procesar la orden usando el servicio de órdenes
        const result = await ordersService.processOrderFromWebhook(integrationId, orderId);
        return {
            success: result.success,
            action: result.blocked ? 'blocked' : (result.success ? 'processed' : 'failed'),
            details: {
                order_id: orderId,
                hermes_order_id: result.hermes_order_id,
                reason: result.reason,
            },
        };
    }
    catch (error) {
        logger_1.logger.error(`Error procesando orden ${orderId}:`, { error: error.message });
        return { success: false, action: 'error', details: { error: error.message } };
    }
}
/**
 * Maneja webhook de items
 * Se dispara cuando hay cambios en las publicaciones
 */
async function handleItemWebhook(integrationId, resource) {
    const itemId = extractIdFromResource(resource);
    logger_1.logger.info(`📦 Cambio en item ${itemId} para integración ${integrationId}`);
    // Por ahora solo registramos el evento
    // En el futuro se puede sincronizar cambios de vuelta a Hermes
    const prisma = (0, database_1.getPrisma)();
    await prisma.syncLog.create({
        data: {
            integration_id: integrationId,
            tipo: 'item_webhook',
            detalle: JSON.stringify({ item_id: itemId, resource }),
            resultado: 'received',
        },
    });
    return {
        success: true,
        action: 'logged',
        details: { item_id: itemId },
    };
}
/**
 * Maneja webhook de preguntas
 */
async function handleQuestionWebhook(integrationId, resource) {
    const questionId = extractIdFromResource(resource);
    logger_1.logger.info(`❓ Nueva pregunta ${questionId} para integración ${integrationId}`);
    // Registrar evento
    const prisma = (0, database_1.getPrisma)();
    await prisma.syncLog.create({
        data: {
            integration_id: integrationId,
            tipo: 'question_webhook',
            detalle: JSON.stringify({ question_id: questionId, resource }),
            resultado: 'received',
        },
    });
    return {
        success: true,
        action: 'logged',
        details: { question_id: questionId },
    };
}
/**
 * Maneja webhook de mensajes
 */
async function handleMessageWebhook(integrationId, resource) {
    logger_1.logger.info(`💬 Nuevo mensaje para integración ${integrationId}: ${resource}`);
    const prisma = (0, database_1.getPrisma)();
    await prisma.syncLog.create({
        data: {
            integration_id: integrationId,
            tipo: 'message_webhook',
            detalle: JSON.stringify({ resource }),
            resultado: 'received',
        },
    });
    return {
        success: true,
        action: 'logged',
        details: { resource },
    };
}
/**
 * Maneja webhook de envíos
 */
async function handleShipmentWebhook(integrationId, resource) {
    const shipmentId = extractIdFromResource(resource);
    logger_1.logger.info(`📬 Actualización de envío ${shipmentId} para integración ${integrationId}`);
    const prisma = (0, database_1.getPrisma)();
    await prisma.syncLog.create({
        data: {
            integration_id: integrationId,
            tipo: 'shipment_webhook',
            detalle: JSON.stringify({ shipment_id: shipmentId, resource }),
            resultado: 'received',
        },
    });
    // TODO: Actualizar estado del envío en la orden correspondiente
    return {
        success: true,
        action: 'logged',
        details: { shipment_id: shipmentId },
    };
}
/**
 * Maneja webhook de pagos
 */
async function handlePaymentWebhook(integrationId, resource) {
    const paymentId = extractIdFromResource(resource);
    logger_1.logger.info(`💰 Actualización de pago ${paymentId} para integración ${integrationId}`);
    const prisma = (0, database_1.getPrisma)();
    await prisma.syncLog.create({
        data: {
            integration_id: integrationId,
            tipo: 'payment_webhook',
            detalle: JSON.stringify({ payment_id: paymentId, resource }),
            resultado: 'received',
        },
    });
    // TODO: Actualizar estado del pago en la orden correspondiente
    return {
        success: true,
        action: 'logged',
        details: { payment_id: paymentId },
    };
}
// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Extrae el ID de un resource de MercadoLibre
 *
 * @example extractIdFromResource('/orders/123456') => '123456'
 * @example extractIdFromResource('/items/MLA12345') => 'MLA12345'
 */
function extractIdFromResource(resource) {
    if (!resource)
        return null;
    const parts = resource.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : null;
}
/**
 * Valida que un webhook sea legítimo de MercadoLibre
 *
 * TODO: Implementar validación de firma cuando MercadoLibre lo soporte
 */
function validateWebhookSignature(payload, signature) {
    // MercadoLibre actualmente no envía firma
    // Por ahora validamos campos mínimos requeridos
    return !!(payload.topic && payload.resource && payload.user_id);
}
/**
 * Obtiene estadísticas de webhooks procesados
 */
async function getWebhookStats(integrationId) {
    const prisma = (0, database_1.getPrisma)();
    const where = {
        tipo: { endsWith: '_webhook' },
    };
    if (integrationId) {
        where.integration_id = integrationId;
    }
    const logs = await prisma.syncLog.findMany({
        where,
        select: { tipo: true, created_at: true },
    });
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const byType = {};
    let last24h = 0;
    for (const log of logs) {
        byType[log.tipo] = (byType[log.tipo] || 0) + 1;
        if (log.created_at > yesterday)
            last24h++;
    }
    return {
        total: logs.length,
        by_type: byType,
        last_24h: last24h,
    };
}
exports.default = {
    processMercadoLibreWebhook,
    validateWebhookSignature,
    getWebhookStats,
};
//# sourceMappingURL=webhooks.js.map