"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DATABASE - Configuración de Prisma y conexión a PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Maneja la conexión a la base de datos PostgreSQL usando Prisma.
 * Incluye reconexión automática y manejo de errores.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.getPrisma = getPrisma;
exports.initDatabase = initDatabase;
exports.closeDatabase = closeDatabase;
const client_1 = require("@prisma/client");
const logger_1 = require("../utils/logger");
// ═══════════════════════════════════════════════════════════════════════════
// CLIENTE PRISMA (Singleton)
// ═══════════════════════════════════════════════════════════════════════════
let prisma = null;
/**
 * Obtiene la instancia de Prisma (singleton)
 * Crea una nueva instancia si no existe
 */
function getPrisma() {
    if (!prisma) {
        prisma = new client_1.PrismaClient({
            log: process.env.NODE_ENV === 'development'
                ? ['query', 'warn', 'error']
                : ['warn', 'error'],
        });
    }
    return prisma;
}
/**
 * Inicializa la conexión a la base de datos
 * Debe llamarse al inicio de la aplicación
 */
async function initDatabase() {
    try {
        const client = getPrisma();
        // Probar conexión
        await client.$connect();
        logger_1.logger.success('Conexión a base de datos establecida');
        // Verificar que exista el marketplace MercadoLibre
        await ensureMercadoLibreMarketplace();
    }
    catch (error) {
        logger_1.logger.error('Error conectando a base de datos:', { message: error.message });
        throw error;
    }
}
/**
 * Cierra la conexión a la base de datos
 * Usar al apagar la aplicación
 */
async function closeDatabase() {
    if (prisma) {
        await prisma.$disconnect();
        prisma = null;
        logger_1.logger.info('Conexión a base de datos cerrada');
    }
}
/**
 * Asegura que exista el marketplace MercadoLibre en la base de datos
 * NOTA: El schema usa 'name' como identificador único, no 'code'
 */
async function ensureMercadoLibreMarketplace() {
    const client = getPrisma();
    // Buscar por name (el campo único en el schema de producción)
    const existing = await client.marketplace.findUnique({
        where: { name: 'mercadolibre' },
    });
    if (!existing) {
        await client.marketplace.create({
            data: {
                name: 'mercadolibre',
                health_status: 'unknown',
            },
        });
        logger_1.logger.info('Marketplace MercadoLibre creado');
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// EXPORTAR CLIENTE PARA USO DIRECTO
// ═══════════════════════════════════════════════════════════════════════════
exports.db = getPrisma();
exports.default = exports.db;
//# sourceMappingURL=database.js.map