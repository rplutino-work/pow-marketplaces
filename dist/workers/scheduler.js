"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
exports.stopScheduler = stopScheduler;
exports.forceRun = forceRun;
exports.getSchedulerStats = getSchedulerStats;
const node_cron_1 = __importDefault(require("node-cron"));
const tokenRefresh_1 = require("./tokenRefresh");
const healthCheck_1 = require("./healthCheck");
const logger_1 = require("../utils/logger");
// Estado del scheduler
let isInitialized = false;
let tokenRefreshTask = null;
let healthCheckTask = null;
// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES PRINCIPALES
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Inicia todas las tareas programadas
 *
 * IMPORTANTE: Al iniciar, ejecuta refresh de tokens para asegurar
 * que todos los tokens estén actualizados
 */
async function startScheduler() {
    if (isInitialized) {
        logger_1.logger.warn('Scheduler ya está inicializado');
        return;
    }
    logger_1.logger.info('⏰ Iniciando scheduler de tareas automáticas...');
    // ═══════════════════════════════════════════════════════════════════════
    // TAREA 1: RENOVACIÓN DE TOKENS (Cada hora)
    // ═══════════════════════════════════════════════════════════════════════
    tokenRefreshTask = node_cron_1.default.schedule('0 * * * *', async () => {
        logger_1.logger.info('⏰ [CRON] Ejecutando renovación automática de tokens...');
        try {
            const result = await (0, tokenRefresh_1.refreshAllExpiredTokens)();
            logger_1.logger.info(`⏰ [CRON] Token refresh completado:`, {
                checked: result.checked,
                refreshed: result.refreshed,
                failed: result.failed,
            });
        }
        catch (error) {
            logger_1.logger.error('⏰ [CRON] Error en token refresh:', { error: error.message });
        }
    });
    // ═══════════════════════════════════════════════════════════════════════
    // TAREA 2: HEALTH CHECKS (Cada 3 minutos)
    // ═══════════════════════════════════════════════════════════════════════
    healthCheckTask = node_cron_1.default.schedule('*/3 * * * *', async () => {
        logger_1.logger.info('⏰ [CRON] Ejecutando health checks programados...');
        try {
            await (0, healthCheck_1.runHealthChecks)();
        }
        catch (error) {
            logger_1.logger.error('⏰ [CRON] Error en health checks:', { error: error.message });
        }
    });
    isInitialized = true;
    logger_1.logger.success('✅ Scheduler iniciado correctamente');
    logger_1.logger.info('   📋 Token refresh: cada hora (0 * * * *)');
    logger_1.logger.info('   📋 Health checks: cada 3 min (*/3 * * * *)');
    // ═══════════════════════════════════════════════════════════════════════
    // EJECUCIÓN INICIAL AL ARRANCAR
    // ═══════════════════════════════════════════════════════════════════════
    logger_1.logger.info('🔄 Ejecutando refresh inicial de tokens al iniciar...');
    // Ejecutar en background para no bloquear el inicio
    setImmediate(async () => {
        try {
            const result = await (0, tokenRefresh_1.refreshAllExpiredTokens)();
            logger_1.logger.success(`✅ Refresh inicial completado: ${result.refreshed} tokens renovados`);
        }
        catch (error) {
            logger_1.logger.error('Error en refresh inicial:', { error: error.message });
        }
    });
}
/**
 * Detiene todas las tareas programadas
 */
function stopScheduler() {
    if (tokenRefreshTask) {
        tokenRefreshTask.stop();
        tokenRefreshTask = null;
    }
    if (healthCheckTask) {
        healthCheckTask.stop();
        healthCheckTask = null;
    }
    isInitialized = false;
    logger_1.logger.info('⏰ Scheduler detenido');
}
/**
 * Fuerza la ejecución de un trabajo específico
 */
async function forceRun(taskName) {
    switch (taskName) {
        case 'token_refresh':
            logger_1.logger.info('🔄 Forzando ejecución de token refresh...');
            return await (0, tokenRefresh_1.refreshAllExpiredTokens)();
        case 'health_check':
            logger_1.logger.info('🔍 Forzando ejecución de health checks...');
            return await (0, healthCheck_1.runHealthChecks)();
        default:
            throw new Error(`Tarea desconocida: ${taskName}`);
    }
}
/**
 * Obtiene estadísticas del scheduler
 */
function getSchedulerStats() {
    return {
        initialized: isInitialized,
        tasks: [
            { name: 'token_refresh', cron: '0 * * * *', running: tokenRefreshTask !== null },
            { name: 'health_check', cron: '*/3 * * * *', running: healthCheckTask !== null },
        ],
    };
}
exports.default = {
    startScheduler,
    stopScheduler,
    forceRun,
    getSchedulerStats,
};
//# sourceMappingURL=scheduler.js.map