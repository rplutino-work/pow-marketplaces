"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshAllExpiredTokens = refreshAllExpiredTokens;
const database_1 = require("../config/database");
const encryption_1 = require("../services/encryption");
const meliService = __importStar(require("../services/mercadolibre"));
const logger_1 = require("../utils/logger");
// Configuración
const CENTRAL_APP_ID = process.env.MELI_CENTRAL_APP_ID;
const CENTRAL_APP_SECRET = process.env.MELI_CENTRAL_APP_SECRET;
// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES PRINCIPALES
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Renueva todos los tokens que están por expirar o ya expiraron
 *
 * @returns Resultado del proceso de renovación
 */
async function refreshAllExpiredTokens() {
    const result = {
        checked: 0,
        refreshed: 0,
        failed: 0,
        errors: [],
    };
    if (!CENTRAL_APP_ID || !CENTRAL_APP_SECRET) {
        logger_1.logger.warn('Credenciales centrales no configuradas, saltando refresh');
        return result;
    }
    try {
        const prisma = (0, database_1.getPrisma)();
        // Buscar tokens que expiran en la próxima hora
        const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
        const credentials = await prisma.integrationCredential.findMany({
            where: {
                OR: [
                    { expires_at: { lte: oneHourFromNow } }, // Expiran pronto
                    { expires_at: null }, // Sin fecha de expiración
                ],
                refresh_token: { not: null }, // Tienen refresh token
                integration: {
                    estado: 'active',
                },
            },
            include: {
                integration: {
                    include: { marketplace: true },
                },
            },
        });
        logger_1.logger.info(`🔄 Verificando ${credentials.length} tokens próximos a expirar...`);
        result.checked = credentials.length;
        // Renovar cada token
        for (const credential of credentials) {
            try {
                await refreshSingleToken(credential);
                result.refreshed++;
            }
            catch (error) {
                result.failed++;
                result.errors.push(`${credential.integration.id}: ${error.message}`);
                logger_1.logger.error(`Error renovando token ${credential.id}:`, { error: error.message });
            }
        }
        logger_1.logger.info(`✅ Refresh completado: ${result.refreshed} renovados, ${result.failed} fallidos`);
    }
    catch (error) {
        logger_1.logger.error('Error en proceso de refresh:', { error: error.message });
        result.errors.push(`Error general: ${error.message}`);
    }
    return result;
}
/**
 * Renueva un token individual
 */
async function refreshSingleToken(credential) {
    const integration = credential.integration;
    logger_1.logger.info(`🔄 Renovando token para integración ${integration.id} (${integration.cliente_name || 'N/A'})`);
    // Desencriptar refresh token
    let refreshToken = null;
    if (credential.refresh_token) {
        try {
            const decrypted = (0, encryption_1.decrypt)(credential.refresh_token);
            refreshToken = typeof decrypted === 'string' ? decrypted : decrypted?.refresh_token;
        }
        catch {
            // Puede estar sin encriptar
            refreshToken = credential.refresh_token;
        }
    }
    if (!refreshToken) {
        throw new Error('Refresh token no disponible');
    }
    // Renovar tokens usando la función correcta
    const tokens = await meliService.refreshAccessToken(CENTRAL_APP_ID, CENTRAL_APP_SECRET, refreshToken);
    // Calcular nueva expiración
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    // Actualizar credenciales
    const prisma = (0, database_1.getPrisma)();
    await prisma.integrationCredential.update({
        where: { id: credential.id },
        data: {
            credentials_encrypted: (0, encryption_1.encrypt)({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_at: expiresAt.toISOString(),
                token_type: 'Bearer',
            }),
            access_token: (0, encryption_1.encrypt)(tokens.access_token),
            refresh_token: (0, encryption_1.encrypt)(tokens.refresh_token),
            user_id: String(tokens.user_id),
            expires_at: expiresAt,
            token_last_refreshed_at: new Date(),
            updated_at: new Date(),
        },
    });
    // Log de éxito
    await prisma.syncLog.create({
        data: {
            integration_id: integration.id,
            tipo: 'token_refresh',
            detalle: JSON.stringify({
                user_id: tokens.user_id,
                expires_at: expiresAt.toISOString(),
                timestamp: new Date().toISOString(),
            }),
            resultado: 'success',
        },
    });
    logger_1.logger.success(`Token renovado para ${integration.id}, expira: ${expiresAt.toISOString()}`);
}
exports.default = {
    refreshAllExpiredTokens,
};
//# sourceMappingURL=tokenRefresh.js.map