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
/**
 * Inicia todas las tareas programadas
 *
 * IMPORTANTE: Al iniciar, ejecuta refresh de tokens para asegurar
 * que todos los tokens estén actualizados
 */
export declare function startScheduler(): Promise<void>;
/**
 * Detiene todas las tareas programadas
 */
export declare function stopScheduler(): void;
/**
 * Fuerza la ejecución de un trabajo específico
 */
export declare function forceRun(taskName: 'token_refresh' | 'health_check'): Promise<any>;
/**
 * Obtiene estadísticas del scheduler
 */
export declare function getSchedulerStats(): {
    initialized: boolean;
    tasks: {
        name: string;
        cron: string;
        running: boolean;
    }[];
};
declare const _default: {
    startScheduler: typeof startScheduler;
    stopScheduler: typeof stopScheduler;
    forceRun: typeof forceRun;
    getSchedulerStats: typeof getSchedulerStats;
};
export default _default;
//# sourceMappingURL=scheduler.d.ts.map