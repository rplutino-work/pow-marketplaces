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

  // Log del producto completo para debugging
  logger.info(`Producto recibido: ${productSku}`, {
    id: product.id,
    sku: productSku,
    title: productTitle,
    variations_count: product.variations?.length || 0,
    variations_sample: product.variations?.slice(0, 2).map((v: any) => ({
      sku: v.sku,
      has_properties: !!v.properties && Object.keys(v.properties || {}).length > 0,
      has_attributes: !!v.attributes && Object.keys(v.attributes || {}).length > 0,
      properties_keys: v.properties ? Object.keys(v.properties) : [],
      attributes_keys: v.attributes ? Object.keys(v.attributes) : [],
    })),
  });

  // Manejar variaciones
  if (product.variations && product.variations.length > 0) {
    const hasMultipleVariations = product.variations.length > 1;
    
    if (hasMultipleVariations) {
      // Producto con múltiples variaciones
      // IMPORTANTE: Cada variación debe tener su SKU en seller_custom_field
      // para que cuando llegue la orden, el sistema viejo pueda encontrarlo con item.dig('item','seller_sku')
      
      // El precio del item principal debe ser IGUAL al precio de las variaciones
      // IMPORTANTE: Todas las variaciones deben tener el mismo precio que el item principal
      // Si hay diferentes precios, usar el mínimo para todas
      const prices = product.variations.map(v => v.price);
      const minPrice = Math.min(...prices);
      meliItem.price = minPrice; // Usar el precio mínimo para el item principal
      
      // Preparar picture_ids para las variaciones (necesitan entre 1 y 10 imágenes)
      // IMPORTANTE: MercadoLibre requiere que cada variación tenga entre 1 y 10 picture_ids
      // Los picture_ids son los IDs de las imágenes después de subirlas a MercadoLibre
      // Por ahora, usamos índices 1-based como strings, pero MercadoLibre los convertirá
      const pictureIds: string[] = [];
      const totalPictures = meliItem.pictures ? meliItem.pictures.length : 0;
      
      if (totalPictures > 0) {
        // Usar hasta 10 imágenes (máximo permitido por variación)
        // IMPORTANTE: Los picture_ids deben ser strings con al menos 4 caracteres
        // Usamos formato "0001", "0002", etc. para cumplir con el requisito
        const maxPictures = Math.min(totalPictures, 10);
        for (let i = 0; i < maxPictures; i++) {
          // Formatear con padding a 4 dígitos: "0001", "0002", etc.
          pictureIds.push(String(i + 1).padStart(4, '0'));
        }
      } else {
        // Si no hay imágenes, no podemos crear variaciones
        throw new Error(`Producto ${productSku} sin imágenes - no se pueden crear variaciones sin imágenes`);
      }
      
      // Validar que tenemos al menos 1 picture_id
      if (pictureIds.length === 0) {
        throw new Error(`No se pudieron generar picture_ids para producto ${productSku}`);
      }
      
      // Filtrar variaciones que no tienen attribute_combinations válidos
      meliItem.variations = product.variations.map((v, index) => {
        const variantSku = v.sku || v.identifier || '';
        const variantAttrs = v.attributes || v.properties || {};
        
        // Log detallado de las propiedades recibidas
        logger.info(`Variación ${variantSku} - Propiedades recibidas:`, {
          sku: variantSku,
          attributes: v.attributes,
          properties: v.properties,
          all_keys: Object.keys(variantAttrs),
          all_values: Object.entries(variantAttrs),
        });
        
        // Construir attribute_combinations para la variación
        // IMPORTANTE: Las variaciones DEBEN tener al menos un attribute_combination
        const attributeCombinations: any[] = [];
        
        // Buscar COLOR con diferentes nombres posibles
        const colorKeys = Object.keys(variantAttrs).filter(key => 
          /color|colour|cor/i.test(key)
        );
        if (colorKeys.length > 0) {
          const colorKey = colorKeys[0];
          const colorValue = variantAttrs[colorKey];
          if (colorValue) {
            attributeCombinations.push({
              id: 'COLOR',
              value_name: String(colorValue),
            });
            logger.debug(`Color encontrado en propiedad '${colorKey}': ${colorValue}`);
          }
        }
        
        // Buscar SIZE/TALLE con diferentes nombres posibles
        const sizeKeys = Object.keys(variantAttrs).filter(key => 
          /talle|talla|size|tamaño|tamano/i.test(key)
        );
        if (sizeKeys.length > 0) {
          const sizeKey = sizeKeys[0];
          const sizeValue = variantAttrs[sizeKey];
          if (sizeValue) {
            attributeCombinations.push({
              id: 'SIZE',
              value_name: String(sizeValue),
            });
            logger.debug(`Talle encontrado en propiedad '${sizeKey}': ${sizeValue}`);
          }
        }
        
        // Si no hay COLOR ni SIZE, crear atributos diferenciadores
        // IMPORTANTE: MercadoLibre requiere al menos un attribute_combination válido
        // IMPORTANTE: NO usar SELLER_SKU, BRAND, MODEL, GENDER en attribute_combinations
        // porque estos ya están en item.attributes y no se pueden duplicar
        if (attributeCombinations.length === 0) {
          // Intentar usar cualquier propiedad disponible como diferenciador
          // que NO esté ya en item.attributes
          const attributesInItem = baseAttributes.map((attr: any) => attr.id);
          const excludedKeys = ['SELLER_SKU', 'BRAND', 'MODEL', 'GENDER', 'ITEM_CONDITION'];
          
          // Buscar la primera propiedad que no esté excluida
          const firstProperty = Object.entries(variantAttrs).find(([key, value]) => {
            if (!value || String(value).trim() === '') return false; // Ignorar valores vacíos
            
            const upperKey = key.toUpperCase();
            return !attributesInItem.includes(upperKey) && 
                   !excludedKeys.includes(upperKey);
          });
          
          if (firstProperty) {
            const [key, value] = firstProperty;
            attributeCombinations.push({
              id: key.toUpperCase(),
              value_name: String(value),
            });
            logger.info(`Usando propiedad '${key}' como diferenciador para variación ${variantSku}: ${value}`);
          } else {
            // Si no hay propiedades diferenciadoras válidas, no podemos crear variaciones
            // porque MercadoLibre requiere attribute_combinations válidos
            // En este caso, el producto se creará como simple (sin variaciones)
            logger.warn(`Variación ${variantSku} sin atributos diferenciadores válidos - se omitirá`, {
              available_properties: Object.keys(variantAttrs),
              excluded_attributes: attributesInItem,
              excluded_keys: excludedKeys,
              note: 'El producto se creará como simple (sin variaciones) si ninguna variación tiene propiedades válidas',
            });
            return null; // Retornar null para filtrar esta variación
          }
        }
        
        // Agregar otras propiedades como attribute_combinations
        Object.entries(variantAttrs).forEach(([key, value]) => {
          const upperKey = key.toUpperCase();
          // Solo agregar si no es COLOR o SIZE (ya los agregamos arriba)
          if (upperKey !== 'COLOR' && upperKey !== 'SIZE' && 
              key !== 'Talle' && key !== 'Talla' && 
              upperKey !== 'GENDER' && upperKey !== 'MODEL' &&
              upperKey !== 'ITEM_CONDITION') {
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
          picture_ids: pictureIds,
        });
        
        return {
          seller_custom_field: variantSku, // SKU de la variación (el sistema viejo busca en seller_sku)
          price: minPrice, // Precio de la variación (debe ser igual al item principal)
        available_quantity: v.stock,
          attribute_combinations: attributeCombinations, // REQUERIDO: al menos uno
          picture_ids: pictureIds, // REQUERIDO: entre 1 y 10 imágenes
        };
      }).filter((v: any) => v !== null); // Filtrar variaciones nulas
      
      // Si después de filtrar no quedan variaciones válidas, crear el producto como simple
      if (meliItem.variations.length === 0) {
        logger.warn(`Producto ${productSku} sin variaciones válidas - creando como producto simple`);
        // Crear como producto simple usando la primera variación
        const firstVariation = product.variations[0];
        const variantSku = firstVariation.sku || firstVariation.identifier || productSku;
        
        meliItem.price = firstVariation.price || product.price;
        meliItem.available_quantity = firstVariation.stock || product.stock;
        meliItem.seller_custom_field = variantSku;
        
        // Actualizar el atributo SELLER_SKU con el SKU de la variación
        const skuAttributeIndex = meliItem.attributes.findIndex((attr: any) => attr.id === 'SELLER_SKU');
        if (skuAttributeIndex >= 0) {
          meliItem.attributes[skuAttributeIndex].value_name = variantSku;
        } else {
          meliItem.attributes.push({ id: 'SELLER_SKU', value_name: variantSku });
        }
        
        // No agregar variaciones (producto simple)
        delete meliItem.variations;
      } else if (meliItem.variations.length === 1) {
        // Si solo queda una variación válida, también crear como producto simple
        logger.info(`Producto ${productSku} con solo 1 variación válida - creando como producto simple`);
        const singleVariation = meliItem.variations[0];
        
        meliItem.price = singleVariation.price;
        meliItem.available_quantity = singleVariation.available_quantity;
        meliItem.seller_custom_field = singleVariation.seller_custom_field;
        
        // Actualizar el atributo SELLER_SKU
        const skuAttributeIndex = meliItem.attributes.findIndex((attr: any) => attr.id === 'SELLER_SKU');
        if (skuAttributeIndex >= 0) {
          meliItem.attributes[skuAttributeIndex].value_name = singleVariation.seller_custom_field;
        }
        
        // No agregar variaciones (producto simple)
        delete meliItem.variations;
      }
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
