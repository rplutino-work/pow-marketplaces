/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CATALOG SERVICE - Sincronización de Catálogo
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Gestiona la sincronización bidireccional de productos entre Hermes y ML.
 */

import { getPrisma } from '../config/database';
import * as meliService from '../services/mercadolibre';
import { decrypt } from '../services/encryption';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface HermesProduct {
  id: number | string;
  sku?: string; // SKU del item (Hermes envía 'sku')
  identifier?: string; // Alias para sku (compatibilidad)
  title?: string; // Título del producto (Hermes envía 'title')
  name?: string; // Alias para title (compatibilidad)
  description?: string;
  brief_description?: string;
  price: number;
  stock: number;
  category_id?: string | number;
  brand?: string;
  images?: string[]; // Array de URLs (Hermes envía 'images')
  pictures?: Array<{ url: string }>; // Alias para images (compatibilidad)
  variations?: Array<{
    sku: string; // SKU de la variación (Hermes envía 'sku')
    identifier?: string; // Alias para sku
    properties?: Record<string, string>; // Propiedades de la variación (Hermes envía 'properties')
    attributes?: Record<string, string>; // Alias para properties
    price: number;
    stock: number;
  }>;
  dimensions?: {
    width: number;
    height: number;
    depth?: number; // Hermes envía 'depth' en lugar de 'length'
    length?: number; // Alias para depth
  };
  weight?: number;
}

interface SyncResult {
  success: number;
  failed: number;
  created: number;
  updated: number;
  closed: number;
  errors: Array<{ sku: string; error: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SINCRONIZACIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export async function syncCatalog(params: {
  integration_id: string;
  products: HermesProduct[];
  options?: {
    close_missing?: boolean;
    update_only?: boolean;
  };
}): Promise<SyncResult> {
  const prisma = getPrisma();

  logger.info(`Iniciando sincronización de catálogo: ${params.products.length} productos`);

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

  const result: SyncResult = {
    success: 0,
    failed: 0,
    created: 0,
    updated: 0,
    closed: 0,
    errors: [],
  };

  // Obtener SKUs de productos enviados
  const sentSkus = new Set<string>();
  params.products.forEach(p => {
    const productSku = p.sku || p.identifier || String(p.id);
    sentSkus.add(productSku);
    p.variations?.forEach(v => {
      const variantSku = v.sku || v.identifier || '';
      if (variantSku) sentSkus.add(variantSku);
    });
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
      
      if (syncResult.created) result.created++;
      if (syncResult.updated) result.updated++;
      result.success++;

    } catch (error: any) {
      result.failed++;
      const productSku = product.sku || product.identifier || String(product.id);
      result.errors.push({
        sku: productSku,
        error: error.message,
      });
      logger.error(`Error sincronizando ${productSku}: ${error.message}`);
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

async function syncProduct(
  product: HermesProduct,
  userId: string,
  accessToken: string
): Promise<{ created: boolean; updated: boolean }> {
  
  // Obtener SKU del producto
  const productSku = product.sku || product.identifier || String(product.id);
  
  // Buscar si existe en ML
  const existingItem = await meliService.findItemBySku(userId, productSku, accessToken);

  if (existingItem) {
    // Actualizar existente
    await updateProductInMeli(existingItem.id, product, accessToken);
    return { created: false, updated: true };
  } else {
    // Crear nuevo
    await createProductInMeli(product, accessToken);
    return { created: true, updated: false };
  }
}

async function createProductInMeli(
  product: HermesProduct,
  accessToken: string
): Promise<void> {
  
  // Obtener campos con fallbacks
  const productTitle = product.title || product.name || 'Producto sin título';
  const productSku = product.sku || product.identifier || String(product.id);
  const productDescription = product.description || product.brief_description || '';
  
  // Construir item para MercadoLibre
  const meliItem: any = {
    title: productTitle.substring(0, 60),
    category_id: String(product.category_id || 'MLA3530'), // Categoría por defecto
    currency_id: 'ARS',
    buying_mode: 'buy_it_now',
    listing_type_id: 'gold_pro',
    condition: 'new',
    seller_custom_field: productSku,
    description: { plain_text: productDescription },
    pictures: (product.images?.map(url => ({ source: url })) || 
               product.pictures?.map(p => ({ source: p.url })) || []),
    attributes: [
      { id: 'SELLER_SKU', value_name: productSku },
      { id: 'BRAND', value_name: product.brand || 'Genérica' },
    ],
  };

  // Agregar dimensiones si existen
  if (product.dimensions) {
    const { width, height, depth, length } = product.dimensions;
    const productLength = depth || length || 0;
    const productWeight = product.weight || 0;
    meliItem.shipping = {
      dimensions: `${width}x${productLength}x${height},${productWeight}`,
    };
  }

  // Manejar variaciones
  if (product.variations && product.variations.length > 0) {
    const hasMultipleVariations = product.variations.length > 1;
    
    if (hasMultipleVariations) {
      // Producto con múltiples variaciones
      meliItem.variations = product.variations.map(v => {
        const variantSku = v.sku || v.identifier || '';
        const variantAttrs = v.attributes || v.properties || {};
        
        return {
          seller_custom_field: variantSku,
          price: v.price,
          available_quantity: v.stock,
          attribute_combinations: Object.entries(variantAttrs).map(([id, value]) => ({
            id: id.toUpperCase(),
            value_name: String(value),
          })),
          picture_ids: meliItem.pictures?.slice(0, 1).map((_: any, i: number) => `${i + 1}`) || [],
        };
      });
    } else {
      // Producto simple (una sola variación)
      const singleVariation = product.variations[0];
      const variantSku = singleVariation.sku || singleVariation.identifier || productSku;
      meliItem.price = singleVariation.price || product.price;
      meliItem.available_quantity = singleVariation.stock || product.stock;
      meliItem.seller_custom_field = variantSku;
    }
  } else {
    // Sin variaciones
    meliItem.price = product.price;
    meliItem.available_quantity = product.stock;
  }

  await meliService.createItem(meliItem, accessToken);
  logger.info(`Producto creado en ML: ${productSku}`);
}

async function updateProductInMeli(
  itemId: string,
  product: HermesProduct,
  accessToken: string
): Promise<void> {
  
  const updateData: any = {
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
        const variantSku = variation.sku || variation.identifier || '';
        const existingVar = currentItem.variations.find(
          (v: any) => v.seller_custom_field === variantSku
        );
        
        if (existingVar) {
          await meliService.updateVariation(
            itemId,
            existingVar.id,
            {
              price: variation.price,
              available_quantity: variation.stock,
            },
            accessToken
          );
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

  const productSku = product.sku || product.identifier || String(product.id);
  logger.info(`Producto actualizado en ML: ${productSku} (${itemId})`);
}

// ═══════════════════════════════════════════════════════════════════════════
// CIERRE DE PRODUCTOS
// ═══════════════════════════════════════════════════════════════════════════

async function closeUnsentProducts(
  userId: string,
  accessToken: string,
  sentSkus: Set<string>
): Promise<number> {
  
  // Obtener productos activos en ML
  const activeItems = await meliService.getActiveItems(userId, accessToken);
  
  let closedCount = 0;

  for (const item of activeItems) {
    const itemSku = item.seller_custom_field;
    
    if (itemSku && !sentSkus.has(itemSku)) {
      try {
        await meliService.updateItem(item.id, { status: 'closed' }, accessToken);
        closedCount++;
        logger.info(`Producto cerrado en ML: ${itemSku} (${item.id})`);
      } catch (error: any) {
        logger.warn(`Error cerrando ${item.id}: ${error.message}`);
      }
    }
  }

  return closedCount;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function getAccessToken(credential: any): Promise<string | null> {
  if (!credential) return null;

  // Verificar expiración
  if (credential.expires_at && credential.expires_at <= new Date()) {
    logger.warn('Token expirado');
    return null;
  }

  // Intentar obtener access_token directo
  if (credential.access_token) {
    try {
      return decrypt(credential.access_token);
    } catch {
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
    } catch {}
  }

  return null;
}

export default {
  syncCatalog,
};
