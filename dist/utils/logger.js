"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOGGER - Sistema de logging centralizado
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Logger simple y claro para el microservicio.
 * Usa colores en desarrollo y JSON en producción.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const isProduction = process.env.NODE_ENV === 'production';
// Colores para consola
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};
/**
 * Formatea el timestamp
 */
function getTimestamp() {
    return new Date().toISOString();
}
/**
 * Logger centralizado
 */
exports.logger = {
    /**
     * Log de información general
     */
    info(message, data) {
        if (isProduction) {
            console.log(JSON.stringify({ level: 'info', timestamp: getTimestamp(), message, ...data }));
        }
        else {
            console.log(`${colors.blue}[INFO]${colors.reset} ${getTimestamp()} - ${message}`, data || '');
        }
    },
    /**
     * Log de advertencia
     */
    warn(message, data) {
        if (isProduction) {
            console.log(JSON.stringify({ level: 'warn', timestamp: getTimestamp(), message, ...data }));
        }
        else {
            console.log(`${colors.yellow}[WARN]${colors.reset} ${getTimestamp()} - ${message}`, data || '');
        }
    },
    /**
     * Log de error
     */
    error(message, data) {
        if (isProduction) {
            console.error(JSON.stringify({ level: 'error', timestamp: getTimestamp(), message, ...data }));
        }
        else {
            console.error(`${colors.red}[ERROR]${colors.reset} ${getTimestamp()} - ${message}`, data || '');
        }
    },
    /**
     * Log de debug (solo en desarrollo)
     */
    debug(message, data) {
        if (!isProduction) {
            console.log(`${colors.magenta}[DEBUG]${colors.reset} ${getTimestamp()} - ${message}`, data || '');
        }
    },
    /**
     * Log de éxito
     */
    success(message, data) {
        if (isProduction) {
            console.log(JSON.stringify({ level: 'info', timestamp: getTimestamp(), message, success: true, ...data }));
        }
        else {
            console.log(`${colors.green}[SUCCESS]${colors.reset} ${getTimestamp()} - ${message}`, data || '');
        }
    },
};
exports.default = exports.logger;
//# sourceMappingURL=logger.js.map