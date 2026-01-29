/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTEGRATIONS SERVICE - Gestión de Integraciones
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRUD y gestión de integraciones de marketplace.
 * Usa schema de producción con campos: ajustes_default, estado, etc.
 */

import { getPrisma } from '../config/database';
import { decrypt } from '../services/encryption';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// CONSULTAS
// ═══════════════════════════════════════════════════════════════════════════

export async function getIntegrations(filter?: {
  marketplace_id?: string;
  estado?: string;
  cliente_domain?: string;
}) {
  const prisma = getPrisma();

  const where: any = {};
  if (filter?.marketplace_id) where.marketplace_id = filter.marketplace_id;
  if (filter?.estado) where.estado = filter.estado;
  if (filter?.cliente_domain) where.cliente_domain = filter.cliente_domain;

  const integrations = await prisma.integration.findMany({
    where,
    include: {
      marketplace: true,
      credentials: {
        orderBy: { updated_at: 'desc' },
        take: 1,
      },
    },
    orderBy: { created_at: 'desc' },
  });

  return integrations.map(integration => {
    const credential = integration.credentials[0];
    let tokenStatus = 'no_credentials';
    let userId: string | null = null;

    if (credential) {
      userId = credential.user_id;
      if (credential.expires_at) {
        const now = new Date();
        tokenStatus = credential.expires_at > now ? 'valid' : 'expired';
      } else if (credential.access_token || credential.credentials_encrypted) {
        tokenStatus = 'unknown';
      }
    }

    return {
      id: integration.id,
      hermes_integration_id: integration.hermes_integration_id,
      cliente_name: integration.cliente_name,
      cliente_domain: integration.cliente_domain,
      marketplace_id: integration.marketplace_id,
      marketplace_name: integration.marketplace.name,
      estado: integration.estado,
      hermes_api_url: integration.hermes_api_url,
      hermes_enabled: integration.hermes_enabled,
      token_status: tokenStatus,
      user_id: userId,
      created_at: integration.created_at,
      updated_at: integration.updated_at,
    };
  });
}

export async function getIntegrationById(integrationId: string) {
  const prisma = getPrisma();

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    include: {
      marketplace: true,
      credentials: {
        orderBy: { updated_at: 'desc' },
        take: 1,
      },
      rules: true,
    },
  });

  if (!integration) return null;

  const credential = integration.credentials[0];
  let tokenInfo = null;

  if (credential) {
    tokenInfo = {
      has_token: !!(credential.access_token || credential.credentials_encrypted),
      user_id: credential.user_id,
      expires_at: credential.expires_at?.toISOString() || null,
      last_refresh: credential.token_last_refreshed_at?.toISOString() || null,
      is_valid: credential.expires_at ? credential.expires_at > new Date() : false,
    };
  }

  const rulesFormatted = integration.rules.map(rule => {
    let config = {};
    try { config = JSON.parse(rule.rule_json); } catch {}
    return {
      id: rule.id,
      rule_key: rule.rule_key,
      rule_type: rule.rule_type,
      config,
      enabled: rule.enabled,
      priority: rule.priority,
    };
  });

  return {
    id: integration.id,
    hermes_integration_id: integration.hermes_integration_id,
    cliente_name: integration.cliente_name,
    cliente_domain: integration.cliente_domain,
    marketplace_id: integration.marketplace_id,
    marketplace_name: integration.marketplace.name,
    estado: integration.estado,
    hermes_api_url: integration.hermes_api_url,
    hermes_token: integration.hermes_token ? '***' : null,
    hermes_enabled: integration.hermes_enabled,
    ajustes_default: integration.ajustes_default ? JSON.parse(integration.ajustes_default) : null,
    token_info: tokenInfo,
    rules: rulesFormatted,
    created_at: integration.created_at,
    updated_at: integration.updated_at,
  };
}

export async function getIntegrationByHermesId(
  hermesIntegrationId: string,
  clienteDomain: string
) {
  const prisma = getPrisma();

  return prisma.integration.findFirst({
    where: {
      hermes_integration_id: hermesIntegrationId,
      cliente_domain: clienteDomain,
    },
    include: {
      marketplace: true,
      credentials: {
        orderBy: { updated_at: 'desc' },
        take: 1,
      },
    },
  });
}

export async function resolveIntegration(params: {
  hermes_integration_id: string;
  hermes_api_url: string;
}) {
  const prisma = getPrisma();

  // Extraer dominio de la URL
  let domain = '';
  try {
    const url = new URL(params.hermes_api_url);
    domain = url.hostname;
  } catch {
    domain = params.hermes_api_url;
  }

  // Buscar integración con coincidencia exacta
  const integration = await prisma.integration.findFirst({
    where: {
      hermes_integration_id: params.hermes_integration_id,
      OR: [
        { cliente_domain: domain },
        { hermes_api_url: { contains: domain } },
      ],
    },
    include: {
      marketplace: true,
      credentials: {
        orderBy: { updated_at: 'desc' },
        take: 1,
      },
    },
  });

  if (!integration) {
    logger.warn(`Integración no encontrada: ${params.hermes_integration_id} desde ${domain}`);
    return null;
  }

  return integration;
}

// ═══════════════════════════════════════════════════════════════════════════
// CREAR / ACTUALIZAR
// ═══════════════════════════════════════════════════════════════════════════

export async function createIntegration(data: {
  hermes_integration_id: string;
  marketplace_id: string;
  cliente_name?: string;
  cliente_domain: string;
  hermes_api_url?: string;
  hermes_token?: string;
  ajustes_default?: any;
}) {
  const prisma = getPrisma();

  const integration = await prisma.integration.create({
    data: {
      hermes_integration_id: data.hermes_integration_id,
      marketplace_id: data.marketplace_id,
      cliente_name: data.cliente_name,
      cliente_domain: data.cliente_domain,
      hermes_api_url: data.hermes_api_url,
      hermes_token: data.hermes_token,
      ajustes_default: data.ajustes_default ? JSON.stringify(data.ajustes_default) : null,
      estado: 'pending',
    },
    include: { marketplace: true },
  });

  logger.info(`Integración creada: ${integration.id}`);
  return integration;
}

export async function updateIntegration(
  integrationId: string,
  data: {
    cliente_name?: string;
    estado?: string;
    hermes_api_url?: string;
    hermes_token?: string;
    hermes_enabled?: boolean;
    ajustes_default?: any;
  }
) {
  const prisma = getPrisma();

  const updateData: any = { updated_at: new Date() };

  if (data.cliente_name !== undefined) updateData.cliente_name = data.cliente_name;
  if (data.estado !== undefined) updateData.estado = data.estado;
  if (data.hermes_api_url !== undefined) updateData.hermes_api_url = data.hermes_api_url;
  if (data.hermes_token !== undefined) updateData.hermes_token = data.hermes_token;
  if (data.hermes_enabled !== undefined) updateData.hermes_enabled = data.hermes_enabled;
  if (data.ajustes_default !== undefined) {
    updateData.ajustes_default = JSON.stringify(data.ajustes_default);
  }

  const integration = await prisma.integration.update({
    where: { id: integrationId },
    data: updateData,
    include: { marketplace: true },
  });

  logger.info(`Integración actualizada: ${integration.id}`);
  return integration;
}

export async function deleteIntegration(integrationId: string) {
  const prisma = getPrisma();

  // Eliminar en cascada (credenciales, reglas, logs, etc.)
  await prisma.$transaction([
    prisma.integrationCredential.deleteMany({ where: { integration_id: integrationId } }),
    prisma.integrationRule.deleteMany({ where: { integration_id: integrationId } }),
    prisma.syncLog.deleteMany({ where: { integration_id: integrationId } }),
    prisma.syncJob.deleteMany({ where: { integration_id: integrationId } }),
    prisma.order.deleteMany({ where: { integration_id: integrationId } }),
    prisma.integration.delete({ where: { id: integrationId } }),
  ]);

  logger.info(`Integración eliminada: ${integrationId}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// CREDENCIALES
// ═══════════════════════════════════════════════════════════════════════════

export async function syncCredentialsFromHermes(data: {
  hermes_integration_id: string;
  marketplace_name: string;
  cliente_domain: string;
  hermes_api_url: string;
  hermes_token?: string;
  client_id?: string;
  client_secret?: string;
}) {
  const prisma = getPrisma();

  logger.info(`Sincronizando credenciales para Hermes ${data.hermes_integration_id}`);

  // Buscar marketplace
  let marketplace = await prisma.marketplace.findUnique({
    where: { name: data.marketplace_name },
  });

  if (!marketplace) {
    marketplace = await prisma.marketplace.create({
      data: {
        name: data.marketplace_name,
        health_status: 'healthy',
      },
    });
  }

  // Buscar o crear integración
  let integration = await prisma.integration.findFirst({
    where: {
      hermes_integration_id: data.hermes_integration_id,
      cliente_domain: data.cliente_domain,
    },
  });

  if (!integration) {
    integration = await prisma.integration.create({
      data: {
        hermes_integration_id: data.hermes_integration_id,
        marketplace_id: marketplace.id,
        cliente_domain: data.cliente_domain,
        hermes_api_url: data.hermes_api_url,
        hermes_token: data.hermes_token,
        estado: 'pending',
      },
    });
    logger.info(`Nueva integración creada: ${integration.id}`);
  } else {
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        hermes_api_url: data.hermes_api_url,
        hermes_token: data.hermes_token,
        updated_at: new Date(),
      },
    });
  }

  // Si hay client_id/secret, guardar en credenciales
  if (data.client_id || data.client_secret) {
    const existingCred = await prisma.integrationCredential.findFirst({
      where: { integration_id: integration.id },
    });

    const credData = {
      client_id: data.client_id,
      client_secret: data.client_secret,
      updated_at: new Date().toISOString(),
    };

    if (existingCred) {
      // Preservar tokens existentes
      let existingData = {};
      try {
        existingData = JSON.parse(existingCred.credentials_encrypted);
      } catch {}

      await prisma.integrationCredential.update({
        where: { id: existingCred.id },
        data: {
          credentials_encrypted: JSON.stringify({ ...existingData, ...credData }),
          updated_at: new Date(),
        },
      });
    } else {
      await prisma.integrationCredential.create({
        data: {
          integration_id: integration.id,
          credentials_encrypted: JSON.stringify(credData),
        },
      });
    }
  }

  return {
    integration_id: integration.id,
    hermes_integration_id: data.hermes_integration_id,
    status: 'synced',
  };
}

export async function getAccessToken(integrationId: string): Promise<string | null> {
  const prisma = getPrisma();

  const credential = await prisma.integrationCredential.findFirst({
    where: { integration_id: integrationId },
    orderBy: { updated_at: 'desc' },
  });

  if (!credential) return null;

  // Verificar expiración
  if (credential.expires_at && credential.expires_at <= new Date()) {
    logger.warn(`Token expirado para integración ${integrationId}`);
    return null;
  }

  // Intentar obtener access_token directo
  if (credential.access_token) {
    try {
      return decrypt(credential.access_token);
    } catch (e) {
      // Si falla el decrypt, puede que ya esté en texto plano (legacy)
      return credential.access_token;
    }
  }

  // Intentar desde credentials_encrypted
  if (credential.credentials_encrypted) {
    try {
      const decrypted = JSON.parse(credential.credentials_encrypted);
      if (decrypted.access_token) {
        return decrypted.access_token;
      }
    } catch {}
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ESTADÍSTICAS
// ═══════════════════════════════════════════════════════════════════════════

export async function getIntegrationStats(integrationId: string) {
  const prisma = getPrisma();

  const [orderStats, recentLogs] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: { integration_id: integrationId },
      _count: { id: true },
    }),
    prisma.syncLog.findMany({
      where: { integration_id: integrationId },
      orderBy: { created_at: 'desc' },
      take: 10,
    }),
  ]);

  const ordersByStatus: Record<string, number> = {};
  orderStats.forEach(stat => {
    ordersByStatus[stat.status] = stat._count.id;
  });

  return {
    orders: {
      total: Object.values(ordersByStatus).reduce((a, b) => a + b, 0),
      by_status: ordersByStatus,
    },
    recent_activity: recentLogs.map(log => ({
      tipo: log.tipo,
      resultado: log.resultado,
      created_at: log.created_at,
    })),
  };
}

export async function getIntegrationHealth(integrationId: string) {
  const prisma = getPrisma();

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    include: {
      marketplace: true,
      credentials: {
        orderBy: { updated_at: 'desc' },
        take: 1,
      },
    },
  });

  if (!integration) {
    return { status: 'not_found' };
  }

  const checks = {
    integration_active: integration.estado === 'active',
    hermes_configured: !!integration.hermes_api_url,
    credentials_present: integration.credentials.length > 0,
    token_valid: false,
  };

  if (integration.credentials.length > 0) {
    const cred = integration.credentials[0];
    checks.token_valid = cred.expires_at ? cred.expires_at > new Date() : false;
  }

  const allHealthy = Object.values(checks).every(v => v);

  return {
    status: allHealthy ? 'healthy' : 'unhealthy',
    checks,
    marketplace_health: integration.marketplace.health_status,
  };
}

export default {
  getIntegrations,
  getIntegrationById,
  getIntegrationByHermesId,
  resolveIntegration,
  createIntegration,
  updateIntegration,
  deleteIntegration,
  syncCredentialsFromHermes,
  getAccessToken,
  getIntegrationStats,
  getIntegrationHealth,
};
