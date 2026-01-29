/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTEGRATIONS SERVICE - Gestión de Integraciones
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CRUD y gestión de integraciones de marketplace.
 * Usa schema de producción con campos: ajustes_default, estado, etc.
 */
export declare function getIntegrations(filter?: {
    marketplace_id?: string;
    estado?: string;
    cliente_domain?: string;
}): Promise<{
    id: string;
    hermes_integration_id: string;
    cliente_name: string | null;
    cliente_domain: string;
    marketplace_id: string;
    marketplace_name: string;
    estado: string;
    hermes_api_url: string | null;
    hermes_enabled: boolean;
    token_status: string;
    user_id: string | null;
    created_at: Date;
    updated_at: Date;
}[]>;
export declare function getIntegrationById(integrationId: string): Promise<{
    id: string;
    hermes_integration_id: string;
    cliente_name: string | null;
    cliente_domain: string;
    marketplace_id: string;
    marketplace_name: string;
    estado: string;
    hermes_api_url: string | null;
    hermes_token: string | null;
    hermes_enabled: boolean;
    ajustes_default: any;
    token_info: {
        has_token: boolean;
        user_id: string | null;
        expires_at: string | null;
        last_refresh: string | null;
        is_valid: boolean;
    } | null;
    rules: {
        id: string;
        rule_key: string;
        rule_type: string;
        config: {};
        enabled: boolean;
        priority: number;
    }[];
    created_at: Date;
    updated_at: Date;
} | null>;
export declare function getIntegrationByHermesId(hermesIntegrationId: string, clienteDomain: string): Promise<({
    marketplace: {
        id: string;
        name: string;
        health_status: string;
        last_health_check_at: Date | null;
        response_time_ms: number | null;
        created_at: Date;
        updated_at: Date;
    };
    credentials: {
        id: string;
        created_at: Date;
        updated_at: Date;
        refresh_token: string | null;
        integration_id: string;
        credentials_encrypted: string;
        access_token: string | null;
        user_id: string | null;
        expires_at: Date | null;
        token_last_refreshed_at: Date | null;
        oauth_state: string | null;
    }[];
} & {
    id: string;
    created_at: Date;
    updated_at: Date;
    hermes_integration_id: string;
    cliente_name: string | null;
    cliente_domain: string;
    marketplace_id: string;
    estado: string;
    ajustes_default: string | null;
    hermes_api_url: string | null;
    hermes_token: string | null;
    hermes_enabled: boolean;
}) | null>;
export declare function resolveIntegration(params: {
    hermes_integration_id: string;
    hermes_api_url: string;
}): Promise<({
    marketplace: {
        id: string;
        name: string;
        health_status: string;
        last_health_check_at: Date | null;
        response_time_ms: number | null;
        created_at: Date;
        updated_at: Date;
    };
    credentials: {
        id: string;
        created_at: Date;
        updated_at: Date;
        refresh_token: string | null;
        integration_id: string;
        credentials_encrypted: string;
        access_token: string | null;
        user_id: string | null;
        expires_at: Date | null;
        token_last_refreshed_at: Date | null;
        oauth_state: string | null;
    }[];
} & {
    id: string;
    created_at: Date;
    updated_at: Date;
    hermes_integration_id: string;
    cliente_name: string | null;
    cliente_domain: string;
    marketplace_id: string;
    estado: string;
    ajustes_default: string | null;
    hermes_api_url: string | null;
    hermes_token: string | null;
    hermes_enabled: boolean;
}) | null>;
export declare function createIntegration(data: {
    hermes_integration_id: string;
    marketplace_id: string;
    cliente_name?: string;
    cliente_domain: string;
    hermes_api_url?: string;
    hermes_token?: string;
    ajustes_default?: any;
}): Promise<{
    marketplace: {
        id: string;
        name: string;
        health_status: string;
        last_health_check_at: Date | null;
        response_time_ms: number | null;
        created_at: Date;
        updated_at: Date;
    };
} & {
    id: string;
    created_at: Date;
    updated_at: Date;
    hermes_integration_id: string;
    cliente_name: string | null;
    cliente_domain: string;
    marketplace_id: string;
    estado: string;
    ajustes_default: string | null;
    hermes_api_url: string | null;
    hermes_token: string | null;
    hermes_enabled: boolean;
}>;
export declare function updateIntegration(integrationId: string, data: {
    cliente_name?: string;
    estado?: string;
    hermes_api_url?: string;
    hermes_token?: string;
    hermes_enabled?: boolean;
    ajustes_default?: any;
}): Promise<{
    marketplace: {
        id: string;
        name: string;
        health_status: string;
        last_health_check_at: Date | null;
        response_time_ms: number | null;
        created_at: Date;
        updated_at: Date;
    };
} & {
    id: string;
    created_at: Date;
    updated_at: Date;
    hermes_integration_id: string;
    cliente_name: string | null;
    cliente_domain: string;
    marketplace_id: string;
    estado: string;
    ajustes_default: string | null;
    hermes_api_url: string | null;
    hermes_token: string | null;
    hermes_enabled: boolean;
}>;
export declare function deleteIntegration(integrationId: string): Promise<void>;
export declare function syncCredentialsFromHermes(data: {
    hermes_integration_id: string;
    marketplace_name: string;
    cliente_domain: string;
    hermes_api_url: string;
    hermes_token?: string;
    client_id?: string;
    client_secret?: string;
}): Promise<{
    integration_id: string;
    hermes_integration_id: string;
    status: string;
}>;
export declare function getAccessToken(integrationId: string): Promise<string | null>;
export declare function getIntegrationStats(integrationId: string): Promise<{
    orders: {
        total: number;
        by_status: Record<string, number>;
    };
    recent_activity: {
        tipo: string;
        resultado: string;
        created_at: Date;
    }[];
}>;
export declare function getIntegrationHealth(integrationId: string): Promise<{
    status: string;
    checks?: undefined;
    marketplace_health?: undefined;
} | {
    status: string;
    checks: {
        integration_active: boolean;
        hermes_configured: boolean;
        credentials_present: boolean;
        token_valid: boolean;
    };
    marketplace_health: string;
}>;
declare const _default: {
    getIntegrations: typeof getIntegrations;
    getIntegrationById: typeof getIntegrationById;
    getIntegrationByHermesId: typeof getIntegrationByHermesId;
    resolveIntegration: typeof resolveIntegration;
    createIntegration: typeof createIntegration;
    updateIntegration: typeof updateIntegration;
    deleteIntegration: typeof deleteIntegration;
    syncCredentialsFromHermes: typeof syncCredentialsFromHermes;
    getAccessToken: typeof getAccessToken;
    getIntegrationStats: typeof getIntegrationStats;
    getIntegrationHealth: typeof getIntegrationHealth;
};
export default _default;
//# sourceMappingURL=integrations.d.ts.map