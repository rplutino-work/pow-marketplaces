/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OAUTH ROUTES - Autenticación OAuth con MercadoLibre
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import * as oauthService from '../services/oauth';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/v1/oauth/meli/link - Iniciar flujo OAuth simplificado
 * 
 * Hermes redirige aquí para vincular cuenta de MercadoLibre.
 * Query params:
 *   - hermes_integration_id: ID de la integración en Hermes
 *   - hermes_url: URL de la instancia de Hermes
 */
router.get('/meli/link', async (req: Request, res: Response) => {
  try {
    const { hermes_integration_id, hermes_url } = req.query;

    if (!hermes_integration_id || !hermes_url) {
      return res.status(400).json({
        error: 'Se requiere hermes_integration_id y hermes_url',
      });
    }

    // Extraer dominio para identificar cliente
    let clienteDomain = '';
    try {
      const url = new URL(String(hermes_url));
      clienteDomain = url.hostname;
    } catch {
      clienteDomain = String(hermes_url);
    }

    logger.info(`🔐 Iniciando OAuth para Hermes ${hermes_integration_id} desde ${clienteDomain}`);

    const authUrl = await oauthService.initiateOAuth({
      hermes_integration_id: String(hermes_integration_id),
      hermes_url: String(hermes_url),
      cliente_domain: clienteDomain,
    });

    // Redirigir a MercadoLibre
    res.redirect(authUrl);

  } catch (error: any) {
    logger.error('Error iniciando OAuth:', { error: error.message });
    res.status(500).json({
      error: 'Error iniciando OAuth',
      details: error.message,
    });
  }
});

/**
 * GET /api/v1/oauth/auth/callback - Callback de MercadoLibre
 * 
 * MercadoLibre redirige aquí después de la autorización.
 */
router.get('/auth/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      logger.error('Error en OAuth callback:', { error, error_description });
      return res.status(400).send(`
        <html>
          <head><title>Error de Autorización</title></head>
          <body>
            <h1>Error de Autorización</h1>
            <p>${error_description || error}</p>
            <script>setTimeout(() => window.close(), 3000);</script>
          </body>
        </html>
      `);
    }

    if (!code || !state) {
      return res.status(400).json({
        error: 'Faltan parámetros code o state',
      });
    }

    logger.info(`🔐 Procesando callback OAuth con state: ${state}`);

    const result = await oauthService.handleCallback(String(code), String(state));

    if (!result.success) {
      return res.status(400).send(`
        <html>
          <head><title>Error de Autorización</title></head>
          <body>
            <h1>Error de Autorización</h1>
            <p>${result.error}</p>
            <a href="${result.hermes_url}/admin/marketplaces/configure?marketplace_id=mercadolibre">Volver</a>
          </body>
        </html>
      `);
    }

    // Redirigir a Hermes con éxito
    const redirectUrl = new URL(`${result.hermes_url}/admin/marketplaces/oauth_callback/${result.hermes_integration_id}`);
    redirectUrl.searchParams.set('success', 'true');
    redirectUrl.searchParams.set('user_id', result.user_id || '');
    redirectUrl.searchParams.set('microservice_integration_id', result.integration_id);

    logger.info(`✅ OAuth completado, redirigiendo a: ${redirectUrl.toString()}`);

    res.redirect(redirectUrl.toString());

  } catch (error: any) {
    logger.error('Error en callback OAuth:', { error: error.message });
    res.status(500).send(`
      <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error Procesando Autorización</h1>
          <p>${error.message}</p>
        </body>
      </html>
    `);
  }
});

/**
 * GET /api/v1/oauth/:marketplace_code/authorize - Iniciar OAuth (legacy)
 * @deprecated Usar /api/v1/oauth/meli/link
 */
router.get('/:marketplace_code/authorize', async (req: Request, res: Response) => {
  logger.warn('⚠️ Usando endpoint deprecado, redirigiendo a /meli/link');
  
  const { integration_id, hermes_url, client_id } = req.query;
  
  const newUrl = new URL('/api/v1/oauth/meli/link', `${req.protocol}://${req.get('host')}`);
  if (integration_id) newUrl.searchParams.set('hermes_integration_id', String(integration_id));
  if (hermes_url) newUrl.searchParams.set('hermes_url', String(hermes_url));
  
  res.redirect(newUrl.toString());
});

/**
 * GET /api/v1/oauth/:marketplace_code/callback - Callback legacy
 * @deprecated Usar /api/v1/oauth/auth/callback
 */
router.get('/:marketplace_code/callback', async (req: Request, res: Response) => {
  logger.warn('⚠️ Usando callback deprecado, redirigiendo a /auth/callback');
  
  const newUrl = new URL('/api/v1/oauth/auth/callback', `${req.protocol}://${req.get('host')}`);
  for (const [key, value] of Object.entries(req.query)) {
    if (value) newUrl.searchParams.set(key, String(value));
  }
  
  res.redirect(newUrl.toString());
});

/**
 * GET /api/v1/oauth/integrations/:id/status - Estado de token
 */
router.get('/integrations/:id/status', async (req: Request, res: Response) => {
  try {
    const status = await oauthService.getTokenStatus(req.params.id);
    res.json(status);
  } catch (error: any) {
    logger.error('Error obteniendo estado de token:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /api/v1/oauth/:id/refresh-token - Forzar refresh de token
 */
router.post('/:id/refresh-token', async (req: Request, res: Response) => {
  try {
    // El refresh se maneja automáticamente por el worker
    // Este endpoint es para forzar un refresh manual
    res.json({
      message: 'El refresh de tokens se maneja automáticamente',
      integration_id: req.params.id,
    });
  } catch (error: any) {
    logger.error('Error en refresh de token:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * DELETE /api/v1/oauth/:id/credentials - Revocar credenciales
 */
router.delete('/:id/credentials', async (req: Request, res: Response) => {
  try {
    await oauthService.revokeCredentials(req.params.id);
    res.json({ success: true, message: 'Credenciales revocadas' });
  } catch (error: any) {
    logger.error('Error revocando credenciales:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
