"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HEALTH CHECK WORKER - Verificación de Salud de Marketplaces
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ejecuta verificaciones periódicas de conectividad con las APIs
 * de los marketplaces integrados.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runHealthChecks = runHealthChecks;
exports.checkHermesInstances = checkHermesInstances;
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════
const MELI_API_URL = process.env.ML_API_URL || 'https://api.mercadolibre.com';
const HEALTH_CHECK_TIMEOUT = 10000; // 10 segundos
// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECKS
// ═══════════════════════════════════════════════════════════════════════════
async function runHealthChecks() {
    logger_1.logger.info('🔍 Ejecutando health checks de marketplaces...');
    const prisma = (0, database_1.getPrisma)();
    const marketplaces = await prisma.marketplace.findMany();
    for (const marketplace of marketplaces) {
        await checkMarketplaceHealth(marketplace);
    }
    logger_1.logger.info(`Health checks completados para ${marketplaces.length} marketplaces`);
}
async function checkMarketplaceHealth(marketplace) {
    const prisma = (0, database_1.getPrisma)();
    const startTime = Date.now();
    try {
        let healthy = false;
        let responseTime = 0;
        if (marketplace.name === 'mercadolibre') {
            const result = await checkMercadoLibreHealth();
            healthy = result.healthy;
            responseTime = result.responseTime;
        }
        else {
            // Por defecto, asumir healthy para otros marketplaces
            healthy = true;
            responseTime = 0;
        }
        await prisma.marketplace.update({
            where: { id: marketplace.id },
            data: {
                health_status: healthy ? 'healthy' : 'unhealthy',
                last_health_check_at: new Date(),
                response_time_ms: responseTime,
                updated_at: new Date(),
            },
        });
        logger_1.logger.info(`Health check ${marketplace.name}: ${healthy ? 'healthy' : 'unhealthy'} (${responseTime}ms)`);
    }
    catch (error) {
        logger_1.logger.error(`Error en health check de ${marketplace.name}:`, { error: error.message });
        await prisma.marketplace.update({
            where: { id: marketplace.id },
            data: {
                health_status: 'unhealthy',
                last_health_check_at: new Date(),
                updated_at: new Date(),
            },
        });
    }
}
async function checkMercadoLibreHealth() {
    const startTime = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
        const response = await fetch(`${MELI_API_URL}/sites/MLA`, {
            method: 'GET',
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;
        const healthy = response.ok;
        return { healthy, responseTime };
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.logger.error('Error en health check de MercadoLibre:', { error: error.message });
        return { healthy: false, responseTime };
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// HERMES HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════
async function checkHermesInstances() {
    logger_1.logger.info('🔍 Verificando instancias de Hermes...');
    const prisma = (0, database_1.getPrisma)();
    const integrations = await prisma.integration.findMany({
        where: {
            hermes_enabled: true,
            hermes_api_url: { not: null },
        },
        distinct: ['hermes_api_url'],
    });
    for (const integration of integrations) {
        if (integration.hermes_api_url) {
            await checkHermesHealth(integration.hermes_api_url);
        }
    }
    logger_1.logger.info(`Verificación completada para ${integrations.length} instancias Hermes`);
}
async function checkHermesHealth(apiUrl) {
    const startTime = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
        const response = await fetch(`${apiUrl}/api/v1/health`, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'Accept': 'application/json' },
        });
        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;
        const healthy = response.ok;
        logger_1.logger.info(`Hermes ${apiUrl}: ${healthy ? 'healthy' : 'unhealthy'} (${responseTime}ms)`);
        return healthy;
    }
    catch (error) {
        logger_1.logger.warn(`Hermes ${apiUrl} no responde: ${error.message}`);
        return false;
    }
}
exports.default = {
    runHealthChecks,
    checkHermesInstances,
};
//# sourceMappingURL=healthCheck.js.map