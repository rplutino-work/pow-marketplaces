/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MERCADOLIBRE SERVICE - Interacción con API de MercadoLibre
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Centraliza todas las llamadas a la API de MercadoLibre.
 */

import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

const MELI_API_URL = process.env.ML_API_URL || 'https://api.mercadolibre.com';
const MELI_AUTH_URL = 'https://api.mercadolibre.com/oauth/token';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
  scope?: string;
}

interface OrdersResponse {
  results: any[];
  paging: {
    total: number;
    offset: number;
    limit: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════════════════════

export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<TokenResponse> {
  const body: Record<string, string> = {
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
    const errorData = await response.json() as { message?: string };
    logger.error('Error intercambiando código por tokens:', { error: errorData });
    throw new Error(errorData.message || 'Error en OAuth');
  }

  return response.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<TokenResponse> {
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
    const errorData = await response.json() as { message?: string };
    logger.error('Error refrescando token:', { error: errorData });
    throw new Error(errorData.message || 'Error refrescando token');
  }

  return response.json() as Promise<TokenResponse>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ÓRDENES
// ═══════════════════════════════════════════════════════════════════════════

export async function getOrder(orderId: string, accessToken: string): Promise<any> {
  const response = await fetch(`${MELI_API_URL}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    throw new Error(errorData.message || `Error obteniendo orden ${orderId}`);
  }

  return response.json();
}

export async function getOrders(
  userId: string,
  accessToken: string,
  params?: { status?: string; offset?: number; limit?: number }
): Promise<OrdersResponse> {
  const searchParams = new URLSearchParams({
    seller: userId,
    sort: 'date_desc',
  });

  if (params?.status) searchParams.set('order.status', params.status);
  if (params?.offset) searchParams.set('offset', String(params.offset));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const response = await fetch(`${MELI_API_URL}/orders/search?${searchParams}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    throw new Error(errorData.message || 'Error obteniendo órdenes');
  }

  return response.json() as Promise<OrdersResponse>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ITEMS / PRODUCTOS
// ═══════════════════════════════════════════════════════════════════════════

export async function getItem(itemId: string, accessToken: string): Promise<any> {
  const response = await fetch(`${MELI_API_URL}/items/${itemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    throw new Error(errorData.message || `Error obteniendo item ${itemId}`);
  }

  return response.json();
}

export async function createItem(item: any, accessToken: string): Promise<any> {
  logger.info('Creando producto en ML:', { title: item.title, sku: item.seller_custom_field });

  const response = await fetch(`${MELI_API_URL}/items`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(item),
  });

  if (!response.ok) {
    const errorData = await response.json() as { cause?: Array<{ message?: string }>; message?: string };
    logger.error('Error creando producto:', { error: errorData });
    
    // Build comprehensive error message from all MELI error causes
    const causes = errorData.cause || [];
    const allMessages = causes.map((c: any) => c.message || c.code || '').filter(Boolean);
    const errorMessage = allMessages.length > 0
      ? allMessages.join(' | ')
      : (errorData.message || 'Error creando producto');
    const fullError = new Error(`Failed to create product: ${errorMessage}`);
    (fullError as any).cause = causes;
    (fullError as any).meliResponse = errorData;
    logger.error('Full MELI error response:', JSON.stringify(errorData, null, 2));
    throw fullError;
  }

  const result = await response.json();
  logger.info(`Producto creado exitosamente: ${(result as any).id}`);
  return result;
}

export async function updateItem(
  itemId: string,
  data: any,
  accessToken: string
): Promise<any> {
  const response = await fetch(`${MELI_API_URL}/items/${itemId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    throw new Error(errorData.message || `Error actualizando item ${itemId}`);
  }

  return response.json();
}

export async function updateVariation(
  itemId: string,
  variationId: string,
  data: any,
  accessToken: string
): Promise<any> {
  const response = await fetch(
    `${MELI_API_URL}/items/${itemId}/variations/${variationId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    throw new Error(errorData.message || `Error actualizando variación ${variationId}`);
  }

  return response.json();
}

export async function findItemBySku(
  userId: string,
  sku: string,
  accessToken: string
): Promise<any | null> {
  try {
    const response = await fetch(
      `${MELI_API_URL}/users/${userId}/items/search?seller_sku=${encodeURIComponent(sku)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { results?: string[] };
    
    if (data.results && data.results.length > 0) {
      return await getItem(data.results[0], accessToken);
    }

    return null;
  } catch {
    return null;
  }
}

export async function getActiveItems(
  userId: string,
  accessToken: string
): Promise<any[]> {
  const items: any[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const response = await fetch(
      `${MELI_API_URL}/users/${userId}/items/search?status=active&offset=${offset}&limit=${limit}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) break;

    const data = await response.json() as { results?: string[] };
    
    if (!data.results || data.results.length === 0) break;

    // Obtener detalles de cada item
    for (const itemId of data.results) {
      try {
        const item = await getItem(itemId, accessToken);
        items.push(item);
      } catch {
        // Ignorar items que no se puedan obtener
      }
    }

    if (data.results.length < limit) break;
    offset += limit;
  }

  return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// USUARIO
// ═══════════════════════════════════════════════════════════════════════════

export async function getUser(accessToken: string): Promise<any> {
  const response = await fetch(`${MELI_API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    throw new Error(errorData.message || 'Error obteniendo usuario');
  }

  return response.json();
}

export async function getUserById(userId: string, accessToken: string): Promise<any> {
  const response = await fetch(`${MELI_API_URL}/users/${userId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    throw new Error(errorData.message || `Error obteniendo usuario ${userId}`);
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORÍAS
// ═══════════════════════════════════════════════════════════════════════════

export async function getCategory(categoryId: string): Promise<any> {
  const response = await fetch(`${MELI_API_URL}/categories/${categoryId}`);

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    throw new Error(errorData.message || `Error obteniendo categoría ${categoryId}`);
  }

  return response.json();
}

export async function getCategoryAttributes(categoryId: string): Promise<any[]> {
  const response = await fetch(`${MELI_API_URL}/categories/${categoryId}/attributes`);

  if (!response.ok) {
    return [];
  }

  return response.json() as Promise<any[]>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHIPPING
// ═══════════════════════════════════════════════════════════════════════════

export async function getShipment(shipmentId: string, accessToken: string): Promise<any> {
  const response = await fetch(`${MELI_API_URL}/shipments/${shipmentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    throw new Error(errorData.message || `Error obteniendo envío ${shipmentId}`);
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICACIONES (Webhooks)
// ═══════════════════════════════════════════════════════════════════════════

export async function getNotificationResource(
  resourcePath: string,
  accessToken: string
): Promise<any> {
  const response = await fetch(`${MELI_API_URL}${resourcePath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    throw new Error(errorData.message || `Error obteniendo recurso ${resourcePath}`);
  }

  return response.json();
}

export default {
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
