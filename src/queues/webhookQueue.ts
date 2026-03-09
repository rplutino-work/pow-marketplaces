/**
 * WEBHOOK QUEUE - Cola de procesamiento de webhooks con BullMQ
 *
 * Flujo:
 * 1. Webhook llega -> se encola inmediatamente -> respuesta 200 al marketplace
 * 2. Worker toma el job -> busca integración -> obtiene orden de MELI -> aplica reglas -> envía a Hermes
 * 3. Si falla -> BullMQ reintenta automáticamente con backoff exponencial
 *
 * Configuración de reintentos:
 * - Máximo 5 intentos
 * - Backoff exponencial: 30s, 60s, 120s, 240s, 480s
 * - Después de 5 fallos el job queda en "failed" para revisión manual
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { getRedisConnection } from '../config/redis';
import { logger } from '../utils/logger';
import * as ordersService from '../services/orders';
import { getPrisma } from '../config/database';

// Tipos
export interface WebhookJobData {
  topic: string;
  resource: string;
  user_id: number;
  application_id?: number;
  received_at: string;
  attempt_number?: number;
}

export interface OrderJobResult {
  success: boolean;
  order_id?: string;
  hermes_order_id?: string;
  blocked?: boolean;
  reason?: string;
  error?: string;
}

// Nombres de colas
const WEBHOOK_QUEUE_NAME = 'webhook-processing';
const ORDER_RETRY_QUEUE_NAME = 'order-retry';

// Instancias
let webhookQueue: Queue<WebhookJobData, OrderJobResult> | null = null;
let orderRetryQueue: Queue | null = null;
let webhookWorker: Worker<WebhookJobData, OrderJobResult> | null = null;
let orderRetryWorker: Worker | null = null;
let webhookQueueEvents: QueueEvents | null = null;

/**
 * Obtiene o crea la cola de webhooks
 */
export function getWebhookQueue(): Queue<WebhookJobData, OrderJobResult> {
  if (!webhookQueue) {
    const connection = getRedisConnection();
    webhookQueue = new Queue<WebhookJobData, OrderJobResult>(WEBHOOK_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 30000, // 30 segundos inicial
        },
        removeOnComplete: {
          age: 24 * 3600, // Mantener jobs completados 24h
          count: 1000,     // Máximo 1000 jobs completados
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Mantener jobs fallidos 7 días
        },
      },
    });
  }
  return webhookQueue;
}

/**
 * Obtiene o crea la cola de retry de órdenes
 */
export function getOrderRetryQueue(): Queue {
  if (!orderRetryQueue) {
    const connection = getRedisConnection();
    orderRetryQueue = new Queue(ORDER_RETRY_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 500,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      },
    });
  }
  return orderRetryQueue;
}

/**
 * Encola un webhook para procesamiento asíncrono
 */
export async function enqueueWebhook(webhookData: WebhookJobData): Promise<string> {
  const queue = getWebhookQueue();

  // Generar un jobId único basado en topic+resource para deduplicación
  const jobId = `${webhookData.topic}:${webhookData.resource}:${webhookData.user_id}:${Date.now()}`;

  const job = await queue.add('process-webhook', webhookData, {
    jobId,
    // Prioridad: orders tienen prioridad sobre otros topics
    priority: webhookData.topic === 'orders_v2' || webhookData.topic === 'orders' ? 1 : 5,
  });

  logger.info(`Webhook encolado: ${job.id}`, {
    topic: webhookData.topic,
    resource: webhookData.resource,
  });

  return job.id!;
}

/**
 * Inicia el worker de procesamiento de webhooks
 */
export function startWebhookWorker(): void {
  if (webhookWorker) {
    logger.warn('Webhook worker ya está corriendo');
    return;
  }

  const connection = getRedisConnection();

  webhookWorker = new Worker<WebhookJobData, OrderJobResult>(
    WEBHOOK_QUEUE_NAME,
    async (job: Job<WebhookJobData, OrderJobResult>) => {
      return await processWebhookJob(job);
    },
    {
      connection,
      concurrency: 5, // Procesar hasta 5 webhooks en paralelo
      limiter: {
        max: 20,      // Máximo 20 jobs
        duration: 60000, // Por minuto (protección contra rate limits de MELI)
      },
    }
  );

  // Event handlers
  webhookWorker.on('completed', (job: Job<WebhookJobData, OrderJobResult>) => {
    const result = job.returnvalue;
    if (result?.blocked) {
      logger.warn(`Job ${job.id} completado (orden bloqueada): ${result.reason}`);
    } else {
      logger.info(`Job ${job.id} completado exitosamente`, {
        hermes_order_id: result?.hermes_order_id,
      });
    }
  });

  webhookWorker.on('failed', (job: Job<WebhookJobData, OrderJobResult> | undefined, err: Error) => {
    logger.error(`Job ${job?.id} falló (intento ${job?.attemptsMade}/${job?.opts.attempts}):`, {
      error: err.message,
      topic: job?.data.topic,
      resource: job?.data.resource,
    });
  });

  webhookWorker.on('error', (err: Error) => {
    logger.error('Webhook worker error:', { error: err.message });
  });

  // Queue events para monitoreo
  webhookQueueEvents = new QueueEvents(WEBHOOK_QUEUE_NAME, { connection });

  logger.info('Webhook worker iniciado (concurrency: 5, rate: 20/min)');
}

/**
 * Inicia el worker de retry de órdenes
 */
export function startOrderRetryWorker(): void {
  if (orderRetryWorker) return;

  const connection = getRedisConnection();

  orderRetryWorker = new Worker(
    ORDER_RETRY_QUEUE_NAME,
    async (job: Job) => {
      const { orderId } = job.data;
      logger.info(`Reintentando orden ${orderId}...`);

      try {
        const result = await ordersService.retryOrder(orderId);
        return result;
      } catch (error: any) {
        logger.error(`Error reintentando orden ${orderId}: ${error.message}`);
        throw error;
      }
    },
    {
      connection,
      concurrency: 3,
    }
  );

  orderRetryWorker.on('completed', (job: Job) => {
    logger.info(`Retry de orden ${job.data.orderId} completado`);
  });

  orderRetryWorker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error(`Retry de orden ${job?.data.orderId} falló: ${err.message}`);
  });

  logger.info('Order retry worker iniciado');
}

/**
 * Procesador principal de webhooks
 */
async function processWebhookJob(job: Job<WebhookJobData, OrderJobResult>): Promise<OrderJobResult> {
  const { topic, resource, user_id } = job.data;

  logger.info(`[Worker] Procesando job ${job.id}: ${topic} ${resource}`, {
    attempt: job.attemptsMade + 1,
    maxAttempts: job.opts.attempts,
  });

  const prisma = getPrisma();

  // Buscar integración por user_id
  const candidates = await prisma.integrationCredential.findMany({
    where: { user_id: String(user_id) },
    include: { integration: true },
    orderBy: { updated_at: 'desc' },
    take: 10,
  });

  const now = new Date();
  const credential = candidates.find((c) => c.expires_at && c.expires_at > now) ?? candidates[0];

  if (!credential) {
    // No reintentable - no existe la integración
    logger.warn(`No se encontró integración para user_id: ${user_id}`);
    return { success: false, error: 'Integration not found for user_id' };
  }

  const integrationId = credential.integration_id;

  // Log del webhook recibido
  await prisma.syncLog.create({
    data: {
      integration_id: integrationId,
      tipo: 'webhook_received',
      detalle: JSON.stringify({
        topic,
        resource,
        user_id,
        job_id: job.id,
        attempt: job.attemptsMade + 1,
      }),
      resultado: 'success',
    },
  });

  // Procesar según topic
  switch (topic) {
    case 'orders_v2':
    case 'orders': {
      const orderId = resource.replace('/orders/', '');

      // Actualizar progreso del job
      await job.updateProgress(10);

      try {
        const result = await ordersService.processOrderFromWebhook(integrationId, orderId);

        await job.updateProgress(100);

        return {
          success: result.success !== false,
          order_id: orderId,
          hermes_order_id: result.hermes_order_id ?? undefined,
          blocked: result.blocked,
          reason: result.reason,
        };
      } catch (error: any) {
        // Determinar si el error es reintentable
        const isRetryable = isRetryableError(error);

        if (!isRetryable) {
          logger.error(`Error no reintentable para orden ${orderId}: ${error.message}`);
          // Guardar el error pero no relanzar para que no reintente
          await prisma.syncLog.create({
            data: {
              integration_id: integrationId,
              tipo: 'order_failed_permanent',
              detalle: JSON.stringify({
                order_id: orderId,
                error: error.message,
                job_id: job.id,
              }),
              resultado: 'error',
            },
          });
          return { success: false, order_id: orderId, error: error.message };
        }

        // Error reintentable - relanzar para que BullMQ reintente
        throw error;
      }
    }

    case 'items': {
      await prisma.syncLog.create({
        data: {
          integration_id: integrationId,
          tipo: 'item_update',
          detalle: JSON.stringify({ resource, job_id: job.id }),
          resultado: 'success',
        },
      });
      return { success: true };
    }

    case 'shipments': {
      await prisma.syncLog.create({
        data: {
          integration_id: integrationId,
          tipo: 'shipment_update',
          detalle: JSON.stringify({ resource, job_id: job.id }),
          resultado: 'success',
        },
      });
      return { success: true };
    }

    case 'payments': {
      await prisma.syncLog.create({
        data: {
          integration_id: integrationId,
          tipo: 'payment_webhook',
          detalle: JSON.stringify({ resource, job_id: job.id }),
          resultado: 'success',
        },
      });
      return { success: true };
    }

    case 'questions':
    case 'messages': {
      await prisma.syncLog.create({
        data: {
          integration_id: integrationId,
          tipo: `${topic}_webhook`,
          detalle: JSON.stringify({ resource, job_id: job.id }),
          resultado: 'success',
        },
      });
      return { success: true };
    }

    default:
      logger.info(`Topic no manejado: ${topic}`);
      return { success: true };
  }
}

/**
 * Determina si un error es reintentable
 */
function isRetryableError(error: any): boolean {
  const message = error.message?.toLowerCase() || '';

  // Errores de red / timeout -> reintentar
  if (message.includes('timeout') || message.includes('econnrefused') ||
      message.includes('econnreset') || message.includes('socket hang up') ||
      message.includes('network') || message.includes('fetch failed') ||
      message.includes('502') || message.includes('503') || message.includes('504')) {
    return true;
  }

  // Token expirado -> reintentar (el token refresh worker puede haberlo renovado)
  if (message.includes('token') && (message.includes('expired') || message.includes('invalid'))) {
    return true;
  }

  // Rate limit de MELI
  if (message.includes('too many requests') || message.includes('429')) {
    return true;
  }

  // Errores de negocio (orden no encontrada, SKU no existe) -> NO reintentar
  if (message.includes('not found') || message.includes('no encontrada')) {
    return false;
  }

  // Por defecto, reintentar
  return true;
}

/**
 * Obtiene estadísticas de las colas
 */
export async function getQueueStats() {
  const queue = getWebhookQueue();
  const retryQueue = getOrderRetryQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  const [retryWaiting, retryActive, retryFailed] = await Promise.all([
    retryQueue.getWaitingCount(),
    retryQueue.getActiveCount(),
    retryQueue.getFailedCount(),
  ]);

  return {
    webhook_queue: {
      name: WEBHOOK_QUEUE_NAME,
      waiting,
      active,
      completed,
      failed,
      delayed,
    },
    order_retry_queue: {
      name: ORDER_RETRY_QUEUE_NAME,
      waiting: retryWaiting,
      active: retryActive,
      failed: retryFailed,
    },
  };
}

/**
 * Obtiene los jobs fallidos para revisión
 */
export async function getFailedJobs(start = 0, end = 20) {
  const queue = getWebhookQueue();
  const jobs = await queue.getFailed(start, end);

  return jobs.map((job) => ({
    id: job.id,
    data: job.data,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn,
  }));
}

/**
 * Reintenta un job fallido específico
 */
export async function retryFailedJob(jobId: string): Promise<void> {
  const queue = getWebhookQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    throw new Error(`Job ${jobId} no encontrado`);
  }

  await job.retry();
  logger.info(`Job ${jobId} reencolado para reintento`);
}

/**
 * Cierra workers y colas limpiamente
 */
export async function shutdownQueues(): Promise<void> {
  logger.info('Cerrando workers y colas...');

  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
  }

  if (orderRetryWorker) {
    await orderRetryWorker.close();
    orderRetryWorker = null;
  }

  if (webhookQueueEvents) {
    await webhookQueueEvents.close();
    webhookQueueEvents = null;
  }

  if (webhookQueue) {
    await webhookQueue.close();
    webhookQueue = null;
  }

  if (orderRetryQueue) {
    await orderRetryQueue.close();
    orderRetryQueue = null;
  }

  logger.info('Workers y colas cerrados');
}
