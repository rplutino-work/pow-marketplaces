/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OAUTH SERVICE - Autenticación con MercadoLibre
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implementa flujo OAuth 2.0 con PKCE usando schema de producción.
 */
export declare function initiateOAuth(params: {
    hermes_integration_id: string;
    hermes_url: string;
    cliente_domain: string;
}): Promise<string>;
export declare function handleCallback(authCode: string, state: string): Promise<{
    success: boolean;
    integration_id: string;
    hermes_url: string;
    hermes_integration_id: string;
    user_id?: string;
    error?: string;
}>;
export declare function getTokenStatus(integrationId: string): Promise<{
    has_token: boolean;
    valid: boolean;
    expires_at: string | null;
    user_id: string | null;
    last_refresh: string | null;
}>;
export declare function revokeCredentials(integrationId: string): Promise<void>;
declare const _default: {
    initiateOAuth: typeof initiateOAuth;
    handleCallback: typeof handleCallback;
    getTokenStatus: typeof getTokenStatus;
    revokeCredentials: typeof revokeCredentials;
};
export default _default;
//# sourceMappingURL=oauth.d.ts.map