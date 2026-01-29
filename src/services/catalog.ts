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
  // Por ahora, todas las categorías de Hermes se mapean a indumentaria
  // MLA3530 = Hogar > Decoración (categoría hoja que NO requiere SIZE_GRID_ID)
  // IMPORTANTE: Las categorías de ropa (MLA417370, etc.) requieren SIZE_GRID_ID
  // que debe estar configurado en la cuenta del vendedor en MercadoLibre
  // Por ahora usamos MLA3530 como default para evitar el error de SIZE_GRID_ID
  // TODO: Cuando el usuario configure SIZE_GRID_ID, cambiar a categorías de ropa
  default: 'MLA3530',
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
  
  // Mapear category_id de Hermes a MercadoLibre
  const meliCategoryId = mapHermesCategoryToMeli(product.category_id);
  
  // Construir atributos base
  const baseAttributes: any[] = [
    { id: 'SELLER_SKU', value_name: productSku },
    { id: 'BRAND', value_name: product.brand || 'Genérica' },
  ];

  // Agregar atributos obligatorios de ropa si están disponibles en las propiedades
  // Estos atributos vienen de las variaciones o del producto
  const allProperties: Record<string, string> = {};
  
  // Recolectar propiedades de todas las variaciones
  if (product.variations && product.variations.length > 0) {
    product.variations.forEach(v => {
      const props = v.properties || v.attributes || {};
      Object.assign(allProperties, props);
    });
  }

  // Mapear propiedades comunes a atributos de MercadoLibre
  // GENDER (Género) - solo agregar si hay un valor válido
  // Valores válidos en MercadoLibre: "Mujer", "Hombre", "Unisex", "Niño", "Niña"
  const genderMap: Record<string, string> = {
    'mujer': 'Mujer',
    'hombre': 'Hombre',
    'unisex': 'Unisex',
    'niño': 'Niño',
    'niña': 'Niña',
    'nino': 'Niño',
    'nina': 'Niña',
  };
  
  if (allProperties['Género'] || allProperties['Genero'] || allProperties['GENDER']) {
    const genderRaw = String(allProperties['Género'] || allProperties['Genero'] || allProperties['GENDER']).toLowerCase();
    const genderValue = genderMap[genderRaw] || String(allProperties['Género'] || allProperties['Genero'] || allProperties['GENDER']);
    baseAttributes.push({ id: 'GENDER', value_name: genderValue });
  }
  // Si no hay género, no agregarlo (algunas categorías no lo requieren)

  // MODEL (Modelo) - usar el título del producto si no hay modelo específico
  if (allProperties['Modelo'] || allProperties['MODEL']) {
    baseAttributes.push({ 
      id: 'MODEL', 
      value_name: String(allProperties['Modelo'] || allProperties['MODEL']) 
    });
  } else {
    // Usar el título como modelo
    baseAttributes.push({ id: 'MODEL', value_name: productTitle.substring(0, 50) });
  }

  // SIZE_GRID_ID - Solo agregar si está disponible (requerido para categorías de ropa)
  // Este ID debe estar configurado en la cuenta de MercadoLibre del vendedor
  // Por ahora no lo agregamos automáticamente, el usuario debe configurarlo
  // TODO: Agregar SIZE_GRID_ID como configuración de integración
  // if (integration.size_grid_id) {
  //   baseAttributes.push({ id: 'SIZE_GRID_ID', value_name: integration.size_grid_id });
  // }

  // Construir item para MercadoLibre
  const meliItem: any = {
    title: productTitle.substring(0, 60),
    category_id: meliCategoryId,
    currency_id: 'ARS',
    buying_mode: 'buy_it_now',
    listing_type_id: 'gold_pro',
    condition: 'new',
    seller_custom_field: productSku,
    description: { plain_text: productDescription },
    pictures: (product.images?.map(url => ({ source: url })) || 
               product.pictures?.map(p => ({ source: p.url })) || []).filter((p: any) => p.source), // Filtrar URLs vacías
    attributes: baseAttributes,
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
      // IMPORTANTE: Cada variación debe tener su SKU en seller_custom_field
      // para que cuando llegue la orden, el sistema viejo pueda encontrarlo con item.dig('item','seller_sku')
      
      // El precio del item principal debe ser el MAYOR de las variaciones
      // MercadoLibre requiere que el precio del item principal sea >= precio de variaciones
      const maxPrice = Math.max(...product.variations.map(v => v.price));
      meliItem.price = maxPrice;
      
      meliItem.variations = product.variations.map(v => {
        const variantSku = v.sku || v.identifier || '';
        const variantAttrs = v.attributes || v.properties || {};
        
        // Construir attribute_combinations para la variación
        // Estos deben incluir COLOR, SIZE (Talle), etc.
        const attributeCombinations: any[] = [];
        
        // COLOR
        if (variantAttrs['Color'] || variantAttrs['COLOR']) {
          attributeCombinations.push({
            id: 'COLOR',
            value_name: String(variantAttrs['Color'] || variantAttrs['COLOR']),
          });
        }
        
        // SIZE (Talle)
        if (variantAttrs['Talle'] || variantAttrs['Talla'] || variantAttrs['SIZE']) {
          attributeCombinations.push({
            id: 'SIZE',
            value_name: String(variantAttrs['Talle'] || variantAttrs['Talla'] || variantAttrs['SIZE']),
          });
        }
        
        // Agregar otras propiedades como attribute_combinations
        Object.entries(variantAttrs).forEach(([key, value]) => {
          const upperKey = key.toUpperCase();
          // Solo agregar si no es COLOR o SIZE (ya los agregamos arriba)
          if (upperKey !== 'COLOR' && upperKey !== 'SIZE' && 
              key !== 'Talle' && key !== 'Talla' && 
              upperKey !== 'GENDER' && upperKey !== 'MODEL') {
            attributeCombinations.push({
              id: upperKey,
              value_name: String(value),
            });
          }
        });
        
        logger.debug(`Creando variación con SKU: ${variantSku}`, {
          sku: variantSku,
          price: v.price,
          stock: v.stock,
          attribute_combinations: attributeCombinations,
        });
        
        return {
          seller_custom_field: variantSku, // SKU de la variación (el sistema viejo busca en seller_sku)
          price: v.price,
          available_quantity: v.stock,
          attribute_combinations: attributeCombinations,
          // No usar picture_ids si no hay imágenes subidas primero
          // picture_ids: meliItem.pictures?.slice(0, 1).map((_: any, i: number) => `${i + 1}`) || [],
        };
      });
    } else {
      // Producto simple (una sola variación)
      // IMPORTANTE: Usar el SKU de la variación, no del producto principal
      const singleVariation = product.variations[0];
      const variantSku = singleVariation.sku || singleVariation.identifier || productSku;
      const variantAttrs = singleVariation.attributes || singleVariation.properties || {};
      
      logger.debug(`Producto simple con SKU de variación: ${variantSku}`, {
        product_sku: productSku,
        variant_sku: variantSku,
        price: singleVariation.price || product.price,
        stock: singleVariation.stock || product.stock,
        properties: variantAttrs,
      });
      
      meliItem.price = singleVariation.price || product.price;
      meliItem.available_quantity = singleVariation.stock || product.stock;
      meliItem.seller_custom_field = variantSku; // SKU de la variación (el sistema viejo busca en seller_sku)
      
      // También actualizar el atributo SELLER_SKU con el SKU de la variación
      const skuAttributeIndex = meliItem.attributes.findIndex((attr: any) => attr.id === 'SELLER_SKU');
      if (skuAttributeIndex >= 0) {
        meliItem.attributes[skuAttributeIndex].value_name = variantSku;
      } else {
        meliItem.attributes.push({ id: 'SELLER_SKU', value_name: variantSku });
      }
      
      // Agregar COLOR y SIZE como atributos del item principal si están disponibles
      if (variantAttrs['Color'] || variantAttrs['COLOR']) {
        meliItem.attributes.push({
          id: 'COLOR',
          value_name: String(variantAttrs['Color'] || variantAttrs['COLOR']),
        });
      }
      
      if (variantAttrs['Talle'] || variantAttrs['Talla'] || variantAttrs['SIZE']) {
        meliItem.attributes.push({
          id: 'SIZE',
          value_name: String(variantAttrs['Talle'] || variantAttrs['Talla'] || variantAttrs['SIZE']),
        });
      }
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
