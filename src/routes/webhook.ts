/**
 * WEBHOOK ROUTES - Recepción de Webhooks de Marketplaces
 *
 * Los webhooks se reciben, validan y encolan en BullMQ para procesamiento
 * asíncrono. La respuesta al marketplace es inmediata (< 100ms).
 *
 * Si Redis no está disponible, se procesa de forma síncrona como fallback.
 */

import { Router, Request, Response } from 'express';
import { enqueueWebhook, WebhookJobData } from '../queues/webhookQueue';
import { isRedisAvailable } from '../config/redis';
import { getPrisma } from '../config/database';
import * as ordersService from '../services/orders';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /webhook/meli - Webhook de MercadoLibre
 */
router.post('/meli', async (req: Request, res: Response) => {
  await handleMercadoLibreWebhook(req, res);
});

/**
 * POST /webhook/mercadolibre - Compatibilidad
 */
router.post('/mercadolibre', async (req: Request, res: Response) => {
  await handleMercadoLibreWebhook(req, res);
});

/**
 * POST /webhook/:marketplace - Genérico
 */
router.post('/:marketplace', async (req: Request, res: Response) => {
  const { marketplace } = req.params;

  if (marketplace === 'meli' || marketplace === 'mercadolibre') {
    return handleMercadoLibreWebhook(req, res);
  }

  res.status(200).json({ received: true, marketplace });
});

// Handler principal
async function handleMercadoLibreWebhook(req: Request, res: Response) {
  const webhook = req.body;

  // Validación mínima
  if (!webhook.topic || !webhook.resource || !webhook.user_id) {
    logger.warn('Webhook inválido recibido:', { body: webhook });
    // Responder 200 igual para que MELI no reenvíe basura
    res.status(200).json({ received: true, valid: false });
    return;
  }

  logger.info(`Webhook recibido: ${webhook.topic} ${webhook.resource} (user: ${webhook.user_id})`);

  // Responder inmediatamente al marketplace
  res.status(200).json({ received: true });

  // Intentar encolar en BullMQ
  try {
    const redisOk = await isRedisAvailable();

    if (redisOk) {
      const jobData: WebhookJobData = {
        topic: webhook.topic,
        resource: webhook.resource,
        user_id: webhook.user_id,
        application_id: webhook.application_id,
        received_at: new Date().toISOString(),
      };

      const jobId = await enqueueWebhook(jobData);
      logger.info(`Webhook encolado -> job ${jobId}`);
    } else {
      // Fallback: procesar síncronamente si Redis no está disponible
      logger.warn('Redis no disponible, procesando webhook de forma síncrona');
      await processSynchronously(webhook);
    }
  } catch (error: any) {
    logger.error('Error encolando webhook, procesando de forma síncrona:', {
      error: error.message,
    });

    // Fallback síncrono
    try {
      await processSynchronously(webhook);
    } catch (syncError: any) {
      logger.error('Error en procesamiento síncrono:', { error: syncError.message });
    }
  }
}

/**
 * Fallback: procesamiento síncrono cuando Redis no está disponible
 */
async function processSynchronously(webhook: any) {
  const prisma = getPrisma();

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

  await prisma.syncLog.create({
    data: {
      integration_id: integrationId,
      tipo: 'webhook_received',
      detalle: JSON.stringify({ ...webhook, mode: 'sync_fallback' }),
      resultado: 'success',
    },
  });

  if (webhook.topic === 'orders_v2' || webhook.topic === 'orders') {
    const orderId = webhook.resource.replace('/orders/', '');
    try {
      await ordersService.processOrderFromWebhook(integrationId, orderId);
      logger.info(`Orden ${orderId} procesada (modo síncrono)`);
    } catch (error: any) {
      logger.error(`Error procesando orden ${orderId} (modo síncrono): ${error.message}`);
    }
  }
}

export default router;
