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
  identifier: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  category_id?: string;
  brand?: string;
  pictures?: Array<{ url: string }>;
  variations?: Array<{
    id: string;
    identifier: string;
    attributes: Record<string, string>;
    price: number;
    stock: number;
  }>;
  dimensions?: {
    width: number;
    height: number;
    length: number;
    weight: number;
  };
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
      
      if (syncResult.created) result.created++;
      if (syncResult.updated) result.updated++;
      result.success++;

    } catch (error: any) {
      result.failed++;
      result.errors.push({
        sku: product.identifier,
        error: error.message,
      });
      logger.error(`Error sincronizando ${product.identifier}: ${error.message}`);
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
  
  // Buscar si existe en ML
  const existingItem = await meliService.findItemBySku(userId, product.identifier, accessToken);

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
  
  // Construir item para MercadoLibre
  const meliItem: any = {
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
        picture_ids: meliItem.pictures?.slice(0, 1).map((_: any, i: number) => `${i + 1}`) || [],
      }));
    } else {
      // Producto simple (una sola variación)
      const singleVariation = product.variations[0];
      meliItem.price = singleVariation.price || product.price;
      meliItem.available_quantity = singleVariation.stock || product.stock;
      meliItem.seller_custom_field = singleVariation.identifier || product.identifier;
    }
  } else {
    // Sin variaciones
    meliItem.price = product.price;
    meliItem.available_quantity = product.stock;
  }

  await meliService.createItem(meliItem, accessToken);
  logger.info(`Producto creado en ML: ${product.identifier}`);
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
        const existingVar = currentItem.variations.find(
          (v: any) => v.seller_custom_field === variation.identifier
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

  logger.info(`Producto actualizado en ML: ${product.identifier} (${itemId})`);
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
