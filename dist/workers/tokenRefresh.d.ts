/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TOKEN REFRESH WORKER - Renovación automática de tokens
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ejecuta cada hora para renovar tokens de MercadoLibre:
 * - Busca tokens que expiran en la próxima hora
 * - Los renueva usando refresh_token
 * - Notifica a Hermes el nuevo estado
 *
 * IMPORTANTE:
 * - MercadoLibre tokens expiran cada 6 horas
 * - El refresh_token expira cada 6 meses (requiere re-autorización manual)
 */
/**
 * Renueva todos los tokens que están por expirar o ya expiraron
 *
 * @returns Resultado del proceso de renovación
 */
export declare function refreshAllExpiredTokens(): Promise<{
    checked: number;
    refreshed: number;
    failed: number;
    errors: string[];
}>;
declare const _default: {
    refreshAllExpiredTokens: typeof refreshAllExpiredTokens;
};
export default _default;
//# sourceMappingURL=tokenRefresh.d.ts.map