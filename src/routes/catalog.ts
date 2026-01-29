/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CATALOG ROUTES - Sincronización de Catálogo
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import { getPrisma } from '../config/database';
import * as catalogService from '../services/catalog';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /catalog/sync/:integration_id - Sincronizar catálogo
 */
router.post('/sync/:integration_id', async (req: Request, res: Response) => {
  try {
    const { products, options } = req.body;

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({
        error: 'Se requiere array de products',
      });
    }

    const result = await catalogService.syncCatalog({
      integration_id: req.params.integration_id,
      products,
      options,
    });

    res.json({
      success: true,
      results: result,
    });

  } catch (error: any) {
    logger.error('Error en sincronización de catálogo:', { error: error.message });
    res.status(500).json({
      error: 'Error en sincronización',
      details: error.message,
    });
  }
});

/**
 * GET /catalog/sync/:integration_id/status - Estado de sincronización
 */
router.get('/sync/:integration_id/status', async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();

    // Obtener último sync
    const lastSync = await prisma.syncLog.findFirst({
      where: {
        integration_id: req.params.integration_id,
        tipo: 'catalog_sync',
      },
      orderBy: { created_at: 'desc' },
    });

    // Obtener jobs pendientes
    const pendingJobs = await prisma.syncJob.count({
      where: {
        integration_id: req.params.integration_id,
        job_type: 'catalog_sync',
        status: { in: ['pending', 'processing'] },
      },
    });

    res.json({
      last_sync: lastSync ? {
        timestamp: lastSync.created_at,
        resultado: lastSync.resultado,
        detalle: JSON.parse(lastSync.detalle || '{}'),
      } : null,
      pending_jobs: pendingJobs,
      is_syncing: pendingJobs > 0,
    });

  } catch (error: any) {
    logger.error('Error obteniendo estado de sync:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /catalog/sync/:integration_id/history - Historial de sincronizaciones
 */
router.get('/sync/:integration_id/history', async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const { limit = '20' } = req.query;

    const history = await prisma.syncLog.findMany({
      where: {
        integration_id: req.params.integration_id,
        tipo: 'catalog_sync',
      },
      orderBy: { created_at: 'desc' },
      take: parseInt(String(limit), 10),
    });

    res.json(history.map(log => ({
      id: log.id,
      timestamp: log.created_at,
      resultado: log.resultado,
      detalle: JSON.parse(log.detalle || '{}'),
    })));

  } catch (error: any) {
    logger.error('Error obteniendo historial:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /catalog/products/:integration_id/update-prices - Actualizar precios
 */
router.post('/products/:integration_id/update-prices', async (req: Request, res: Response) => {
  try {
    const { prices } = req.body;

    if (!prices || !Array.isArray(prices)) {
      return res.status(400).json({
        error: 'Se requiere array de prices con formato [{ sku, price }]',
      });
    }

    const prisma = getPrisma();

    // Crear job para actualización de precios
    const job = await prisma.syncJob.create({
      data: {
        integration_id: req.params.integration_id,
        job_type: 'price_update',
        payload: JSON.stringify({ prices }),
        status: 'pending',
      },
    });

    res.json({
      success: true,
      message: 'Actualización de precios programada',
      job_id: job.id,
      prices_count: prices.length,
    });

  } catch (error: any) {
    logger.error('Error programando actualización de precios:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /catalog/products/:integration_id/update-stock - Actualizar stock
 */
router.post('/products/:integration_id/update-stock', async (req: Request, res: Response) => {
  try {
    const { stock } = req.body;

    if (!stock || !Array.isArray(stock)) {
      return res.status(400).json({
        error: 'Se requiere array de stock con formato [{ sku, quantity }]',
      });
    }

    const prisma = getPrisma();

    // Crear job para actualización de stock
    const job = await prisma.syncJob.create({
      data: {
        integration_id: req.params.integration_id,
        job_type: 'stock_update',
        payload: JSON.stringify({ stock }),
        status: 'pending',
      },
    });

    res.json({
      success: true,
      message: 'Actualización de stock programada',
      job_id: job.id,
      stock_count: stock.length,
    });

  } catch (error: any) {
    logger.error('Error programando actualización de stock:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /catalog/products/:integration_id/stats - Estadísticas de productos
 */
router.get('/products/:integration_id/stats', async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();

    // Contar syncs exitosos/fallidos
    const syncStats = await prisma.syncLog.groupBy({
      by: ['resultado'],
      where: {
        integration_id: req.params.integration_id,
        tipo: 'catalog_sync',
      },
      _count: { id: true },
    });

    const statsByResultado: Record<string, number> = {};
    syncStats.forEach(stat => {
      statsByResultado[stat.resultado] = stat._count.id;
    });

    // Último sync exitoso
    const lastSuccessfulSync = await prisma.syncLog.findFirst({
      where: {
        integration_id: req.params.integration_id,
        tipo: 'catalog_sync',
        resultado: 'success',
      },
      orderBy: { created_at: 'desc' },
    });

    res.json({
      total_syncs: Object.values(statsByResultado).reduce((a, b) => a + b, 0),
      by_resultado: statsByResultado,
      last_successful_sync: lastSuccessfulSync?.created_at || null,
    });

  } catch (error: any) {
    logger.error('Error obteniendo estadísticas:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
