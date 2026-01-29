/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ORDERS SERVICE - Gestión de Órdenes
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Procesa órdenes desde MercadoLibre, aplica reglas y envía a Hermes.
 * Usa schema de producción con campos: source_order_id, flag_reason, etc.
 */

import { getPrisma } from '../config/database';
import { logger } from '../utils/logger';
import * as meliService from '../services/mercadolibre';
import * as hermesService from '../services/hermes';
import * as rulesService from '../services/rules';
import { decrypt } from '../services/encryption';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface OrderFilter {
  integration_id?: string;
  status?: string;
  from_date?: Date;
  to_date?: Date;
  limit?: number;
  offset?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROCESAMIENTO DE ÓRDENES
// ═══════════════════════════════════════════════════════════════════════════

export async function processOrderFromWebhook(
  integrationId: string,
  orderId: string
) {
  const prisma = getPrisma();
  
  logger.info(`Procesando orden ${orderId} para integración ${integrationId}`);

  // Obtener integración con credenciales
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    include: {
      marketplace: true,
      credentials: { orderBy: { updated_at: 'desc' }, take: 1 },
    },
  });

  if (!integration) {
    throw new Error(`Integración ${integrationId} no encontrada`);
  }

  if (!integration.credentials.length) {
    throw new Error('Sin credenciales configuradas');
  }

  // Obtener access token
  const credential = integration.credentials[0];
  let accessToken: string | null = null;

  if (credential.access_token) {
    accessToken = decrypt(credential.access_token);
  }

  if (!accessToken) {
    throw new Error('Access token no disponible');
  }

  // Obtener orden de MercadoLibre
  const meliOrder = await meliService.getOrder(orderId, accessToken);

  if (!meliOrder) {
    throw new Error(`Orden ${orderId} no encontrada en MercadoLibre`);
  }

  // Verificar si ya existe
  let order = await prisma.order.findFirst({
    where: {
      source_order_id: String(meliOrder.id),
      marketplace_id: integration.marketplace_id,
    },
  });

  if (!order) {
    // Crear registro de orden
    order = await prisma.order.create({
      data: {
        integration_id: integrationId,
        source_order_id: String(meliOrder.id),
        marketplace_id: integration.marketplace_id,
        status: 'pending',
        payload_normalized: JSON.stringify(meliOrder),
      },
    });
    logger.info(`Orden ${order.id} creada`);
  }

  // Aplicar reglas
  const rulesResult = await rulesService.applyRulesToOrder(integrationId, meliOrder);

  if (rulesResult.result.should_block) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'blocked_by_rule',
        flag_reason: rulesResult.result.flag_reason,
        updated_at: new Date(),
      },
    });

    await logOrderEvent(order.id, integrationId, 'order_blocked', {
      reason: rulesResult.result.flag_reason,
      rules: rulesResult.result.applied_rules,
    });

    logger.warn(`Orden ${orderId} bloqueada: ${rulesResult.result.flag_reason}`);
    return { success: false, blocked: true, reason: rulesResult.result.flag_reason };
  }

  // Transformar a formato Hermes
  const hermesOrder = transformOrderToHermes(rulesResult.order, integration);

  // Enviar a Hermes
  try {
    if (integration.hermes_api_url && integration.hermes_enabled) {
      const hermesResponse = await hermesService.sendOrder(
        integration.hermes_api_url,
        integration.hermes_token || '',
        hermesOrder
      );

      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'sent_to_hermes',
          hermes_order_id: hermesResponse.order_id,
          payload_normalized: JSON.stringify({
            ...meliOrder,
            transformations: rulesResult.result.transformations,
          }),
          processed_at: new Date(),
          updated_at: new Date(),
        },
      });

      await logOrderEvent(order.id, integrationId, 'order_sent_to_hermes', {
        hermes_order_id: hermesResponse.order_id,
        applied_rules: rulesResult.result.applied_rules,
      });

      logger.success(`Orden ${orderId} enviada a Hermes: ${hermesResponse.order_id}`);
      return { success: true, hermes_order_id: hermesResponse.order_id };
    } else {
      // Hermes no configurado, marcar como procesada
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'processed',
          payload_normalized: JSON.stringify(rulesResult.order),
          processed_at: new Date(),
          updated_at: new Date(),
        },
      });

      return { success: true, hermes_order_id: null };
    }
  } catch (error: any) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'failed',
        last_error: error.message,
        retry_count: { increment: 1 },
        updated_at: new Date(),
      },
    });

    await logOrderEvent(order.id, integrationId, 'order_failed', {
      error: error.message,
    });

    throw error;
  }
}

export async function retryOrder(orderId: string) {
  const prisma = getPrisma();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { integration: true },
  });

  if (!order) {
    throw new Error(`Orden ${orderId} no encontrada`);
  }

  if (order.status === 'sent_to_hermes') {
    throw new Error('Orden ya fue enviada a Hermes');
  }

  // Obtener el order_id original de MercadoLibre desde payload
  const payload = JSON.parse(order.payload_normalized || '{}');
  const meliOrderId = payload.id || order.source_order_id;

  return processOrderFromWebhook(order.integration_id, String(meliOrderId));
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSULTA DE ÓRDENES
// ═══════════════════════════════════════════════════════════════════════════

export async function getOrders(filter: OrderFilter = {}) {
  const prisma = getPrisma();

  const where: any = {};

  if (filter.integration_id) {
    where.integration_id = filter.integration_id;
  }

  if (filter.status) {
    where.status = filter.status;
  }

  if (filter.from_date || filter.to_date) {
    where.created_at = {};
    if (filter.from_date) where.created_at.gte = filter.from_date;
    if (filter.to_date) where.created_at.lte = filter.to_date;
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      integration: {
        select: {
          id: true,
          hermes_integration_id: true,
          cliente_name: true,
          marketplace: { select: { name: true } },
        },
      },
    },
    orderBy: { created_at: 'desc' },
    take: filter.limit || 50,
    skip: filter.offset || 0,
  });

  return orders.map(order => ({
    id: order.id,
    source_order_id: order.source_order_id,
    status: order.status,
    flag_reason: order.flag_reason,
    hermes_order_id: order.hermes_order_id,
    retry_count: order.retry_count,
    last_error: order.last_error,
    created_at: order.created_at,
    processed_at: order.processed_at,
    integration: {
      id: order.integration.id,
      hermes_integration_id: order.integration.hermes_integration_id,
      cliente_name: order.integration.cliente_name,
      marketplace: order.integration.marketplace.name,
    },
  }));
}

export async function getOrderById(orderId: string) {
  const prisma = getPrisma();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      integration: {
        include: { marketplace: true },
      },
    },
  });

  if (!order) return null;

  // Obtener logs
  const logs = await prisma.syncLog.findMany({
    where: {
      integration_id: order.integration_id,
      detalle: { contains: order.source_order_id },
    },
    orderBy: { created_at: 'desc' },
    take: 20,
  });

  return {
    ...order,
    payload: JSON.parse(order.payload_normalized || '{}'),
    logs: logs.map(log => ({
      id: log.id,
      tipo: log.tipo,
      detalle: JSON.parse(log.detalle || '{}'),
      resultado: log.resultado,
      created_at: log.created_at,
    })),
  };
}

export async function getOrderStats(integrationId?: string) {
  const prisma = getPrisma();

  const where = integrationId ? { integration_id: integrationId } : {};

  const stats = await prisma.order.groupBy({
    by: ['status'],
    where,
    _count: { id: true },
  });

  const total = stats.reduce((acc, s) => acc + s._count.id, 0);

  const byStatus: Record<string, number> = {};
  stats.forEach(s => {
    byStatus[s.status] = s._count.id;
  });

  // Órdenes de las últimas 24 horas
  const last24h = await prisma.order.count({
    where: {
      ...where,
      created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  return {
    total,
    by_status: byStatus,
    last_24h: last24h,
  };
}

export async function getBlockedOrdersSummary(integrationId?: string) {
  const prisma = getPrisma();

  const where: any = { status: 'blocked_by_rule' };
  if (integrationId) where.integration_id = integrationId;

  const blockedOrders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      source_order_id: true,
      flag_reason: true,
      created_at: true,
      integration: {
        select: {
          id: true,
          cliente_name: true,
        },
      },
    },
    orderBy: { created_at: 'desc' },
    take: 100,
  });

  // Agrupar por razón
  const byReason: Record<string, number> = {};
  blockedOrders.forEach(order => {
    const reason = order.flag_reason || 'Sin razón';
    byReason[reason] = (byReason[reason] || 0) + 1;
  });

  return {
    total: blockedOrders.length,
    by_reason: byReason,
    orders: blockedOrders,
  };
}

export async function bulkRetryBlockedOrders(integrationId: string) {
  const prisma = getPrisma();

  const blockedOrders = await prisma.order.findMany({
    where: {
      integration_id: integrationId,
      status: 'blocked_by_rule',
    },
    take: 50,
  });

  const results = {
    total: blockedOrders.length,
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const order of blockedOrders) {
    try {
      await retryOrder(order.id);
      results.success++;
    } catch (error: any) {
      results.failed++;
      results.errors.push(`${order.source_order_id}: ${error.message}`);
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSFORMACIÓN DE ORDEN A FORMATO HERMES
// ═══════════════════════════════════════════════════════════════════════════

function transformOrderToHermes(meliOrder: any, integration: any) {
  const items = meliOrder.order_items?.map((item: any) => {
    // Extraer SKU: priorizar seller_sku (como en el sistema viejo), luego seller_custom_field
    // El sistema viejo usa: item.dig('item','seller_sku')
    const sku = item.item?.seller_sku || item.item?.seller_custom_field || item.item?.id;
    
    logger.debug(`Transformando item de orden:`, {
      item_id: item.item?.id,
      seller_sku: item.item?.seller_sku,
      seller_custom_field: item.item?.seller_custom_field,
      sku_final: sku,
      quantity: item.quantity,
      unit_price: item.unit_price,
    });
    
    return {
      sku: String(sku), // Asegurar que sea string
    title: item.item?.title,
    quantity: item.quantity,
      price: item.unit_price, // Precio unitario (Hermes espera 'price')
      unit_price: item.unit_price, // Mantener para compatibilidad
    total: item.unit_price * item.quantity,
    };
  }) || [];
  
  logger.info(`Items transformados para Hermes: ${items.length} items`, {
    items: items.map((i: { sku: string; quantity: number; price: number }) => ({ 
      sku: i.sku, 
      quantity: i.quantity, 
      price: i.price 
    })),
  });

  const shippingAddress = meliOrder.shipping?.receiver_address || {};

  return {
    external_id: String(meliOrder.id),
    marketplace: 'mercadolibre',
    marketplace_integration_id: integration.hermes_integration_id,
    status: meliOrder.status,
    date_created: meliOrder.date_created,
    date_closed: meliOrder.date_closed,
    
    buyer: {
      id: meliOrder.buyer?.id,
      nickname: meliOrder.buyer?.nickname,
      first_name: meliOrder.buyer?.first_name,
      last_name: meliOrder.buyer?.last_name,
      email: meliOrder.buyer?.email,
      phone: meliOrder.buyer?.phone?.number,
    },
    
    items,
    
    total: meliOrder.total_amount,
    currency: meliOrder.currency_id,
    
    shipping: {
      id: meliOrder.shipping?.id,
      mode: meliOrder.shipping?.mode,
      type: meliOrder.shipping?.shipment_type,
      status: meliOrder.shipping?.status,
      cost: meliOrder.shipping?.cost,
      address: {
        street: shippingAddress.street_name,
        number: shippingAddress.street_number,
        city: shippingAddress.city?.name,
        state: shippingAddress.state?.name,
        zip_code: shippingAddress.zip_code,
        country: shippingAddress.country?.name,
        comments: shippingAddress.comment,
      },
      receiver: {
        name: shippingAddress.receiver_name,
        phone: shippingAddress.receiver_phone,
      },
    },
    
    payments: meliOrder.payments?.map((p: any) => ({
      id: p.id,
      status: p.status,
      method: p.payment_method_id,
      amount: p.total_paid_amount,
      date: p.date_approved,
    })) || [],
    
    tags: meliOrder.tags || [],
    
    raw_data: meliOrder,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════

async function logOrderEvent(
  orderId: string,
  integrationId: string,
  tipo: string,
  detalle: any
) {
  const prisma = getPrisma();

  await prisma.syncLog.create({
    data: {
      integration_id: integrationId,
      tipo,
      detalle: JSON.stringify({ order_id: orderId, ...detalle }),
      resultado: tipo.includes('failed') || tipo.includes('blocked') ? 'error' : 'success',
    },
  });
}

export default {
  processOrderFromWebhook,
  retryOrder,
  getOrders,
  getOrderById,
  getOrderStats,
  getBlockedOrdersSummary,
  bulkRetryBlockedOrders,
};
