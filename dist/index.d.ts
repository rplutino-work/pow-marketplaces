/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POW MARKETPLACES - MICROSERVICIO EXPRESS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Microservicio de integración de marketplaces para POW/Hermes.
 * Reescrito en Express puro desde NestJS para mayor claridad y control.
 *
 * ARQUITECTURA:
 * - Express para HTTP routing
 * - Prisma para base de datos PostgreSQL
 * - Workers con node-cron para tareas programadas
 *
 * MÓDULOS PRINCIPALES:
 * - OAuth: Autenticación con MercadoLibre (PKCE flow)
 * - Webhooks: Recepción de notificaciones de marketplaces
 * - Catálogo: Sincronización bidireccional de productos
 * - Órdenes: Procesamiento y envío a Hermes
 * - Reglas: Motor de reglas de negocio
 *
 * @author POW Team
 * @version 2.0.0
 */
import 'dotenv/config';
declare const app: import("express-serve-static-core").Express;
export default app;
//# sourceMappingURL=index.d.ts.map