/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WEBHOOKS SERVICE - Procesamiento de webhooks de marketplaces
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Procesa los webhooks recibidos de diferentes marketplaces:
 *
 * TIPOS DE WEBHOOKS (MercadoLibre):
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Topic          │ Descripción                       │ Acción            │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ orders_v2      │ Nueva orden o cambio de estado    │ Procesar orden    │
 * │ items          │ Cambio en publicación             │ Actualizar item   │
 * │ questions      │ Nueva pregunta                    │ Notificar         │
 * │ messages       │ Nuevo mensaje                     │ Notificar         │
 * │ shipments      │ Actualización de envío            │ Actualizar estado │
 * │ payments       │ Actualización de pago             │ Actualizar orden  │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import type { WebhookPayload } from '../types';
/**
 * Procesa un webhook de MercadoLibre
 *
 * @param payload - Payload del webhook
 * @returns Resultado del procesamiento
 */
export declare function processMercadoLibreWebhook(payload: WebhookPayload): Promise<{
    success: boolean;
    action: string;
    details?: any;
}>;
/**
 * Valida que un webhook sea legítimo de MercadoLibre
 *
 * TODO: Implementar validación de firma cuando MercadoLibre lo soporte
 */
export declare function validateWebhookSignature(payload: any, signature?: string): boolean;
/**
 * Obtiene estadísticas de webhooks procesados
 */
export declare function getWebhookStats(integrationId?: string): Promise<{
    total: number;
    by_type: Record<string, number>;
    last_24h: number;
}>;
declare const _default: {
    processMercadoLibreWebhook: typeof processMercadoLibreWebhook;
    validateWebhookSignature: typeof validateWebhookSignature;
    getWebhookStats: typeof getWebhookStats;
};
export default _default;
//# sourceMappingURL=webhooks.d.ts.map