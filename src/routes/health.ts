/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HEALTH ROUTES - Estado del servicio
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import { getPrisma } from '../config/database';

const router = Router();

/**
 * GET / - Página principal
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'POW Marketplaces Microservice',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      oauth: '/api/v1/oauth/meli/link',
      catalog: '/api/v1/hermes/catalog/sync',
      webhooks: '/webhook/meli',
    },
  });
});

/**
 * GET /health - Health check
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Verificar conexión a base de datos
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: process.uptime(),
    });
    
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    });
  }
});

/**
 * GET /status - Estado detallado
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    
    // Obtener estadísticas básicas
    const [integrationsCount, ordersCount, marketplacesCount] = await Promise.all([
      prisma.integration.count(),
      prisma.order.count(),
      prisma.marketplace.count(),
    ]);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      stats: {
        integrations: integrationsCount,
        orders: ordersCount,
        marketplaces: marketplacesCount,
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
    
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

export default router;
