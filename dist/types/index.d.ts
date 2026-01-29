/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TIPOS Y INTERFACES - Definiciones TypeScript del microservicio
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este archivo centraliza todos los tipos e interfaces usados en el proyecto.
 * Facilita la tipificación estricta y mejora la autocompletación en IDEs.
 */
/**
 * Respuesta API estándar
 */
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    timestamp?: string;
}
/**
 * Paginación
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
/**
 * Estado temporal del flujo OAuth
 */
export interface OAuthState {
    hermes_integration_id: string;
    hermes_url: string;
    cliente_domain: string;
    code_verifier: string;
    marketplace_code: string;
    created_at: Date;
}
/**
 * Tokens de MercadoLibre
 */
export interface MeliTokens {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    user_id: number;
}
/**
 * Credenciales encriptadas
 */
export interface EncryptedCredentials {
    access_token?: string;
    refresh_token?: string;
    expires_at?: string;
    token_type?: string;
    scope?: string;
    client_id?: string;
    client_secret?: string;
    user_id?: string;
    metadata?: any;
    updated_at?: string;
}
/**
 * Estado de una integración
 */
export type IntegrationStatus = 'active' | 'inactive' | 'pending' | 'error';
/**
 * Datos de integración con detalles
 */
export interface IntegrationDetails {
    id: string;
    hermes_integration_id: string;
    marketplace_code: string;
    cliente_name: string;
    cliente_domain: string;
    estado: IntegrationStatus;
    tokenStatus?: {
        valid: boolean;
        expiresAt: string | null;
        userId: string | null;
    };
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Payload genérico de webhook
 */
export interface WebhookPayload {
    _id?: string;
    topic: string;
    resource: string;
    user_id: number;
    application_id?: number;
    sent?: string;
    received?: string;
    attempts?: number;
    actions?: string[];
}
/**
 * Tipos de topic de MercadoLibre
 */
export type MeliWebhookTopic = 'orders_v2' | 'items' | 'questions' | 'messages' | 'shipments' | 'payments';
/**
 * Producto de Hermes para sincronizar
 */
export interface HermesProduct {
    id: string | number;
    name: string;
    sku: string;
    description?: string;
    price: number;
    stock: number;
    category_id?: string;
    brand?: string;
    model?: string;
    condition?: 'new' | 'used';
    pictures?: {
        url: string;
    }[];
    dimensions?: {
        width?: number;
        height?: number;
        length?: number;
        weight?: number;
    };
    variations?: HermesVariation[];
    attributes?: {
        id: string;
        value_name: string;
    }[];
}
/**
 * Variación de producto
 */
export interface HermesVariation {
    id?: string | number;
    sku: string;
    price: number;
    stock: number;
    color?: string;
    size?: string;
    attributes?: {
        id: string;
        value_name: string;
    }[];
}
/**
 * Datos de instancia Hermes para sincronización
 */
export interface HermesInstanceInfo {
    api_url: string;
    api_token?: string;
    integration_id: string;
}
/**
 * Resultado de sincronización de catálogo
 */
export interface CatalogSyncResult {
    integration_id: string;
    total_products: number;
    successful: number;
    failed: number;
    created: number;
    updated: number;
    closed: number;
    errors: {
        sku: string;
        error: string;
    }[];
    sync_date: string;
}
/**
 * Estados de orden en el microservicio
 */
export type OrderStatus = 'pending' | 'processing' | 'sent_to_hermes' | 'blocked' | 'failed' | 'completed';
/**
 * Orden de MercadoLibre
 */
export interface MeliOrder {
    id: number;
    status: string;
    status_detail?: any;
    date_created: string;
    date_closed?: string;
    buyer: {
        id: number;
        nickname: string;
        first_name?: string;
        last_name?: string;
        email?: string;
        phone?: {
            number: string;
        };
    };
    order_items: {
        item: {
            id: string;
            title: string;
            seller_custom_field?: string;
            variation_id?: number;
        };
        quantity: number;
        unit_price: number;
    }[];
    shipping?: {
        id: number;
        receiver_address?: {
            street_name?: string;
            street_number?: string;
            city?: {
                name: string;
            };
            state?: {
                name: string;
            };
            zip_code?: string;
        };
    };
    payments: {
        id: number;
        status: string;
        transaction_amount: number;
        payment_method_id?: string;
    }[];
    total_amount: number;
    currency_id: string;
}
/**
 * Orden transformada para Hermes
 */
export interface HermesOrderPayload {
    external_id: string;
    source: string;
    customer: {
        external_id: string;
        name: string;
        email?: string;
        phone?: string;
    };
    items: {
        sku: string;
        quantity: number;
        unit_price: number;
        title: string;
        meli_item_id?: string;
        meli_variation_id?: number;
    }[];
    shipping?: {
        address: string;
        city: string;
        state: string;
        zip_code: string;
    };
    payment: {
        method: string;
        status: string;
        amount: number;
    };
    total_amount: number;
    currency: string;
    notes?: string;
    metadata?: any;
}
/**
 * Tipo de regla
 */
export type RuleType = 'price_adjustment' | 'stock_filter' | 'category_mapping' | 'sku_transform' | 'block_order' | 'custom';
/**
 * Definición de regla
 */
export interface BusinessRule {
    id: string;
    integration_id: string;
    name: string;
    type: RuleType;
    priority: number;
    is_active: boolean;
    conditions: RuleCondition[];
    actions: RuleAction[];
    metadata?: any;
}
/**
 * Condición de regla
 */
export interface RuleCondition {
    field: string;
    operator: 'equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'regex';
    value: any;
}
/**
 * Acción de regla
 */
export interface RuleAction {
    type: string;
    params: Record<string, any>;
}
/**
 * Resultado de evaluación de reglas
 */
export interface RuleEvaluationResult {
    matched_rules: string[];
    should_block: boolean;
    block_reason?: string;
    transformations: {
        field: string;
        from: any;
        to: any;
    }[];
}
/**
 * Producto de MercadoLibre
 */
export interface MeliProduct {
    id: string;
    title: string;
    category_id: string;
    price: number;
    currency_id: string;
    available_quantity: number;
    buying_mode: string;
    listing_type_id: string;
    condition: string;
    description?: {
        plain_text: string;
    };
    seller_custom_field?: string;
    pictures?: {
        id?: string;
        source?: string;
        url?: string;
    }[];
    attributes?: {
        id: string;
        value_name: string;
    }[];
    shipping?: {
        mode?: string;
        free_shipping?: boolean;
        dimensions?: string;
    };
    variations?: MeliVariation[];
    status: string;
}
/**
 * Variación de MercadoLibre
 */
export interface MeliVariation {
    id: number;
    price: number;
    available_quantity: number;
    seller_custom_field?: string;
    attribute_combinations?: {
        id: string;
        name: string;
        value_id: string;
        value_name: string;
    }[];
    picture_ids?: string[];
}
/**
 * Resultado de refresh de tokens
 */
export interface TokenRefreshResult {
    checked: number;
    refreshed: number;
    failed: number;
    errors: string[];
}
/**
 * Resultado de health check
 */
export interface HealthCheckResult {
    marketplace: string;
    healthy: boolean;
    responseTimeMs: number;
    error?: string;
}
declare global {
    namespace Express {
        interface Request {
            integration?: any;
            marketplace?: any;
        }
    }
}
//# sourceMappingURL=index.d.ts.map