"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HERMES SERVICE - Comunicación con Hermes OMS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Maneja la comunicación con las instancias de Hermes de los clientes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOrder = sendOrder;
exports.getOrderStatus = getOrderStatus;
exports.getProducts = getProducts;
exports.updateProductStatus = updateProductStatus;
exports.notifyStockUpdate = notifyStockUpdate;
exports.notifyPriceUpdate = notifyPriceUpdate;
exports.checkHealth = checkHealth;
exports.notifyWebhookReceived = notifyWebhookReceived;
exports.notifyOAuthSuccess = notifyOAuthSuccess;
const logger_1 = require("../utils/logger");
// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════
const REQUEST_TIMEOUT = 30000; // 30 segundos
// ═══════════════════════════════════════════════════════════════════════════
// ÓRDENES
// ═══════════════════════════════════════════════════════════════════════════
async function sendOrder(hermesUrl, token, order) {
    logger_1.logger.info(`Enviando orden a Hermes: ${hermesUrl}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
        const response = await fetch(`${hermesUrl}/api/v1/marketplace/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'X-Marketplace-Token': token,
            },
            body: JSON.stringify(order),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Error desconocido' }));
            throw new Error(errorData.message || `Error enviando orden: ${response.status}`);
        }
        const result = await response.json();
        logger_1.logger.info(`Orden enviada exitosamente a Hermes: ${result.order_id || result.id}`);
        return {
            order_id: result.order_id || result.id || 'unknown',
            status: 'sent',
        };
    }
    catch (err) {
        clearTimeout(timeoutId);
        const error = err;
        if (error.name === 'AbortError') {
            throw new Error('Timeout enviando orden a Hermes');
        }
        throw error;
    }
}
async function getOrderStatus(hermesUrl, token, orderId) {
    const response = await fetch(`${hermesUrl}/api/v1/orders/${orderId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'X-Marketplace-Token': token,
        },
    });
    if (!response.ok) {
        throw new Error(`Error obteniendo estado de orden: ${response.status}`);
    }
    return response.json();
}
// ═══════════════════════════════════════════════════════════════════════════
// CATÁLOGO
// ═══════════════════════════════════════════════════════════════════════════
async function getProducts(hermesUrl, token, params) {
    const searchParams = new URLSearchParams();
    if (params?.page)
        searchParams.set('page', String(params.page));
    if (params?.per_page)
        searchParams.set('per_page', String(params.per_page));
    if (params?.updated_since)
        searchParams.set('updated_since', params.updated_since);
    const response = await fetch(`${hermesUrl}/api/v1/marketplace/products?${searchParams}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'X-Marketplace-Token': token,
        },
    });
    if (!response.ok) {
        throw new Error(`Error obteniendo productos: ${response.status}`);
    }
    return response.json();
}
async function updateProductStatus(hermesUrl, token, productId, status) {
    const response = await fetch(`${hermesUrl}/api/v1/marketplace/products/${productId}/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Marketplace-Token': token,
        },
        body: JSON.stringify(status),
    });
    if (!response.ok) {
        logger_1.logger.warn(`Error actualizando estado de producto ${productId}: ${response.status}`);
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// STOCK Y PRECIOS
// ═══════════════════════════════════════════════════════════════════════════
async function notifyStockUpdate(hermesUrl, token, updates) {
    const response = await fetch(`${hermesUrl}/api/v1/marketplace/stock/sync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Marketplace-Token': token,
        },
        body: JSON.stringify({ updates }),
    });
    if (!response.ok) {
        logger_1.logger.warn(`Error notificando actualización de stock: ${response.status}`);
    }
}
async function notifyPriceUpdate(hermesUrl, token, updates) {
    const response = await fetch(`${hermesUrl}/api/v1/marketplace/prices/sync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Marketplace-Token': token,
        },
        body: JSON.stringify({ updates }),
    });
    if (!response.ok) {
        logger_1.logger.warn(`Error notificando actualización de precios: ${response.status}`);
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════
async function checkHealth(hermesUrl) {
    const startTime = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`${hermesUrl}/api/v1/health`, {
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return {
            healthy: response.ok,
            responseTime: Date.now() - startTime,
        };
    }
    catch {
        return {
            healthy: false,
            responseTime: Date.now() - startTime,
        };
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOKS / CALLBACKS
// ═══════════════════════════════════════════════════════════════════════════
async function notifyWebhookReceived(hermesUrl, token, webhook) {
    try {
        await fetch(`${hermesUrl}/api/v1/marketplace/webhooks/notify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'X-Marketplace-Token': token,
            },
            body: JSON.stringify(webhook),
        });
    }
    catch (err) {
        const error = err;
        logger_1.logger.warn(`Error notificando webhook a Hermes: ${error.message}`);
    }
}
async function notifyOAuthSuccess(hermesUrl, integrationId, userId) {
    try {
        await fetch(`${hermesUrl}/admin/marketplaces/oauth_callback/${integrationId}`, {
            method: 'GET',
            headers: { Accept: 'text/html' },
        });
    }
    catch (err) {
        const error = err;
        logger_1.logger.warn(`Error notificando OAuth success a Hermes: ${error.message}`);
    }
}
exports.default = {
    sendOrder,
    getOrderStatus,
    getProducts,
    updateProductStatus,
    notifyStockUpdate,
    notifyPriceUpdate,
    checkHealth,
    notifyWebhookReceived,
    notifyOAuthSuccess,
};
//# sourceMappingURL=hermes.js.map