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
// MAPEO DE CATEGORÍAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mapeo de categorías de Hermes a categorías de MercadoLibre
 * 
 * Hermes tiene sus propias categorías internas (IDs numéricos como 10, 11, 12, etc.)
 * que deben mapearse a IDs válidos de MercadoLibre (formato MLA...)
 * 
 * Por ahora, todas las categorías de Hermes se mapean a MLA1430 (Ropa y Accesorios)
 * que es la categoría principal de indumentaria en MercadoLibre.
 * 
 * En el futuro, este mapeo puede expandirse para categorías específicas:
 * - 10 -> MLA1430 (Ropa y Accesorios)
 * - 11 -> MLA1430 (Ropa y Accesorios)
 * - 12 -> MLA1430 (Ropa y Accesorios)
 * - etc.
 */
const HERMES_TO_MELI_CATEGORY_MAP: Record<number | string, string> = {
  // Mapeo de categorías de Hermes a categorías de MercadoLibre
  // IMPORTANTE: MercadoLibre requiere categorías "hoja" (leaf categories), no categorías padre
  // Para productos con variaciones de ropa, usar categorías hoja específicas:
  // MLA109282 = Ropa y Accesorios > Otros (categoría hoja que permite variaciones sin SIZE_GRID_ID)
  // MLA414238 = Camisas (categoría hoja, para blazers, camisas, etc.)
  // MLA414252 = Pantalones (categoría hoja)
  // MLA414239 = Camperas y Buzos (categoría hoja)
  // MLA414254 = Vestidos (categoría hoja)
  // MLA414240 = Faldas (categoría hoja)
  // MLA417370 = Remeras (categoría hoja, puede requerir SIZE_GRID_ID)
  // MLA3530 = Hogar > Decoración (categoría hoja, no requiere GENDER ni SIZE_GRID_ID)
  default: 'MLA109282', // Ropa y Accesorios > Otros - permite variaciones sin SIZE_GRID_ID
  fallback: 'MLA3530', // Hogar > Decoración - usar si falla con categorías de ropa
};

/**
 * Mapea un category_id de Hermes a un category_id válido de MercadoLibre
 * 
 * @param hermesCategoryId - ID de categoría de Hermes (puede ser número o string)
 * @returns ID de categoría válido de MercadoLibre (formato MLA...)
 */
function mapHermesCategoryToMeli(hermesCategoryId: string | number | undefined): string {
  // Si no hay category_id, usar el default
  if (!hermesCategoryId) {
    return HERMES_TO_MELI_CATEGORY_MAP.default;
  }

  // Si ya es un ID válido de MercadoLibre (formato MLA...), usarlo directamente
  const categoryStr = String(hermesCategoryId);
  if (/^MLA\d+$/.test(categoryStr)) {
    return categoryStr;
  }

  // Buscar mapeo específico para esta categoría de Hermes
  const mappedCategory = HERMES_TO_MELI_CATEGORY_MAP[hermesCategoryId] || 
                         HERMES_TO_MELI_CATEGORY_MAP[categoryStr];

  if (mappedCategory) {
    logger.debug(`Categoría de Hermes ${hermesCategoryId} mapeada a ${mappedCategory}`);
    return mappedCategory;
  }

  // Si no hay mapeo específico, usar el default (indumentaria)
  logger.debug(`Categoría de Hermes ${hermesCategoryId} sin mapeo específico, usando default: ${HERMES_TO_MELI_CATEGORY_MAP.default}`);
  return HERMES_TO_MELI_CATEGORY_MAP.default;
}

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
      const syncResult = await syncProduct(product, userId, accessToken, params.integration_id);
      
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
        errors: result.errors.slice(0, 20),
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
  accessToken: string,
  integrationId: string
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
    await createProductInMeli(product, accessToken, integrationId);
    return { created: true, updated: false };
  }
}

async function createProductInMeli(
  product: HermesProduct,
  accessToken: string,
  integrationId: string
): Promise<void> {

  const productTitle = product.title || product.name || 'Producto sin título';
  const productSku = product.sku || product.identifier || String(product.id);
  const productDescription = product.description || product.brief_description || '';
  const meliCategoryId = mapHermesCategoryToMeli(product.category_id);

  // Use first variation's data for price/stock/sku, or product-level data
  const firstVariation = product.variations?.[0];
  const variantSku = firstVariation?.sku || firstVariation?.identifier || productSku;
  const price = firstVariation?.price || product.price;
  const stock = firstVariation?.stock || product.stock || 1;

  // Build attributes
  const attributes: any[] = [
    { id: 'SELLER_SKU', value_name: variantSku },
    { id: 'BRAND', value_name: product.brand || 'Genérica' },
    { id: 'MODEL', value_name: productTitle.substring(0, 50) },
  ];

  // Build pictures array
  const pictures = (product.images?.map(url => ({ source: url })) ||
                    product.pictures?.map(p => ({ source: p.url })) || [])
                   .filter((p: any) => p.source);

  // Build simple MELI item (no variations - one listing per product)
  // IMPORTANT: When using family_name (catalog mode), do NOT include title - MELI auto-generates it
  const meliItem: any = {
    family_name: productTitle.substring(0, 60),
    category_id: meliCategoryId,
    currency_id: 'ARS',
    price: price,
    available_quantity: stock,
    buying_mode: 'buy_it_now',
    listing_type_id: 'gold_pro',
    condition: 'new',
    seller_custom_field: variantSku,
    description: { plain_text: productDescription },
    pictures: pictures,
    attributes: attributes,
  };

  // Add dimensions if available
  if (product.dimensions) {
    const { width, height, depth, length } = product.dimensions;
    meliItem.shipping = {
      dimensions: `${width}x${depth || length || 0}x${height},${product.weight || 0}`,
    };
  }

  logger.info(`Creating simple product: ${variantSku}`, {
    title: meliItem.title,
    price: meliItem.price,
    stock: meliItem.available_quantity,
    category: meliItem.category_id,
    pictures_count: pictures.length,
  });

  // Try creating with default category first
  try {
    await meliService.createItem(meliItem, accessToken);
    logger.info(`Product created in ML: ${variantSku}`);
  } catch (error: any) {
    // If default category fails, try with MLA3530 (Hogar > Decoración) as fallback
    logger.warn(`First attempt failed for ${variantSku}: ${error.message}. Trying MLA3530 fallback...`);

    meliItem.category_id = 'MLA3530';

    // Remove category-specific attributes that MLA3530 doesn't need
    meliItem.attributes = meliItem.attributes.filter(
      (attr: any) => !['GENDER', 'SIZE_GRID_ID', 'AGE_GROUP'].includes(attr.id)
    );

    await meliService.createItem(meliItem, accessToken);
    logger.info(`Product created in ML (MLA3530 fallback): ${variantSku}`);
  }
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
