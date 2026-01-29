/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTEGRATIONS ROUTES - Gestión de Integraciones
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import { getPrisma } from '../config/database';
import * as integrationsService from '../services/integrations';
import * as rulesService from '../services/rules';
import { logger } from '../utils/logger';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// CRUD DE INTEGRACIONES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/integrations - Listar integraciones
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { marketplace_id, estado, cliente_domain } = req.query;

    const filter: any = {};
    if (marketplace_id) filter.marketplace_id = String(marketplace_id);
    if (estado) filter.estado = String(estado);
    if (cliente_domain) filter.cliente_domain = String(cliente_domain);

    const integrations = await integrationsService.getIntegrations(filter);
    res.json(integrations);

  } catch (error: any) {
    logger.error('Error listando integraciones:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /api/v1/integrations/:id - Obtener integración
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const integration = await integrationsService.getIntegrationById(req.params.id);

    if (!integration) {
      return res.status(404).json({ error: 'Integración no encontrada' });
    }

    res.json(integration);

  } catch (error: any) {
    logger.error('Error obteniendo integración:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /api/v1/integrations - Crear integración
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      hermes_integration_id,
      marketplace_id,
      cliente_name,
      cliente_domain,
      hermes_api_url,
      hermes_token,
      ajustes_default,
    } = req.body;

    if (!hermes_integration_id || !marketplace_id || !cliente_domain) {
      return res.status(400).json({
        error: 'Se requiere hermes_integration_id, marketplace_id y cliente_domain',
      });
    }

    const integration = await integrationsService.createIntegration({
      hermes_integration_id,
      marketplace_id,
      cliente_name,
      cliente_domain,
      hermes_api_url,
      hermes_token,
      ajustes_default,
    });

    res.status(201).json(integration);

  } catch (error: any) {
    logger.error('Error creando integración:', { error: error.message });
    res.status(500).json({ error: 'Error interno', details: error.message });
  }
});

/**
 * PATCH /api/v1/integrations/:id - Actualizar integración
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const {
      cliente_name,
      estado,
      hermes_api_url,
      hermes_token,
      hermes_enabled,
      ajustes_default,
    } = req.body;

    const integration = await integrationsService.updateIntegration(req.params.id, {
      cliente_name,
      estado,
      hermes_api_url,
      hermes_token,
      hermes_enabled,
      ajustes_default,
    });

    res.json(integration);

  } catch (error: any) {
    logger.error('Error actualizando integración:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * DELETE /api/v1/integrations/:id - Eliminar integración
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await integrationsService.deleteIntegration(req.params.id);
    res.json({ success: true, message: 'Integración eliminada' });

  } catch (error: any) {
    logger.error('Error eliminando integración:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ESTADO Y HEALTH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/integrations/:id/health - Estado de salud
 */
router.get('/:id/health', async (req: Request, res: Response) => {
  try {
    const health = await integrationsService.getIntegrationHealth(req.params.id);
    res.json(health);

  } catch (error: any) {
    logger.error('Error obteniendo health:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /api/v1/integrations/:id/stats - Estadísticas
 */
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const stats = await integrationsService.getIntegrationStats(req.params.id);
    res.json(stats);

  } catch (error: any) {
    logger.error('Error obteniendo stats:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /api/v1/integrations/:id/test-connection - Probar conexión
 */
router.post('/:id/test-connection', async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();

    const integration = await prisma.integration.findUnique({
      where: { id: req.params.id },
      include: {
        credentials: { orderBy: { updated_at: 'desc' }, take: 1 },
      },
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integración no encontrada' });
    }

    const hasToken = integration.credentials.length > 0 &&
      (integration.credentials[0].access_token || integration.credentials[0].credentials_encrypted);

    const tokenValid = integration.credentials.length > 0 &&
      integration.credentials[0].expires_at &&
      integration.credentials[0].expires_at > new Date();

    res.json({
      integration_id: integration.id,
      estado: integration.estado,
      has_token: hasToken,
      token_valid: tokenValid,
      hermes_configured: !!integration.hermes_api_url,
      hermes_enabled: integration.hermes_enabled,
    });

  } catch (error: any) {
    logger.error('Error probando conexión:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * PATCH /api/v1/integrations/:id/status - Cambiar estado
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { estado } = req.body;

    if (!estado) {
      return res.status(400).json({ error: 'Se requiere estado' });
    }

    const validEstados = ['active', 'inactive', 'suspended', 'pending'];
    if (!validEstados.includes(estado)) {
      return res.status(400).json({
        error: 'Estado inválido',
        valid_estados: validEstados,
      });
    }

    const integration = await integrationsService.updateIntegration(req.params.id, { estado });
    res.json(integration);

  } catch (error: any) {
    logger.error('Error cambiando estado:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// REGLAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/integrations/:id/rules - Listar reglas
 */
router.get('/:id/rules', async (req: Request, res: Response) => {
  try {
    const rules = await rulesService.getRulesByIntegration(req.params.id);
    res.json(rules);

  } catch (error: any) {
    logger.error('Error listando reglas:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /api/v1/integrations/:id/rules - Crear regla
 */
router.post('/:id/rules', async (req: Request, res: Response) => {
  try {
    const { rule_key, rule_type, rule_config, enabled, priority } = req.body;

    if (!rule_key || !rule_type) {
      return res.status(400).json({
        error: 'Se requiere rule_key y rule_type',
      });
    }

    const rule = await rulesService.createRule({
      integration_id: req.params.id,
      rule_key,
      rule_type,
      rule_config: rule_config || {},
      enabled,
      priority,
    });

    res.status(201).json(rule);

  } catch (error: any) {
    logger.error('Error creando regla:', { error: error.message });
    res.status(500).json({ error: 'Error interno', details: error.message });
  }
});

/**
 * PATCH /api/v1/integrations/:id/rules/:rule_id - Actualizar regla
 */
router.patch('/:id/rules/:rule_id', async (req: Request, res: Response) => {
  try {
    const { rule_key, rule_type, rule_config, enabled, priority } = req.body;

    const rule = await rulesService.updateRule(req.params.rule_id, {
      rule_key,
      rule_type,
      rule_config,
      enabled,
      priority,
    });

    res.json(rule);

  } catch (error: any) {
    logger.error('Error actualizando regla:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * DELETE /api/v1/integrations/:id/rules/:rule_id - Eliminar regla
 */
router.delete('/:id/rules/:rule_id', async (req: Request, res: Response) => {
  try {
    await rulesService.deleteRule(req.params.rule_id);
    res.json({ success: true, message: 'Regla eliminada' });

  } catch (error: any) {
    logger.error('Error eliminando regla:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
