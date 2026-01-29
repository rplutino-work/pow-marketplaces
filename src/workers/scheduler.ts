/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCHEDULER - Programador de tareas automáticas
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Ejecuta trabajos programados usando node-cron:
 * 
 * TAREAS PROGRAMADAS:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Tarea                    │ Frecuencia     │ Descripción                │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ Token Refresh            │ Cada hora      │ Renueva tokens próximos    │
 * │                          │                │ a expirar                  │
 * │ Health Check             │ Cada 3 min     │ Verifica estado de         │
 * │                          │                │ marketplaces               │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * Al iniciar la aplicación, se ejecuta una renovación de tokens inmediata.
 */

import cron from 'node-cron';
import { refreshAllExpiredTokens } from './tokenRefresh';
import { runHealthChecks } from './healthCheck';
import { logger } from '../utils/logger';

// Estado del scheduler
let isInitialized = false;
let tokenRefreshTask: cron.ScheduledTask | null = null;
let healthCheckTask: cron.ScheduledTask | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES PRINCIPALES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Inicia todas las tareas programadas
 * 
 * IMPORTANTE: Al iniciar, ejecuta refresh de tokens para asegurar
 * que todos los tokens estén actualizados
 */
export async function startScheduler(): Promise<void> {
  if (isInitialized) {
    logger.warn('Scheduler ya está inicializado');
    return;
  }

  logger.info('⏰ Iniciando scheduler de tareas automáticas...');

  // ═══════════════════════════════════════════════════════════════════════
  // TAREA 1: RENOVACIÓN DE TOKENS (Cada hora)
  // ═══════════════════════════════════════════════════════════════════════
  tokenRefreshTask = cron.schedule('0 * * * *', async () => {
    logger.info('⏰ [CRON] Ejecutando renovación automática de tokens...');
    try {
      const result = await refreshAllExpiredTokens();
      logger.info(`⏰ [CRON] Token refresh completado:`, {
        checked: result.checked,
        refreshed: result.refreshed,
        failed: result.failed,
      });
    } catch (error: any) {
      logger.error('⏰ [CRON] Error en token refresh:', { error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // TAREA 2: HEALTH CHECKS (Cada 3 minutos)
  // ═══════════════════════════════════════════════════════════════════════
  healthCheckTask = cron.schedule('*/3 * * * *', async () => {
    logger.info('⏰ [CRON] Ejecutando health checks programados...');
    try {
      await runHealthChecks();
    } catch (error: any) {
      logger.error('⏰ [CRON] Error en health checks:', { error: error.message });
    }
  });

  isInitialized = true;
  logger.success('✅ Scheduler iniciado correctamente');
  logger.info('   📋 Token refresh: cada hora (0 * * * *)');
  logger.info('   📋 Health checks: cada 3 min (*/3 * * * *)');

  // ═══════════════════════════════════════════════════════════════════════
  // EJECUCIÓN INICIAL AL ARRANCAR
  // ═══════════════════════════════════════════════════════════════════════
  logger.info('🔄 Ejecutando refresh inicial de tokens al iniciar...');
  
  // Ejecutar en background para no bloquear el inicio
  setImmediate(async () => {
    try {
      const result = await refreshAllExpiredTokens();
      logger.success(`✅ Refresh inicial completado: ${result.refreshed} tokens renovados`);
    } catch (error: any) {
      logger.error('Error en refresh inicial:', { error: error.message });
    }
  });
}

/**
 * Detiene todas las tareas programadas
 */
export function stopScheduler(): void {
  if (tokenRefreshTask) {
    tokenRefreshTask.stop();
    tokenRefreshTask = null;
  }

  if (healthCheckTask) {
    healthCheckTask.stop();
    healthCheckTask = null;
  }

  isInitialized = false;
  logger.info('⏰ Scheduler detenido');
}

/**
 * Fuerza la ejecución de un trabajo específico
 */
export async function forceRun(taskName: 'token_refresh' | 'health_check'): Promise<any> {
  switch (taskName) {
    case 'token_refresh':
      logger.info('🔄 Forzando ejecución de token refresh...');
      return await refreshAllExpiredTokens();

    case 'health_check':
      logger.info('🔍 Forzando ejecución de health checks...');
      return await runHealthChecks();

    default:
      throw new Error(`Tarea desconocida: ${taskName}`);
  }
}

/**
 * Obtiene estadísticas del scheduler
 */
export function getSchedulerStats(): {
  initialized: boolean;
  tasks: { name: string; cron: string; running: boolean }[];
} {
  return {
    initialized: isInitialized,
    tasks: [
      { name: 'token_refresh', cron: '0 * * * *', running: tokenRefreshTask !== null },
      { name: 'health_check', cron: '*/3 * * * *', running: healthCheckTask !== null },
    ],
  };
}

export default {
  startScheduler,
  stopScheduler,
  forceRun,
  getSchedulerStats,
};
