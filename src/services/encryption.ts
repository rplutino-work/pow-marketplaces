/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENCRYPTION SERVICE - Encriptación de credenciales
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Servicio para encriptar y desencriptar datos sensibles como:
 * - Access tokens de MercadoLibre
 * - Refresh tokens
 * - Client secrets
 * 
 * Usa AES-256-GCM que proporciona:
 * - Encriptación fuerte
 * - Autenticación de datos (protege contra manipulación)
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  logger.warn('⚠️ ENCRYPTION_KEY no configurada - las credenciales no estarán seguras');
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES DE ENCRIPTACIÓN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Encripta datos sensibles
 * 
 * @param data - Datos a encriptar (objeto o string)
 * @returns String encriptado en formato JSON con iv, authTag y encrypted
 * 
 * @example
 * const encrypted = encrypt({ access_token: 'xxx', refresh_token: 'yyy' });
 */
export function encrypt(data: any): string {
  if (!ENCRYPTION_KEY) {
    // Sin clave, devolver JSON sin encriptar (solo desarrollo)
    return JSON.stringify(data);
  }

  try {
    const key = Buffer.from(ENCRYPTION_KEY, 'base64');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Convertir a JSON si es objeto
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    
    let encrypted = cipher.update(dataString, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    // Formato: { encrypted, iv, authTag }
    return JSON.stringify({
      encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    });
    
  } catch (error: any) {
    logger.error('Error encriptando datos:', { error: error.message });
    throw new Error('Error de encriptación');
  }
}

/**
 * Desencripta datos previamente encriptados
 * 
 * @param encryptedData - String encriptado
 * @returns Datos desencriptados (objeto o string según lo que se encriptó)
 * 
 * @example
 * const { access_token, refresh_token } = decrypt(encryptedString);
 */
export function decrypt(encryptedData: string): any {
  if (!ENCRYPTION_KEY) {
    // Sin clave, intentar parsear como JSON directo
    try {
      return JSON.parse(encryptedData);
    } catch {
      return encryptedData;
    }
  }

  try {
    const data = JSON.parse(encryptedData);
    
    // Si no tiene estructura de encriptación, es JSON directo (datos migrados)
    if (!data.encrypted || !data.iv || !data.authTag) {
      return data;
    }
    
    const key = Buffer.from(ENCRYPTION_KEY, 'base64');
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(data.iv, 'base64')
    );
    
    decipher.setAuthTag(Buffer.from(data.authTag, 'base64'));
    
    let decrypted = decipher.update(data.encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Intentar parsear como JSON
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
    
  } catch (error: any) {
    // Si falla, intentar como JSON directo (datos migrados sin encriptar)
    try {
      return JSON.parse(encryptedData);
    } catch {
      logger.error('Error desencriptando datos:', { error: error.message });
      throw new Error('Error de desencriptación');
    }
  }
}

/**
 * Genera una nueva clave de encriptación
 * Usar solo para setup inicial
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Valida que una clave de encriptación sea válida
 */
export function validateEncryptionKey(key: string): boolean {
  try {
    const buffer = Buffer.from(key, 'base64');
    return buffer.length === 32;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTAR COMO OBJETO PARA COMPATIBILIDAD
// ═══════════════════════════════════════════════════════════════════════════

export const encryptionService = {
  encrypt,
  decrypt,
  generateEncryptionKey,
  validateEncryptionKey,
};

export default encryptionService;
