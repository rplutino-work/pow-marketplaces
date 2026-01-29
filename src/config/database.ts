/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DATABASE - Configuración de Prisma y conexión a PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Maneja la conexión a la base de datos PostgreSQL usando Prisma.
 * Incluye reconexión automática y manejo de errores.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTE PRISMA (Singleton)
// ═══════════════════════════════════════════════════════════════════════════

let prisma: PrismaClient | null = null;

/**
 * Obtiene la instancia de Prisma (singleton)
 * Crea una nueva instancia si no existe
 */
export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
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
export async function initDatabase(): Promise<void> {
  try {
    const client = getPrisma();
    
    // Probar conexión
    await client.$connect();
    logger.success('Conexión a base de datos establecida');
    
    // Verificar que exista el marketplace MercadoLibre
    await ensureMercadoLibreMarketplace();
    
  } catch (error: any) {
    logger.error('Error conectando a base de datos:', { message: error.message });
    throw error;
  }
}

/**
 * Cierra la conexión a la base de datos
 * Usar al apagar la aplicación
 */
export async function closeDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    logger.info('Conexión a base de datos cerrada');
  }
}

/**
 * Asegura que exista el marketplace MercadoLibre en la base de datos
 * NOTA: El schema usa 'name' como identificador único, no 'code'
 */
async function ensureMercadoLibreMarketplace(): Promise<void> {
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
    logger.info('Marketplace MercadoLibre creado');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTAR CLIENTE PARA USO DIRECTO
// ═══════════════════════════════════════════════════════════════════════════

export const db = getPrisma();
export default db;
