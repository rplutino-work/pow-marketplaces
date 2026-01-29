/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HERMES ROUTES - Comunicación con Hermes OMS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Endpoints para sincronización de credenciales y catálogo desde Hermes.
 */

import { Router, Request, Response } from 'express';
import { getPrisma } from '../config/database';
import * as integrationsService from '../services/integrations';
import * as catalogService from '../services/catalog';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/v1/hermes/credentials/sync - Sincronizar credenciales desde Hermes
 * 
 * Hermes envía las credenciales del cliente para que el microservicio
 * las almacene y pueda usarlas para OAuth y API calls.
 */
router.post('/credentials/sync', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const {
      integration_id,
      marketplace_code,
      credentials,
      hermes_instance,
    } = req.body;

    logger.info(`🔐 Recibiendo credenciales de Hermes para integración ${integration_id}`);

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
      } catch {
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
    logger.info(`✅ Credenciales procesadas en ${duration}ms`);

    res.json({
      success: true,
      integration_id: result.integration_id,
      hermes_integration_id: result.hermes_integration_id,
      status: result.status,
    });

  } catch (error: any) {
    logger.error('Error sincronizando credenciales:', { error: error.message });
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
router.post('/catalog/sync', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const {
      integration_id,
      products,
      hermes_instance,
      options,
    } = req.body;

    logger.info(`📦 Iniciando sincronización de catálogo para integración ${integration_id}`);

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
      await getPrisma().integration.update({
        where: { id: integration.id },
        data: { hermes_api_url: hermes_instance.api_url, updated_at: new Date() },
      });
      logger.info(`URL de Hermes actualizada: ${hermes_instance.api_url}`);
    }

    // Ejecutar sincronización
    const result = await catalogService.syncCatalog({
      integration_id: integration.id,
      products,
      options: options || {},
    });

    const duration = Date.now() - startTime;
    logger.info(`✅ Sincronización completada en ${duration}ms: ${result.success} exitosos, ${result.failed} fallidos`);

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

  } catch (error: any) {
    logger.error('Error en sincronización de catálogo:', { error: error.message });
    res.status(500).json({
      error: 'Error en sincronización de catálogo',
      details: error.message,
    });
  }
});

/**
 * GET /api/v1/hermes/integrations/:hermes_id/status - Estado de integración
 */
router.get('/integrations/:hermes_id/status', async (req: Request, res: Response) => {
  try {
    const { hermes_id } = req.params;
    const { domain } = req.query;

    const prisma = getPrisma();

    const where: any = { hermes_integration_id: hermes_id };
    if (domain) where.cliente_domain = String(domain);

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
      } else if (credential.access_token) {
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

  } catch (error: any) {
    logger.error('Error obteniendo estado:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /api/v1/hermes/register - Registrar nueva instancia de Hermes
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { api_url, token, cliente_name } = req.body;

    if (!api_url) {
      return res.status(400).json({ error: 'Se requiere api_url' });
    }

    let domain = '';
    try {
      const url = new URL(api_url);
      domain = url.hostname;
    } catch {
      domain = api_url;
    }

    logger.info(`📝 Registrando instancia Hermes: ${domain}`);

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

  } catch (error: any) {
    logger.error('Error registrando instancia:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
