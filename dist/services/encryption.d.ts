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
/**
 * Encripta datos sensibles
 *
 * @param data - Datos a encriptar (objeto o string)
 * @returns String encriptado en formato JSON con iv, authTag y encrypted
 *
 * @example
 * const encrypted = encrypt({ access_token: 'xxx', refresh_token: 'yyy' });
 */
export declare function encrypt(data: any): string;
/**
 * Desencripta datos previamente encriptados
 *
 * @param encryptedData - String encriptado
 * @returns Datos desencriptados (objeto o string según lo que se encriptó)
 *
 * @example
 * const { access_token, refresh_token } = decrypt(encryptedString);
 */
export declare function decrypt(encryptedData: string): any;
/**
 * Genera una nueva clave de encriptación
 * Usar solo para setup inicial
 */
export declare function generateEncryptionKey(): string;
/**
 * Valida que una clave de encriptación sea válida
 */
export declare function validateEncryptionKey(key: string): boolean;
export declare const encryptionService: {
    encrypt: typeof encrypt;
    decrypt: typeof decrypt;
    generateEncryptionKey: typeof generateEncryptionKey;
    validateEncryptionKey: typeof validateEncryptionKey;
};
export default encryptionService;
//# sourceMappingURL=encryption.d.ts.map