"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MERCADOLIBRE SERVICE - Interacción con API de MercadoLibre
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Centraliza todas las llamadas a la API de MercadoLibre.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.exchangeCodeForTokens = exchangeCodeForTokens;
exports.refreshAccessToken = refreshAccessToken;
exports.getOrder = getOrder;
exports.getOrders = getOrders;
exports.getItem = getItem;
exports.createItem = createItem;
exports.updateItem = updateItem;
exports.updateVariation = updateVariation;
exports.findItemBySku = findItemBySku;
exports.getActiveItems = getActiveItems;
exports.getUser = getUser;
exports.getUserById = getUserById;
exports.getCategory = getCategory;
exports.getCategoryAttributes = getCategoryAttributes;
exports.getShipment = getShipment;
exports.getNotificationResource = getNotificationResource;
const logger_1 = require("../utils/logger");
// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════
const MELI_API_URL = process.env.ML_API_URL || 'https://api.mercadolibre.com';
const MELI_AUTH_URL = 'https://api.mercadolibre.com/oauth/token';
// ═══════════════════════════════════════════════════════════════════════════
// AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════════════════════
async function exchangeCodeForTokens(clientId, clientSecret, code, redirectUri, codeVerifier) {
    const body = {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
    };
    if (codeVerifier) {
        body.code_verifier = codeVerifier;
    }
    const response = await fetch(MELI_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
    });
    if (!response.ok) {
        const errorData = await response.json();
        logger_1.logger.error('Error intercambiando código por tokens:', { error: errorData });
        throw new Error(errorData.message || 'Error en OAuth');
    }
    return response.json();
}
async function refreshAccessToken(clientId, clientSecret, refreshToken) {
    const response = await fetch(MELI_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
        }).toString(),
    });
    if (!response.ok) {
        const errorData = await response.json();
        logger_1.logger.error('Error refrescando token:', { error: errorData });
        throw new Error(errorData.message || 'Error refrescando token');
    }
    return response.json();
}
// ═══════════════════════════════════════════════════════════════════════════
// ÓRDENES
// ═══════════════════════════════════════════════════════════════════════════
async function getOrder(orderId, accessToken) {
    const response = await fetch(`${MELI_API_URL}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Error obteniendo orden ${orderId}`);
    }
    return response.json();
}
async function getOrders(userId, accessToken, params) {
    const searchParams = new URLSearchParams({
        seller: userId,
        sort: 'date_desc',
    });
    if (params?.status)
        searchParams.set('order.status', params.status);
    if (params?.offset)
        searchParams.set('offset', String(params.offset));
    if (params?.limit)
        searchParams.set('limit', String(params.limit));
    const response = await fetch(`${MELI_API_URL}/orders/search?${searchParams}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error obteniendo órdenes');
    }
    return response.json();
}
// ═══════════════════════════════════════════════════════════════════════════
// ITEMS / PRODUCTOS
// ═══════════════════════════════════════════════════════════════════════════
async function getItem(itemId, accessToken) {
    const response = await fetch(`${MELI_API_URL}/items/${itemId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Error obteniendo item ${itemId}`);
    }
    return response.json();
}
async function createItem(item, accessToken) {
    logger_1.logger.info('Creando producto en ML:', { title: item.title, sku: item.seller_custom_field });
    const response = await fetch(`${MELI_API_URL}/items`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(item),
    });
    if (!response.ok) {
        const errorData = await response.json();
        logger_1.logger.error('Error creando producto:', { error: errorData });
        const errorMessage = errorData.cause?.[0]?.message || errorData.message || 'Error creando producto';
        throw new Error(`Failed to create product: ${errorMessage}`);
    }
    const result = await response.json();
    logger_1.logger.info(`Producto creado exitosamente: ${result.id}`);
    return result;
}
async function updateItem(itemId, data, accessToken) {
    const response = await fetch(`${MELI_API_URL}/items/${itemId}`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Error actualizando item ${itemId}`);
    }
    return response.json();
}
async function updateVariation(itemId, variationId, data, accessToken) {
    const response = await fetch(`${MELI_API_URL}/items/${itemId}/variations/${variationId}`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Error actualizando variación ${variationId}`);
    }
    return response.json();
}
async function findItemBySku(userId, sku, accessToken) {
    try {
        const response = await fetch(`${MELI_API_URL}/users/${userId}/items/search?seller_sku=${encodeURIComponent(sku)}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            return await getItem(data.results[0], accessToken);
        }
        return null;
    }
    catch {
        return null;
    }
}
async function getActiveItems(userId, accessToken) {
    const items = [];
    let offset = 0;
    const limit = 50;
    while (true) {
        const response = await fetch(`${MELI_API_URL}/users/${userId}/items/search?status=active&offset=${offset}&limit=${limit}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok)
            break;
        const data = await response.json();
        if (!data.results || data.results.length === 0)
            break;
        // Obtener detalles de cada item
        for (const itemId of data.results) {
            try {
                const item = await getItem(itemId, accessToken);
                items.push(item);
            }
            catch {
                // Ignorar items que no se puedan obtener
            }
        }
        if (data.results.length < limit)
            break;
        offset += limit;
    }
    return items;
}
// ═══════════════════════════════════════════════════════════════════════════
// USUARIO
// ═══════════════════════════════════════════════════════════════════════════
async function getUser(accessToken) {
    const response = await fetch(`${MELI_API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error obteniendo usuario');
    }
    return response.json();
}
async function getUserById(userId, accessToken) {
    const response = await fetch(`${MELI_API_URL}/users/${userId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Error obteniendo usuario ${userId}`);
    }
    return response.json();
}
// ═══════════════════════════════════════════════════════════════════════════
// CATEGORÍAS
// ═══════════════════════════════════════════════════════════════════════════
async function getCategory(categoryId) {
    const response = await fetch(`${MELI_API_URL}/categories/${categoryId}`);
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Error obteniendo categoría ${categoryId}`);
    }
    return response.json();
}
async function getCategoryAttributes(categoryId) {
    const response = await fetch(`${MELI_API_URL}/categories/${categoryId}/attributes`);
    if (!response.ok) {
        return [];
    }
    return response.json();
}
// ═══════════════════════════════════════════════════════════════════════════
// SHIPPING
// ═══════════════════════════════════════════════════════════════════════════
async function getShipment(shipmentId, accessToken) {
    const response = await fetch(`${MELI_API_URL}/shipments/${shipmentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Error obteniendo envío ${shipmentId}`);
    }
    return response.json();
}
// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICACIONES (Webhooks)
// ═══════════════════════════════════════════════════════════════════════════
async function getNotificationResource(resourcePath, accessToken) {
    const response = await fetch(`${MELI_API_URL}${resourcePath}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Error obteniendo recurso ${resourcePath}`);
    }
    return response.json();
}
exports.default = {
    exchangeCodeForTokens,
    refreshAccessToken,
    getOrder,
    getOrders,
    getItem,
    createItem,
    updateItem,
    updateVariation,
    findItemBySku,
    getActiveItems,
    getUser,
    getUserById,
    getCategory,
    getCategoryAttributes,
    getShipment,
    getNotificationResource,
};
//# sourceMappingURL=mercadolibre.js.map