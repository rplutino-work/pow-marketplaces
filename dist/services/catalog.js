"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CATALOG SERVICE - Sincronización de Catálogo
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gestiona la sincronización bidireccional de productos entre Hermes y ML.
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
exports.syncCatalog = syncCatalog;
const database_1 = require("../config/database");
const meliService = __importStar(require("../services/mercadolibre"));
const encryption_1 = require("../services/encryption");
const logger_1 = require("../utils/logger");
// ═══════════════════════════════════════════════════════════════════════════
// SINCRONIZACIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
async function syncCatalog(params) {
    const prisma = (0, database_1.getPrisma)();
    logger_1.logger.info(`Iniciando sincronización de catálogo: ${params.products.length} productos`);
    // Obtener integración con credenciales
    const integration = await prisma.integration.findUnique({
        where: { id: params.integration_id },
        include: {
            credentials: { orderBy: { updated_at: 'desc' }, take: 1 },
        },
    });
    if (!integration) {
        throw new Error(`Integración ${params.integration_id} no encontrada`);
    }
    // Obtener access token
    const accessToken = await getAccessToken(integration.credentials[0]);
    if (!accessToken) {
        throw new Error('Access token no disponible o inválido');
    }
    // Obtener user_id de MercadoLibre
    const userId = integration.credentials[0]?.user_id;
    if (!userId) {
        throw new Error('User ID de MercadoLibre no disponible');
    }
    const result = {
        success: 0,
        failed: 0,
        created: 0,
        updated: 0,
        closed: 0,
        errors: [],
    };
    // Obtener SKUs de productos enviados
    const sentSkus = new Set();
    params.products.forEach(p => {
        sentSkus.add(p.identifier);
        p.variations?.forEach(v => sentSkus.add(v.identifier));
    });
    // Si close_missing está activo, cerrar productos no incluidos
    if (params.options?.close_missing) {
        const closedCount = await closeUnsentProducts(userId, accessToken, sentSkus);
        result.closed = closedCount;
    }
    // Sincronizar cada producto
    for (const product of params.products) {
        try {
            const syncResult = await syncProduct(product, userId, accessToken);
            if (syncResult.created)
                result.created++;
            if (syncResult.updated)
                result.updated++;
            result.success++;
        }
        catch (error) {
            result.failed++;
            result.errors.push({
                sku: product.identifier,
                error: error.message,
            });
            logger_1.logger.error(`Error sincronizando ${product.identifier}: ${error.message}`);
        }
    }
    // Log de sincronización
    await prisma.syncLog.create({
        data: {
            integration_id: params.integration_id,
            tipo: 'catalog_sync',
            detalle: JSON.stringify({
                total: params.products.length,
                success: result.success,
                failed: result.failed,
                created: result.created,
                updated: result.updated,
                closed: result.closed,
            }),
            resultado: result.failed === 0 ? 'success' : 'warning',
        },
    });
    return result;
}
// ═══════════════════════════════════════════════════════════════════════════
// SINCRONIZACIÓN DE PRODUCTO INDIVIDUAL
// ═══════════════════════════════════════════════════════════════════════════
async function syncProduct(product, userId, accessToken) {
    // Buscar si existe en ML
    const existingItem = await meliService.findItemBySku(userId, product.identifier, accessToken);
    if (existingItem) {
        // Actualizar existente
        await updateProductInMeli(existingItem.id, product, accessToken);
        return { created: false, updated: true };
    }
    else {
        // Crear nuevo
        await createProductInMeli(product, accessToken);
        return { created: true, updated: false };
    }
}
async function createProductInMeli(product, accessToken) {
    // Construir item para MercadoLibre
    const meliItem = {
        title: product.name.substring(0, 60),
        category_id: product.category_id || 'MLA3530', // Categoría por defecto
        currency_id: 'ARS',
        buying_mode: 'buy_it_now',
        listing_type_id: 'gold_pro',
        condition: 'new',
        seller_custom_field: product.identifier,
        description: { plain_text: product.description || '' },
        pictures: product.pictures?.map(p => ({ source: p.url })) || [],
        attributes: [
            { id: 'SELLER_SKU', value_name: product.identifier },
            { id: 'BRAND', value_name: product.brand || 'Genérica' },
        ],
    };
    // Agregar dimensiones si existen
    if (product.dimensions) {
        const { width, height, length, weight } = product.dimensions;
        meliItem.shipping = {
            dimensions: `${width}x${length}x${height},${weight}`,
        };
    }
    // Manejar variaciones
    if (product.variations && product.variations.length > 0) {
        const hasMultipleVariations = product.variations.length > 1;
        if (hasMultipleVariations) {
            // Producto con múltiples variaciones
            meliItem.variations = product.variations.map(v => ({
                seller_custom_field: v.identifier,
                price: v.price,
                available_quantity: v.stock,
                attribute_combinations: Object.entries(v.attributes).map(([id, value]) => ({
                    id: id.toUpperCase(),
                    value_name: String(value),
                })),
                picture_ids: meliItem.pictures?.slice(0, 1).map((_, i) => `${i + 1}`) || [],
            }));
        }
        else {
            // Producto simple (una sola variación)
            const singleVariation = product.variations[0];
            meliItem.price = singleVariation.price || product.price;
            meliItem.available_quantity = singleVariation.stock || product.stock;
            meliItem.seller_custom_field = singleVariation.identifier || product.identifier;
        }
    }
    else {
        // Sin variaciones
        meliItem.price = product.price;
        meliItem.available_quantity = product.stock;
    }
    await meliService.createItem(meliItem, accessToken);
    logger_1.logger.info(`Producto creado en ML: ${product.identifier}`);
}
async function updateProductInMeli(itemId, product, accessToken) {
    const updateData = {
        price: product.price,
        available_quantity: product.stock,
    };
    // Si tiene variaciones, actualizar cada una
    if (product.variations && product.variations.length > 0) {
        // Obtener variaciones actuales del item
        const currentItem = await meliService.getItem(itemId, accessToken);
        if (currentItem.variations?.length > 0) {
            // Actualizar variaciones existentes
            for (const variation of product.variations) {
                const existingVar = currentItem.variations.find((v) => v.seller_custom_field === variation.identifier);
                if (existingVar) {
                    await meliService.updateVariation(itemId, existingVar.id, {
                        price: variation.price,
                        available_quantity: variation.stock,
                    }, accessToken);
                }
            }
            // No actualizar precio/stock del item principal
            delete updateData.price;
            delete updateData.available_quantity;
        }
    }
    // Solo actualizar si hay algo que cambiar
    if (Object.keys(updateData).length > 0) {
        await meliService.updateItem(itemId, updateData, accessToken);
    }
    logger_1.logger.info(`Producto actualizado en ML: ${product.identifier} (${itemId})`);
}
// ═══════════════════════════════════════════════════════════════════════════
// CIERRE DE PRODUCTOS
// ═══════════════════════════════════════════════════════════════════════════
async function closeUnsentProducts(userId, accessToken, sentSkus) {
    // Obtener productos activos en ML
    const activeItems = await meliService.getActiveItems(userId, accessToken);
    let closedCount = 0;
    for (const item of activeItems) {
        const itemSku = item.seller_custom_field;
        if (itemSku && !sentSkus.has(itemSku)) {
            try {
                await meliService.updateItem(item.id, { status: 'closed' }, accessToken);
                closedCount++;
                logger_1.logger.info(`Producto cerrado en ML: ${itemSku} (${item.id})`);
            }
            catch (error) {
                logger_1.logger.warn(`Error cerrando ${item.id}: ${error.message}`);
            }
        }
    }
    return closedCount;
}
// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
async function getAccessToken(credential) {
    if (!credential)
        return null;
    // Verificar expiración
    if (credential.expires_at && credential.expires_at <= new Date()) {
        logger_1.logger.warn('Token expirado');
        return null;
    }
    // Intentar obtener access_token directo
    if (credential.access_token) {
        try {
            return (0, encryption_1.decrypt)(credential.access_token);
        }
        catch {
            return credential.access_token; // Puede estar sin encriptar
        }
    }
    // Intentar desde credentials_encrypted
    if (credential.credentials_encrypted) {
        try {
            const decrypted = JSON.parse(credential.credentials_encrypted);
            if (decrypted.access_token) {
                return decrypted.access_token;
            }
        }
        catch { }
    }
    return null;
}
exports.default = {
    syncCatalog,
};
//# sourceMappingURL=catalog.js.map