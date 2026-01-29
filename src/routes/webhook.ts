/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WEBHOOK ROUTES - Recepción de Webhooks de Marketplaces
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import { getPrisma } from '../config/database';
import * as ordersService from '../services/orders';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /webhook/meli - Webhook de MercadoLibre (endpoint principal)
 */
router.post('/meli', async (req: Request, res: Response) => {
  await handleMercadoLibreWebhook(req, res);
});

/**
 * POST /webhook/mercadolibre - Webhook de MercadoLibre (compatibilidad)
 * @deprecated Usar /webhook/meli
 */
router.post('/mercadolibre', async (req: Request, res: Response) => {
  logger.warn('⚠️ Usando endpoint deprecado /webhook/mercadolibre, usar /webhook/meli');
  await handleMercadoLibreWebhook(req, res);
});

/**
 * POST /webhook/:marketplace - Webhook genérico
 */
router.post('/:marketplace', async (req: Request, res: Response) => {
  const { marketplace } = req.params;
  
  logger.info(`📥 Webhook recibido para marketplace: ${marketplace}`);
  
  // Por ahora solo soportamos MercadoLibre
  if (marketplace === 'meli' || marketplace === 'mercadolibre') {
    return handleMercadoLibreWebhook(req, res);
  }
  
  res.status(200).json({ received: true, marketplace });
});

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER DE MERCADOLIBRE
// ═══════════════════════════════════════════════════════════════════════════

async function handleMercadoLibreWebhook(req: Request, res: Response) {
  const webhook = req.body;
  
  logger.info('📥 Webhook MercadoLibre recibido:', {
    topic: webhook.topic,
    resource: webhook.resource,
    user_id: webhook.user_id,
  });

  // Responder rápido para evitar reenvíos
  res.status(200).json({ received: true });

  try {
    const prisma = getPrisma();

    // Buscar integración por user_id: preferir credencial con token vigente
    const candidates = await prisma.integrationCredential.findMany({
      where: { user_id: String(webhook.user_id) },
      include: { integration: true },
      orderBy: { updated_at: 'desc' },
      take: 10,
    });
    const now = new Date();
    const credential = candidates.find((c) => c.expires_at && c.expires_at > now) ?? candidates[0];

    if (!credential) {
      logger.warn(`No se encontró integración para user_id: ${webhook.user_id}`);
      return;
    }

    const integrationId = credential.integration_id;

    // Log del webhook
    await prisma.syncLog.create({
      data: {
        integration_id: integrationId,
        tipo: 'webhook_received',
        detalle: JSON.stringify(webhook),
        resultado: 'success',
      },
    });

    // Procesar según topic
    switch (webhook.topic) {
      case 'orders_v2':
      case 'orders':
        await processOrderWebhook(integrationId, webhook);
        break;
      
      case 'items':
        await processItemWebhook(integrationId, webhook);
        break;
      
      case 'questions':
        await processQuestionWebhook(integrationId, webhook);
        break;
      
      case 'messages':
        await processMessageWebhook(integrationId, webhook);
        break;
      
      case 'shipments':
        await processShipmentWebhook(integrationId, webhook);
        break;

      case 'payments':
        await processPaymentWebhook(integrationId, webhook);
        break;

      case 'stock-locations':
        await processStockLocationsWebhook(integrationId, webhook);
        break;

      default:
        logger.info(`Topic no manejado: ${webhook.topic}`);
    }

  } catch (error: any) {
    logger.error('Error procesando webhook:', { error: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROCESADORES POR TOPIC
// ═══════════════════════════════════════════════════════════════════════════

async function processOrderWebhook(integrationId: string, webhook: any) {
  logger.info(`📦 Procesando webhook de orden: ${webhook.resource}`);

  // Extraer order_id del resource
  const orderId = webhook.resource.replace('/orders/', '');

  try {
    await ordersService.processOrderFromWebhook(integrationId, orderId);
    logger.info(`✅ Orden ${orderId} procesada exitosamente`);
  } catch (error: any) {
    logger.error(`Error procesando orden ${orderId}: ${error.message}`);
  }
}

async function processItemWebhook(integrationId: string, webhook: any) {
  logger.info(`📦 Procesando webhook de item: ${webhook.resource}`);
  
  // Los webhooks de items pueden indicar cambios de stock/precio
  // Por ahora solo logueamos
  const prisma = getPrisma();
  
  await prisma.syncLog.create({
    data: {
      integration_id: integrationId,
      tipo: 'item_update',
      detalle: JSON.stringify({
        resource: webhook.resource,
        actions: webhook.actions || [],
      }),
      resultado: 'success',
    },
  });
}

async function processQuestionWebhook(integrationId: string, webhook: any) {
  logger.info(`❓ Procesando webhook de pregunta: ${webhook.resource}`);
  
  const prisma = getPrisma();
  
  await prisma.syncLog.create({
    data: {
      integration_id: integrationId,
      tipo: 'question_received',
      detalle: JSON.stringify(webhook),
      resultado: 'success',
    },
  });
}

async function processMessageWebhook(integrationId: string, webhook: any) {
  logger.info(`💬 Procesando webhook de mensaje: ${webhook.resource}`);
  
  const prisma = getPrisma();
  
  await prisma.syncLog.create({
    data: {
      integration_id: integrationId,
      tipo: 'message_received',
      detalle: JSON.stringify(webhook),
      resultado: 'success',
    },
  });
}

async function processShipmentWebhook(integrationId: string, webhook: any) {
  logger.info(`🚚 Procesando webhook de envío: ${webhook.resource}`);

  const prisma = getPrisma();

  await prisma.syncLog.create({
    data: {
      integration_id: integrationId,
      tipo: 'shipment_update',
      detalle: JSON.stringify(webhook),
      resultado: 'success',
    },
  });
}

async function processPaymentWebhook(integrationId: string, webhook: any) {
  logger.info(`💰 Webhook de pago recibido: ${webhook.resource}`);

  const prisma = getPrisma();

  await prisma.syncLog.create({
    data: {
      integration_id: integrationId,
      tipo: 'payment_webhook',
      detalle: JSON.stringify(webhook),
      resultado: 'success',
    },
  });
}

async function processStockLocationsWebhook(integrationId: string, webhook: any) {
  logger.info(`📦 Webhook de stock-locations recibido: ${webhook.resource}`);

  const prisma = getPrisma();

  await prisma.syncLog.create({
    data: {
      integration_id: integrationId,
      tipo: 'stock_locations_webhook',
      detalle: JSON.stringify(webhook),
      resultado: 'success',
    },
  });
}

export default router;
