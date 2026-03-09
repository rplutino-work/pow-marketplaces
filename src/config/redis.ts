/**
 * REDIS - Configuración de conexión Redis para BullMQ
 */

import IORedis from 'ioredis';
import { logger } from '../utils/logger';

let connection: IORedis | null = null;
let connectionFailed = false;

export function getRedisConnection(): IORedis {
  if (connection) return connection;

  const redisUrl = process.env.REDIS_URL;

  const commonOpts: Partial<import('ioredis').RedisOptions> = {
    maxRetriesPerRequest: null, // Requerido por BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  };

  if (redisUrl) {
    connection = new IORedis(redisUrl, {
      ...commonOpts,
      retryStrategy: (times: number) => {
        if (times > 10) {
          logger.error('Redis: máximo de reintentos alcanzado');
          return null;
        }
        return Math.min(times * 200, 5000);
      },
    });
  } else {
    connection = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      ...commonOpts,
      retryStrategy: (times: number) => {
        if (times > 3) {
          connectionFailed = true;
          return null;
        }
        return Math.min(times * 500, 3000);
      },
    });
  }

  connection.on('connect', () => {
    connectionFailed = false;
    logger.info('Redis conectado');
  });

  connection.on('error', (err: Error) => {
    if (!connectionFailed) {
      logger.error('Redis error:', { error: err.message });
    }
  });

  return connection;
}

export async function closeRedis(): Promise<void> {
  if (connection) {
    try { await connection.quit(); } catch {}
    connection = null;
    logger.info('Redis desconectado');
  }
}

export async function isRedisAvailable(): Promise<boolean> {
  try {
    if (connectionFailed) return false;
    const redis = getRedisConnection();
    await redis.connect().catch(() => {});
    const result = await Promise.race([
      redis.ping(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    return result === 'PONG';
  } catch {
    connectionFailed = true;
    return false;
  }
}
