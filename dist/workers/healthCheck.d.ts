/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HEALTH CHECK WORKER - Verificación de Salud de Marketplaces
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ejecuta verificaciones periódicas de conectividad con las APIs
 * de los marketplaces integrados.
 */
export declare function runHealthChecks(): Promise<void>;
export declare function checkHermesInstances(): Promise<void>;
declare const _default: {
    runHealthChecks: typeof runHealthChecks;
    checkHermesInstances: typeof checkHermesInstances;
};
export default _default;
//# sourceMappingURL=healthCheck.d.ts.map