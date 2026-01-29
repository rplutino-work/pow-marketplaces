"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HERMES ROUTES - Comunicación con Hermes OMS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Endpoints para sincronización de credenciales y catálogo desde Hermes.
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
const express_1 = require("express");
const database_1 = require("../config/database");
const integrationsService = __importStar(require("../services/integrations"));
const catalogService = __importStar(require("../services/catalog"));
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
/**
 * POST /api/v1/hermes/credentials/sync - Sincronizar credenciales desde Hermes
 *
 * Hermes envía las credenciales del cliente para que el microservicio
 * las almacene y pueda usarlas para OAuth y API calls.
 */
router.post('/credentials/sync', async (req, res) => {
    const startTime = Date.now();
    try {
        const { integration_id, marketplace_code, credentials, hermes_instance, } = req.body;
        logger_1.logger.info(`🔐 Recibiendo credenciales de Hermes para integración ${integration_id}`);
        if (!integration_id || !marketplace_code) {
            return res.status(400).json({
                error: 'Se requiere integration_id y marketplace_code',
            });
        }
        // Extraer dominio del hermes_instance
        let clienteDomain = 'unknown';
        if (hermes_instance?.api_url) {
            try {
                const url = new URL(hermes_instance.api_url);
                clienteDomain = url.hostname;
            }
            catch {
                clienteDomain = hermes_instance.api_url;
            }
        }
        const result = await integrationsService.syncCredentialsFromHermes({
            hermes_integration_id: String(integration_id),
            marketplace_name: marketplace_code,
            cliente_domain: clienteDomain,
            hermes_api_url: hermes_instance?.api_url || '',
            hermes_token: hermes_instance?.token,
            client_id: credentials?.client_id,
            client_secret: credentials?.client_secret,
        });
        const duration = Date.now() - startTime;
        logger_1.logger.info(`✅ Credenciales procesadas en ${duration}ms`);
        res.json({
            success: true,
            integration_id: result.integration_id,
            hermes_integration_id: result.hermes_integration_id,
            status: result.status,
        });
    }
    catch (error) {
        logger_1.logger.error('Error sincronizando credenciales:', { error: error.message });
        res.status(500).json({
            error: 'Error sincronizando credenciales',
            details: error.message,
        });
    }
});
/**
 * POST /api/v1/hermes/catalog/sync - Sincronizar catálogo desde Hermes
 *
 * Hermes envía productos para publicar/actualizar en MercadoLibre.
 */
router.post('/catalog/sync', async (req, res) => {
    const startTime = Date.now();
    try {
        const { integration_id, products, hermes_instance, options, } = req.body;
        logger_1.logger.info(`📦 Iniciando sincronización de catálogo para integración ${integration_id}`);
        if (!integration_id || !products) {
            return res.status(400).json({
                error: 'Se requiere integration_id y products',
            });
        }
        // Resolver integración usando URL e ID
        const integration = await integrationsService.resolveIntegration({
            hermes_integration_id: String(integration_id),
            hermes_api_url: hermes_instance?.api_url || '',
        });
        if (!integration) {
            return res.status(404).json({
                error: 'Integración no encontrada',
                details: `No se encontró integración ${integration_id} para ${hermes_instance?.api_url}`,
            });
        }
        // Actualizar hermes_api_url si es diferente
        if (hermes_instance?.api_url && integration.hermes_api_url !== hermes_instance.api_url) {
            await (0, database_1.getPrisma)().integration.update({
                where: { id: integration.id },
                data: { hermes_api_url: hermes_instance.api_url, updated_at: new Date() },
            });
        }
        // Ejecutar sincronización
        const result = await catalogService.syncCatalog({
            integration_id: integration.id,
            products,
            options: options || {},
        });
        const duration = Date.now() - startTime;
        logger_1.logger.info(`✅ Sincronización completada en ${duration}ms: ${result.success} exitosos, ${result.failed} fallidos`);
        res.json({
            success: true,
            integration_id: integration.id,
            results: {
                total: products.length,
                success: result.success,
                failed: result.failed,
                created: result.created,
                updated: result.updated,
                closed: result.closed,
            },
            duration_ms: duration,
        });
    }
    catch (error) {
        logger_1.logger.error('Error en sincronización de catálogo:', { error: error.message });
        res.status(500).json({
            error: 'Error en sincronización de catálogo',
            details: error.message,
        });
    }
});
/**
 * GET /api/v1/hermes/integrations/:hermes_id/status - Estado de integración
 */
router.get('/integrations/:hermes_id/status', async (req, res) => {
    try {
        const { hermes_id } = req.params;
        const { domain } = req.query;
        const prisma = (0, database_1.getPrisma)();
        const where = { hermes_integration_id: hermes_id };
        if (domain)
            where.cliente_domain = String(domain);
        const integration = await prisma.integration.findFirst({
            where,
            include: {
                marketplace: true,
                credentials: {
                    orderBy: { updated_at: 'desc' },
                    take: 1,
                },
            },
        });
        if (!integration) {
            return res.status(404).json({ error: 'Integración no encontrada' });
        }
        const credential = integration.credentials[0];
        let tokenStatus = 'no_credentials';
        if (credential) {
            if (credential.expires_at) {
                tokenStatus = credential.expires_at > new Date() ? 'valid' : 'expired';
            }
            else if (credential.access_token) {
                tokenStatus = 'unknown';
            }
        }
        res.json({
            microservice_integration_id: integration.id,
            hermes_integration_id: integration.hermes_integration_id,
            marketplace: integration.marketplace.name,
            estado: integration.estado,
            token_status: tokenStatus,
            user_id: credential?.user_id || null,
            expires_at: credential?.expires_at?.toISOString() || null,
            hermes_enabled: integration.hermes_enabled,
        });
    }
    catch (error) {
        logger_1.logger.error('Error obteniendo estado:', { error: error.message });
        res.status(500).json({ error: 'Error interno' });
    }
});
/**
 * POST /api/v1/hermes/register - Registrar nueva instancia de Hermes
 */
router.post('/register', async (req, res) => {
    try {
        const { api_url, token, cliente_name } = req.body;
        if (!api_url) {
            return res.status(400).json({ error: 'Se requiere api_url' });
        }
        let domain = '';
        try {
            const url = new URL(api_url);
            domain = url.hostname;
        }
        catch {
            domain = api_url;
        }
        logger_1.logger.info(`📝 Registrando instancia Hermes: ${domain}`);
        res.json({
            success: true,
            message: 'Instancia registrada',
            domain,
            instructions: {
                oauth_endpoint: '/api/v1/oauth/meli/link',
                catalog_endpoint: '/api/v1/hermes/catalog/sync',
                credentials_endpoint: '/api/v1/hermes/credentials/sync',
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Error registrando instancia:', { error: error.message });
        res.status(500).json({ error: 'Error interno' });
    }
});
exports.default = router;
//# sourceMappingURL=hermes.js.map