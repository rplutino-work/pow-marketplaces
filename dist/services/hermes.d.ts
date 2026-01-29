/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HERMES SERVICE - Comunicación con Hermes OMS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Maneja la comunicación con las instancias de Hermes de los clientes.
 */
interface SendOrderResponse {
    order_id: string;
    status: string;
}
interface ProductsResponse {
    products: any[];
    total: number;
}
export declare function sendOrder(hermesUrl: string, token: string, order: any): Promise<SendOrderResponse>;
export declare function getOrderStatus(hermesUrl: string, token: string, orderId: string): Promise<any>;
export declare function getProducts(hermesUrl: string, token: string, params?: {
    page?: number;
    per_page?: number;
    updated_since?: string;
}): Promise<ProductsResponse>;
export declare function updateProductStatus(hermesUrl: string, token: string, productId: string, status: {
    marketplace_id?: string;
    status: string;
    error?: string;
}): Promise<void>;
export declare function notifyStockUpdate(hermesUrl: string, token: string, updates: Array<{
    sku: string;
    stock: number;
    marketplace_id?: string;
}>): Promise<void>;
export declare function notifyPriceUpdate(hermesUrl: string, token: string, updates: Array<{
    sku: string;
    price: number;
    marketplace_id?: string;
}>): Promise<void>;
export declare function checkHealth(hermesUrl: string): Promise<{
    healthy: boolean;
    responseTime: number;
}>;
export declare function notifyWebhookReceived(hermesUrl: string, token: string, webhook: {
    topic: string;
    resource: string;
    user_id: string;
    data?: any;
}): Promise<void>;
export declare function notifyOAuthSuccess(hermesUrl: string, integrationId: string, userId: string): Promise<void>;
declare const _default: {
    sendOrder: typeof sendOrder;
    getOrderStatus: typeof getOrderStatus;
    getProducts: typeof getProducts;
    updateProductStatus: typeof updateProductStatus;
    notifyStockUpdate: typeof notifyStockUpdate;
    notifyPriceUpdate: typeof notifyPriceUpdate;
    checkHealth: typeof checkHealth;
    notifyWebhookReceived: typeof notifyWebhookReceived;
    notifyOAuthSuccess: typeof notifyOAuthSuccess;
};
export default _default;
//# sourceMappingURL=hermes.d.ts.map