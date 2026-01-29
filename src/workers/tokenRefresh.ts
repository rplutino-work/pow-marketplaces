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

import { getPrisma } from '../config/database';
import { encrypt, decrypt } from '../services/encryption';
import * as meliService from '../services/mercadolibre';
import { logger } from '../utils/logger';

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
export async function refreshAllExpiredTokens(): Promise<{
  checked: number;
  refreshed: number;
  failed: number;
  errors: string[];
}> {
  const result = {
    checked: 0,
    refreshed: 0,
    failed: 0,
    errors: [] as string[],
  };

  if (!CENTRAL_APP_ID || !CENTRAL_APP_SECRET) {
    logger.warn('Credenciales centrales no configuradas, saltando refresh');
    return result;
  }

  try {
    const prisma = getPrisma();
    
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

    logger.info(`🔄 Verificando ${credentials.length} tokens próximos a expirar...`);
    result.checked = credentials.length;

    // Renovar cada token
    for (const credential of credentials) {
      try {
        await refreshSingleToken(credential);
        result.refreshed++;
      } catch (error: any) {
        result.failed++;
        result.errors.push(`${credential.integration.id}: ${error.message}`);
        logger.error(`Error renovando token ${credential.id}:`, { error: error.message });
      }
    }

    logger.info(`✅ Refresh completado: ${result.refreshed} renovados, ${result.failed} fallidos`);

  } catch (error: any) {
    logger.error('Error en proceso de refresh:', { error: error.message });
    result.errors.push(`Error general: ${error.message}`);
  }

  return result;
}

/**
 * Renueva un token individual
 */
async function refreshSingleToken(credential: any): Promise<void> {
  const integration = credential.integration;
  
  logger.info(`🔄 Renovando token para integración ${integration.id} (${integration.cliente_name || 'N/A'})`);

  // Desencriptar refresh token
  let refreshToken: string | null = null;
  
  if (credential.refresh_token) {
    try {
      const decrypted = decrypt(credential.refresh_token);
      refreshToken = typeof decrypted === 'string' ? decrypted : decrypted?.refresh_token;
    } catch {
      // Puede estar sin encriptar
      refreshToken = credential.refresh_token;
    }
  }

  if (!refreshToken) {
    throw new Error('Refresh token no disponible');
  }

  // Renovar tokens usando la función correcta
  const tokens = await meliService.refreshAccessToken(
    CENTRAL_APP_ID!,
    CENTRAL_APP_SECRET!,
    refreshToken
  );

  // Calcular nueva expiración
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // Actualizar credenciales
  const prisma = getPrisma();
  
  await prisma.integrationCredential.update({
    where: { id: credential.id },
    data: {
      credentials_encrypted: encrypt({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt.toISOString(),
        token_type: 'Bearer',
      }),
      access_token: encrypt(tokens.access_token),
      refresh_token: encrypt(tokens.refresh_token),
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

  logger.success(`Token renovado para ${integration.id}, expira: ${expiresAt.toISOString()}`);
}

export default {
  refreshAllExpiredTokens,
};
