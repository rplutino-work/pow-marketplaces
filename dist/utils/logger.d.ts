/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOGGER - Sistema de logging centralizado
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Logger simple y claro para el microservicio.
 * Usa colores en desarrollo y JSON en producción.
 */
/**
 * Logger centralizado
 */
export declare const logger: {
    /**
     * Log de información general
     */
    info(message: string, data?: any): void;
    /**
     * Log de advertencia
     */
    warn(message: string, data?: any): void;
    /**
     * Log de error
     */
    error(message: string, data?: any): void;
    /**
     * Log de debug (solo en desarrollo)
     */
    debug(message: string, data?: any): void;
    /**
     * Log de éxito
     */
    success(message: string, data?: any): void;
};
export default logger;
//# sourceMappingURL=logger.d.ts.map