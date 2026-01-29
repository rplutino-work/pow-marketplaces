"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OAUTH SERVICE - Autenticación con MercadoLibre
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implementa flujo OAuth 2.0 con PKCE usando schema de producción.
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
exports.initiateOAuth = initiateOAuth;
exports.handleCallback = handleCallback;
exports.getTokenStatus = getTokenStatus;
exports.revokeCredentials = revokeCredentials;
const crypto_1 = require("crypto");
const database_1 = require("../config/database");
const encryption_1 = require("../services/encryption");
const meliService = __importStar(require("../services/mercadolibre"));
const logger_1 = require("../utils/logger");
// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════
const APP_URL = process.env.APP_URL || 'https://pow-marketplaces.onrender.com';
const MELI_AUTH_URL = 'https://auth.mercadolibre.com.ar/authorization';
const CENTRAL_APP_ID = process.env.MELI_CENTRAL_APP_ID;
const CENTRAL_APP_SECRET = process.env.MELI_CENTRAL_APP_SECRET;
const CALLBACK_PATH = '/api/v1/oauth/auth/callback';
// Almacén temporal de estados OAuth
const oauthStates = new Map();
// Limpiar estados viejos cada 10 minutos
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of oauthStates.entries()) {
        if (now - value.created_at.getTime() > 10 * 60 * 1000) {
            oauthStates.delete(key);
        }
    }
}, 10 * 60 * 1000);
// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES PRINCIPALES
// ═══════════════════════════════════════════════════════════════════════════
async function initiateOAuth(params) {
    const prisma = (0, database_1.getPrisma)();
    if (!CENTRAL_APP_ID || !CENTRAL_APP_SECRET) {
        throw new Error('Credenciales de aplicación central no configuradas');
    }
    logger_1.logger.info(`🔐 Iniciando OAuth para integración Hermes: ${params.hermes_integration_id}`);
    // Buscar marketplace (usando 'name', no 'code')
    let marketplace = await prisma.marketplace.findUnique({
        where: { name: 'mercadolibre' },
    });
    if (!marketplace) {
        marketplace = await prisma.marketplace.create({
            data: {
                name: 'mercadolibre',
                health_status: 'healthy',
            },
        });
    }
    // Buscar o crear integración
    let integration = await prisma.integration.findFirst({
        where: {
            hermes_integration_id: params.hermes_integration_id,
            cliente_domain: params.cliente_domain,
        },
    });
    if (!integration) {
        integration = await prisma.integration.create({
            data: {
                hermes_integration_id: params.hermes_integration_id,
                marketplace_id: marketplace.id,
                cliente_domain: params.cliente_domain,
                hermes_api_url: params.hermes_url,
                estado: 'pending',
            },
        });
        logger_1.logger.info(`Nueva integración creada: ${integration.id}`);
    }
    else {
        await prisma.integration.update({
            where: { id: integration.id },
            data: { hermes_api_url: params.hermes_url, updated_at: new Date() },
        });
    }
    // Generar PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();
    // Guardar estado
    oauthStates.set(state, {
        hermes_integration_id: params.hermes_integration_id,
        hermes_url: params.hermes_url,
        cliente_domain: params.cliente_domain,
        code_verifier: codeVerifier,
        marketplace_name: 'mercadolibre',
        created_at: new Date(),
    });
    // Guardar state en credenciales
    const existingCred = await prisma.integrationCredential.findFirst({
        where: { integration_id: integration.id },
    });
    if (existingCred) {
        await prisma.integrationCredential.update({
            where: { id: existingCred.id },
            data: { oauth_state: state, updated_at: new Date() },
        });
    }
    else {
        await prisma.integrationCredential.create({
            data: {
                integration_id: integration.id,
                credentials_encrypted: '{}',
                oauth_state: state,
            },
        });
    }
    // Construir URL de autorización
    const redirectUri = `${APP_URL}${CALLBACK_PATH}`;
    const authUrl = new URL(MELI_AUTH_URL);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', CENTRAL_APP_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    logger_1.logger.info(`🔗 URL de autorización generada para integración ${integration.id}`);
    return authUrl.toString();
}
async function handleCallback(authCode, state) {
    const prisma = (0, database_1.getPrisma)();
    // Recuperar estado
    const savedState = oauthStates.get(state);
    if (!savedState) {
        throw new Error('Estado OAuth inválido o expirado');
    }
    logger_1.logger.info(`🔐 Procesando callback OAuth para Hermes ${savedState.hermes_integration_id}`);
    try {
        // Intercambiar código por tokens
        const tokens = await meliService.exchangeCodeForTokens(CENTRAL_APP_ID, CENTRAL_APP_SECRET, authCode, `${APP_URL}${CALLBACK_PATH}`, savedState.code_verifier);
        // Buscar integración
        const integration = await prisma.integration.findFirst({
            where: {
                hermes_integration_id: savedState.hermes_integration_id,
                cliente_domain: savedState.cliente_domain,
            },
        });
        if (!integration) {
            throw new Error('Integración no encontrada');
        }
        // Calcular expiración
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
        // Guardar credenciales
        const encryptedCredentials = (0, encryption_1.encrypt)({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: expiresAt.toISOString(),
            token_type: 'Bearer',
            scope: tokens.scope,
            user_id: String(tokens.user_id),
        });
        const existingCred = await prisma.integrationCredential.findFirst({
            where: { integration_id: integration.id },
        });
        if (existingCred) {
            await prisma.integrationCredential.update({
                where: { id: existingCred.id },
                data: {
                    credentials_encrypted: encryptedCredentials,
                    access_token: (0, encryption_1.encrypt)(tokens.access_token),
                    refresh_token: (0, encryption_1.encrypt)(tokens.refresh_token),
                    user_id: String(tokens.user_id),
                    expires_at: expiresAt,
                    token_last_refreshed_at: new Date(),
                    oauth_state: null,
                    updated_at: new Date(),
                },
            });
        }
        else {
            await prisma.integrationCredential.create({
                data: {
                    integration_id: integration.id,
                    credentials_encrypted: encryptedCredentials,
                    access_token: (0, encryption_1.encrypt)(tokens.access_token),
                    refresh_token: (0, encryption_1.encrypt)(tokens.refresh_token),
                    user_id: String(tokens.user_id),
                    expires_at: expiresAt,
                    token_last_refreshed_at: new Date(),
                },
            });
        }
        // Actualizar estado
        await prisma.integration.update({
            where: { id: integration.id },
            data: { estado: 'active', updated_at: new Date() },
        });
        // Limpiar estado
        oauthStates.delete(state);
        // Log
        await prisma.syncLog.create({
            data: {
                integration_id: integration.id,
                tipo: 'oauth_success',
                detalle: JSON.stringify({
                    user_id: tokens.user_id,
                    expires_at: expiresAt.toISOString(),
                }),
                resultado: 'success',
            },
        });
        logger_1.logger.success(`✅ OAuth completado para integración ${integration.id}`);
        return {
            success: true,
            integration_id: integration.id,
            hermes_url: savedState.hermes_url,
            hermes_integration_id: savedState.hermes_integration_id,
            user_id: String(tokens.user_id),
        };
    }
    catch (error) {
        logger_1.logger.error('Error en callback OAuth:', { error: error.message });
        oauthStates.delete(state);
        return {
            success: false,
            integration_id: '',
            hermes_url: savedState.hermes_url,
            hermes_integration_id: savedState.hermes_integration_id,
            error: error.message,
        };
    }
}
async function getTokenStatus(integrationId) {
    const prisma = (0, database_1.getPrisma)();
    const credential = await prisma.integrationCredential.findFirst({
        where: { integration_id: integrationId },
        orderBy: { updated_at: 'desc' },
    });
    if (!credential) {
        return {
            has_token: false,
            valid: false,
            expires_at: null,
            user_id: null,
            last_refresh: null,
        };
    }
    const now = new Date();
    const isValid = credential.expires_at ? credential.expires_at > now : false;
    return {
        has_token: !!(credential.access_token || credential.credentials_encrypted),
        valid: isValid,
        expires_at: credential.expires_at?.toISOString() || null,
        user_id: credential.user_id,
        last_refresh: credential.token_last_refreshed_at?.toISOString() || null,
    };
}
async function revokeCredentials(integrationId) {
    const prisma = (0, database_1.getPrisma)();
    await prisma.integrationCredential.deleteMany({
        where: { integration_id: integrationId },
    });
    await prisma.integration.update({
        where: { id: integrationId },
        data: { estado: 'pending', updated_at: new Date() },
    });
    logger_1.logger.info(`Credenciales revocadas para integración ${integrationId}`);
}
// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES AUXILIARES PKCE
// ═══════════════════════════════════════════════════════════════════════════
function generateCodeVerifier() {
    return (0, crypto_1.randomBytes)(32)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}
function generateCodeChallenge(verifier) {
    return (0, crypto_1.createHash)('sha256')
        .update(verifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}
function generateState() {
    return (0, crypto_1.randomBytes)(16).toString('hex');
}
exports.default = {
    initiateOAuth,
    handleCallback,
    getTokenStatus,
    revokeCredentials,
};
//# sourceMappingURL=oauth.js.map