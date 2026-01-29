/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MERCADOLIBRE SERVICE - Interacción con API de MercadoLibre
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Centraliza todas las llamadas a la API de MercadoLibre.
 */
interface TokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id: number;
    scope?: string;
}
interface OrdersResponse {
    results: any[];
    paging: {
        total: number;
        offset: number;
        limit: number;
    };
}
export declare function exchangeCodeForTokens(clientId: string, clientSecret: string, code: string, redirectUri: string, codeVerifier?: string): Promise<TokenResponse>;
export declare function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<TokenResponse>;
export declare function getOrder(orderId: string, accessToken: string): Promise<any>;
export declare function getOrders(userId: string, accessToken: string, params?: {
    status?: string;
    offset?: number;
    limit?: number;
}): Promise<OrdersResponse>;
export declare function getItem(itemId: string, accessToken: string): Promise<any>;
export declare function createItem(item: any, accessToken: string): Promise<any>;
export declare function updateItem(itemId: string, data: any, accessToken: string): Promise<any>;
export declare function updateVariation(itemId: string, variationId: string, data: any, accessToken: string): Promise<any>;
export declare function findItemBySku(userId: string, sku: string, accessToken: string): Promise<any | null>;
export declare function getActiveItems(userId: string, accessToken: string): Promise<any[]>;
export declare function getUser(accessToken: string): Promise<any>;
export declare function getUserById(userId: string, accessToken: string): Promise<any>;
export declare function getCategory(categoryId: string): Promise<any>;
export declare function getCategoryAttributes(categoryId: string): Promise<any[]>;
export declare function getShipment(shipmentId: string, accessToken: string): Promise<any>;
export declare function getNotificationResource(resourcePath: string, accessToken: string): Promise<any>;
declare const _default: {
    exchangeCodeForTokens: typeof exchangeCodeForTokens;
    refreshAccessToken: typeof refreshAccessToken;
    getOrder: typeof getOrder;
    getOrders: typeof getOrders;
    getItem: typeof getItem;
    createItem: typeof createItem;
    updateItem: typeof updateItem;
    updateVariation: typeof updateVariation;
    findItemBySku: typeof findItemBySku;
    getActiveItems: typeof getActiveItems;
    getUser: typeof getUser;
    getUserById: typeof getUserById;
    getCategory: typeof getCategory;
    getCategoryAttributes: typeof getCategoryAttributes;
    getShipment: typeof getShipment;
    getNotificationResource: typeof getNotificationResource;
};
export default _default;
//# sourceMappingURL=mercadolibre.d.ts.map