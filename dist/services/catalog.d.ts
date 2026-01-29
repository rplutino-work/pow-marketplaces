/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CATALOG SERVICE - Sincronización de Catálogo
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gestiona la sincronización bidireccional de productos entre Hermes y ML.
 */
interface HermesProduct {
    id: number | string;
    identifier: string;
    name: string;
    description?: string;
    price: number;
    stock: number;
    category_id?: string;
    brand?: string;
    pictures?: Array<{
        url: string;
    }>;
    variations?: Array<{
        id: string;
        identifier: string;
        attributes: Record<string, string>;
        price: number;
        stock: number;
    }>;
    dimensions?: {
        width: number;
        height: number;
        length: number;
        weight: number;
    };
}
interface SyncResult {
    success: number;
    failed: number;
    created: number;
    updated: number;
    closed: number;
    errors: Array<{
        sku: string;
        error: string;
    }>;
}
export declare function syncCatalog(params: {
    integration_id: string;
    products: HermesProduct[];
    options?: {
        close_missing?: boolean;
        update_only?: boolean;
    };
}): Promise<SyncResult>;
declare const _default: {
    syncCatalog: typeof syncCatalog;
};
export default _default;
//# sourceMappingURL=catalog.d.ts.map