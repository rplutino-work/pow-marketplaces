/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ORDERS SERVICE - Gestión de Órdenes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Procesa órdenes desde MercadoLibre, aplica reglas y envía a Hermes.
 * Usa schema de producción con campos: source_order_id, flag_reason, etc.
 */
interface OrderFilter {
    integration_id?: string;
    status?: string;
    from_date?: Date;
    to_date?: Date;
    limit?: number;
    offset?: number;
}
export declare function processOrderFromWebhook(integrationId: string, orderId: string): Promise<{
    success: boolean;
    blocked: boolean;
    reason: string | undefined;
    hermes_order_id?: undefined;
} | {
    success: boolean;
    hermes_order_id: string;
    blocked?: undefined;
    reason?: undefined;
} | {
    success: boolean;
    hermes_order_id: null;
    blocked?: undefined;
    reason?: undefined;
}>;
export declare function retryOrder(orderId: string): Promise<{
    success: boolean;
    blocked: boolean;
    reason: string | undefined;
    hermes_order_id?: undefined;
} | {
    success: boolean;
    hermes_order_id: string;
    blocked?: undefined;
    reason?: undefined;
} | {
    success: boolean;
    hermes_order_id: null;
    blocked?: undefined;
    reason?: undefined;
}>;
export declare function getOrders(filter?: OrderFilter): Promise<{
    id: string;
    source_order_id: string;
    status: string;
    flag_reason: string | null;
    hermes_order_id: string | null;
    retry_count: number;
    last_error: string | null;
    created_at: Date;
    processed_at: Date | null;
    integration: {
        id: string;
        hermes_integration_id: string;
        cliente_name: string | null;
        marketplace: string;
    };
}[]>;
export declare function getOrderById(orderId: string): Promise<{
    payload: any;
    logs: {
        id: string;
        tipo: string;
        detalle: any;
        resultado: string;
        created_at: Date;
    }[];
    integration: {
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
    };
    id: string;
    created_at: Date;
    updated_at: Date;
    status: string;
    marketplace_id: string;
    integration_id: string;
    source_order_id: string;
    payload_normalized: string;
    flag_reason: string | null;
    hermes_order_id: string | null;
    retry_count: number;
    last_error: string | null;
    processed_at: Date | null;
} | null>;
export declare function getOrderStats(integrationId?: string): Promise<{
    total: number;
    by_status: Record<string, number>;
    last_24h: number;
}>;
export declare function getBlockedOrdersSummary(integrationId?: string): Promise<{
    total: number;
    by_reason: Record<string, number>;
    orders: {
        integration: {
            id: string;
            cliente_name: string | null;
        };
        id: string;
        created_at: Date;
        source_order_id: string;
        flag_reason: string | null;
    }[];
}>;
export declare function bulkRetryBlockedOrders(integrationId: string): Promise<{
    total: number;
    success: number;
    failed: number;
    errors: string[];
}>;
declare const _default: {
    processOrderFromWebhook: typeof processOrderFromWebhook;
    retryOrder: typeof retryOrder;
    getOrders: typeof getOrders;
    getOrderById: typeof getOrderById;
    getOrderStats: typeof getOrderStats;
    getBlockedOrdersSummary: typeof getBlockedOrdersSummary;
    bulkRetryBlockedOrders: typeof bulkRetryBlockedOrders;
};
export default _default;
//# sourceMappingURL=orders.d.ts.map