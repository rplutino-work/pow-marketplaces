/**
 * QUEUE ROUTES - Monitoreo y gestión de colas BullMQ
 */

import { Router, Request, Response } from 'express';
import {
  getQueueStats,
  getFailedJobs,
  retryFailedJob,
  getWebhookQueue,
} from '../queues/webhookQueue';
import { isRedisAvailable } from '../config/redis';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /queues/stats - Estadísticas de las colas
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const redisOk = await isRedisAvailable();

    if (!redisOk) {
      res.json({
        redis: 'disconnected',
        message: 'Redis no disponible. Webhooks se procesan de forma síncrona.',
      });
      return;
    }

    const stats = await getQueueStats();
    res.json({ redis: 'connected', ...stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /queues/failed - Jobs fallidos
 */
router.get('/failed', async (req: Request, res: Response) => {
  try {
    const start = parseInt(req.query.start as string) || 0;
    const end = parseInt(req.query.end as string) || 20;

    const jobs = await getFailedJobs(start, end);
    res.json({ total: jobs.length, jobs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /queues/retry/:jobId - Reintentar un job fallido
 */
router.post('/retry/:jobId', async (req: Request, res: Response) => {
  try {
    await retryFailedJob(req.params.jobId);
    res.json({ success: true, message: `Job ${req.params.jobId} reencolado` });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /queues/retry-all - Reintentar todos los jobs fallidos
 */
router.post('/retry-all', async (_req: Request, res: Response) => {
  try {
    const failedJobs = await getFailedJobs(0, 100);
    let retried = 0;
    const errors: string[] = [];

    for (const job of failedJobs) {
      try {
        await retryFailedJob(job.id!);
        retried++;
      } catch (error: any) {
        errors.push(`${job.id}: ${error.message}`);
      }
    }

    res.json({
      success: true,
      total: failedJobs.length,
      retried,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /queues/clean - Limpiar jobs completados/fallidos antiguos
 */
router.delete('/clean', async (_req: Request, res: Response) => {
  try {
    const queue = getWebhookQueue();

    // Limpiar completados de más de 1 hora
    await queue.clean(3600 * 1000, 1000, 'completed');
    // Limpiar fallidos de más de 7 días
    await queue.clean(7 * 24 * 3600 * 1000, 1000, 'failed');

    res.json({ success: true, message: 'Colas limpiadas' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
