/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POW MARKETPLACES - MICROSERVICIO EXPRESS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Microservicio de integración de marketplaces para POW/Hermes.
 * Reescrito en Express puro desde NestJS para mayor claridad y control.
 * 
 * ARQUITECTURA:
 * - Express para HTTP routing
 * - Prisma para base de datos PostgreSQL
 * - Workers con node-cron para tareas programadas
 * 
 * MÓDULOS PRINCIPALES:
 * - OAuth: Autenticación con MercadoLibre (PKCE flow)
 * - Webhooks: Recepción de notificaciones de marketplaces
 * - Catálogo: Sincronización bidireccional de productos
 * - Órdenes: Procesamiento y envío a Hermes
 * - Reglas: Motor de reglas de negocio
 * 
 * @author POW Team
 * @version 2.0.0
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { logger } from './utils/logger';
import { initDatabase } from './config/database';
import { isRedisAvailable } from './config/redis';

// Rutas
import healthRoutes from './routes/health';
import oauthRoutes from './routes/oauth';
import webhookRoutes from './routes/webhook';
import catalogRoutes from './routes/catalog';
import integrationsRoutes from './routes/integrations';
import adminRoutes from './routes/admin';
import hermesRoutes from './routes/hermes';
import ordersRoutes from './routes/orders';
import queuesRoutes from './routes/queues';

// Workers
import { startScheduler } from './workers/scheduler';
import { startWebhookWorker, startOrderRetryWorker, shutdownQueues } from './queues/webhookQueue';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.PORT || '10000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// ═══════════════════════════════════════════════════════════════════════════
// APLICACIÓN EXPRESS
// ═══════════════════════════════════════════════════════════════════════════

const app = express();

// Middleware de seguridad y parsing
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging de requests en desarrollo
if (NODE_ENV === 'development') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RUTAS
// ═══════════════════════════════════════════════════════════════════════════

// Health check (raíz)
app.use('/', healthRoutes);

// API v1
app.use('/api/v1/oauth', oauthRoutes);
app.use('/api/v1/integrations', integrationsRoutes);
app.use('/api/v1/hermes', hermesRoutes);

// Webhooks
app.use('/webhook', webhookRoutes);

// Catálogo y órdenes
app.use('/catalog', catalogRoutes);
app.use('/orders', ordersRoutes);

// Administración
app.use('/admin', adminRoutes);

// Monitoreo de colas
app.use('/queues', queuesRoutes);

// Rutas legacy/compatibilidad
app.use('/marketplaces', (req: Request, res: Response) => {
  res.json({ message: 'Use /api/v1/integrations instead' });
});

// ═══════════════════════════════════════════════════════════════════════════
// MANEJO DE ERRORES
// ═══════════════════════════════════════════════════════════════════════════

// 404
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
  });
});

// Error handler global
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Error no manejado:', { error: err.message, stack: err.stack });
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INICIO DEL SERVIDOR
// ═══════════════════════════════════════════════════════════════════════════

async function startServer() {
  try {
    logger.info('🚀 Iniciando POW Marketplaces Microservice...');

    // Conectar base de datos
    await initDatabase();
    logger.info('✅ Base de datos conectada');

    // Iniciar workers programados
    startScheduler();
    logger.info('✅ Scheduler iniciado');

    // Iniciar sistema de colas (BullMQ + Redis)
    const redisOk = await isRedisAvailable();
    if (redisOk) {
      startWebhookWorker();
      startOrderRetryWorker();
      logger.info('✅ BullMQ workers iniciados (Redis conectado)');
    } else {
      logger.warn('⚠️ Redis no disponible - webhooks se procesarán de forma síncrona');
      logger.warn('   Para habilitar colas, iniciar Redis: redis-server');
    }

    // Iniciar servidor HTTP
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🚀 POW MARKETPLACES MICROSERVICE                              ║
║                                                                  ║
║   Environment: ${NODE_ENV.padEnd(46)}║
║   Port: ${String(PORT).padEnd(54)}║
║   URL: ${APP_URL.padEnd(55)}║
║                                                                  ║
║   Endpoints:                                                     ║
║   • Health:       /health                                        ║
║   • OAuth:        /api/v1/oauth/meli/link                        ║
║   • Webhooks:     /webhook/meli                                  ║
║   • Catalog:      /api/v1/hermes/catalog/sync                    ║
║   • Integrations: /api/v1/integrations                           ║
║   • Admin:        /admin/health                                  ║
║   • Queues:       /queues/stats                                  ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
      `);
    });

  } catch (error: any) {
    logger.error('❌ Error iniciando servidor:', { error: error.message });
    process.exit(1);
  }
}

// Manejo de señales de terminación (graceful shutdown)
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} recibido, cerrando servidor...`);
  try {
    await shutdownQueues();
  } catch (e: any) {
    logger.error('Error cerrando colas:', { error: e.message });
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Rejection:', { reason: reason?.message || reason });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Iniciar
startServer();

export default app;
