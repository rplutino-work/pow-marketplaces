/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DATABASE - Configuración de Prisma y conexión a PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Maneja la conexión a la base de datos PostgreSQL usando Prisma.
 * Incluye reconexión automática y manejo de errores.
 */
import { PrismaClient } from '@prisma/client';
/**
 * Obtiene la instancia de Prisma (singleton)
 * Crea una nueva instancia si no existe
 */
export declare function getPrisma(): PrismaClient;
/**
 * Inicializa la conexión a la base de datos
 * Debe llamarse al inicio de la aplicación
 */
export declare function initDatabase(): Promise<void>;
/**
 * Cierra la conexión a la base de datos
 * Usar al apagar la aplicación
 */
export declare function closeDatabase(): Promise<void>;
export declare const db: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
export default db;
//# sourceMappingURL=database.d.ts.map