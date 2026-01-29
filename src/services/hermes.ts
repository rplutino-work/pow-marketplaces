/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HERMES SERVICE - Comunicación con Hermes OMS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Maneja la comunicación con las instancias de Hermes de los clientes.
 */

import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

const REQUEST_TIMEOUT = 30000; // 30 segundos

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface SendOrderResponse {
  order_id: string;
  status: string;
}

interface ProductsResponse {
  products: any[];
  total: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ÓRDENES
// ═══════════════════════════════════════════════════════════════════════════

export async function sendOrder(
  hermesUrl: string,
  token: string,
  order: any
): Promise<SendOrderResponse> {
  logger.info(`Enviando orden a Hermes: ${hermesUrl}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    // La ruta en Hermes es: /api/marketplaces/:marketplace_code/orders
    // El marketplace_code debe ser 'mercadolibre' o el nombre del marketplace
    const marketplaceCode = order.marketplace || 'mercadolibre';
    const endpoint = `${hermesUrl}/api/marketplaces/${marketplaceCode}/orders`;
    
    // Transformar el formato del payload para que coincida con lo que espera Hermes
    // Hermes espera: { order: { external_id, items: [{ sku, quantity, price }], ... } }
    const hermesPayload = {
      marketplace_code: marketplaceCode,
      order: {
        external_id: order.external_id,
        items: (order.items || []).map((item: any) => ({
          sku: item.sku,
          quantity: item.quantity,
          price: item.price || item.unit_price, // Hermes espera 'price'
          title: item.title,
        })),
        buyer: order.buyer,
        shipping: order.shipping,
        payments: order.payments,
        total: order.total,
        currency: order.currency,
        status: order.status,
        date_created: order.date_created,
        date_closed: order.date_closed,
        tags: order.tags,
        raw_data: order.raw_data,
      },
    };

    logger.debug(`Enviando orden a: ${endpoint}`, { 
      external_id: order.external_id,
      items_count: hermesPayload.order.items.length 
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Marketplace-Token': token,
      },
      body: JSON.stringify(hermesPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error desconocido' })) as { message?: string };
      throw new Error(errorData.message || `Error enviando orden: ${response.status}`);
    }

    const result = await response.json() as { order_id?: string; id?: string };
    logger.info(`Orden enviada exitosamente a Hermes: ${result.order_id || result.id}`);
    
    return {
      order_id: result.order_id || result.id || 'unknown',
      status: 'sent',
    };

  } catch (err) {
    clearTimeout(timeoutId);
    
    const error = err as Error;
    if (error.name === 'AbortError') {
      throw new Error('Timeout enviando orden a Hermes');
    }
    throw error;
  }
}

export async function getOrderStatus(
  hermesUrl: string,
  token: string,
  orderId: string
): Promise<any> {
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

export async function getProducts(
  hermesUrl: string,
  token: string,
  params?: { page?: number; per_page?: number; updated_since?: string }
): Promise<ProductsResponse> {
  const searchParams = new URLSearchParams();
  
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.per_page) searchParams.set('per_page', String(params.per_page));
  if (params?.updated_since) searchParams.set('updated_since', params.updated_since);

  const response = await fetch(
    `${hermesUrl}/api/v1/marketplace/products?${searchParams}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Marketplace-Token': token,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Error obteniendo productos: ${response.status}`);
  }

  return response.json() as Promise<ProductsResponse>;
}

export async function updateProductStatus(
  hermesUrl: string,
  token: string,
  productId: string,
  status: { marketplace_id?: string; status: string; error?: string }
): Promise<void> {
  const response = await fetch(
    `${hermesUrl}/api/v1/marketplace/products/${productId}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Marketplace-Token': token,
      },
      body: JSON.stringify(status),
    }
  );

  if (!response.ok) {
    logger.warn(`Error actualizando estado de producto ${productId}: ${response.status}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STOCK Y PRECIOS
// ═══════════════════════════════════════════════════════════════════════════

export async function notifyStockUpdate(
  hermesUrl: string,
  token: string,
  updates: Array<{ sku: string; stock: number; marketplace_id?: string }>
): Promise<void> {
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
    logger.warn(`Error notificando actualización de stock: ${response.status}`);
  }
}

export async function notifyPriceUpdate(
  hermesUrl: string,
  token: string,
  updates: Array<{ sku: string; price: number; marketplace_id?: string }>
): Promise<void> {
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
    logger.warn(`Error notificando actualización de precios: ${response.status}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

export async function checkHealth(hermesUrl: string): Promise<{
  healthy: boolean;
  responseTime: number;
}> {
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

  } catch {
    return {
      healthy: false,
      responseTime: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOKS / CALLBACKS
// ═══════════════════════════════════════════════════════════════════════════

export async function notifyWebhookReceived(
  hermesUrl: string,
  token: string,
  webhook: {
    topic: string;
    resource: string;
    user_id: string;
    data?: any;
  }
): Promise<void> {
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
  } catch (err) {
    const error = err as Error;
    logger.warn(`Error notificando webhook a Hermes: ${error.message}`);
  }
}

export async function notifyOAuthSuccess(
  hermesUrl: string,
  integrationId: string,
  userId: string
): Promise<void> {
  try {
    await fetch(`${hermesUrl}/admin/marketplaces/oauth_callback/${integrationId}`, {
      method: 'GET',
      headers: { Accept: 'text/html' },
    });
  } catch (err) {
    const error = err as Error;
    logger.warn(`Error notificando OAuth success a Hermes: ${error.message}`);
  }
}

export default {
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
