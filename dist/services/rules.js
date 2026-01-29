"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RULES SERVICE - Reglas de Negocio
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gestiona reglas de negocio para transformación de órdenes y catálogo.
 * Usa schema de producción donde reglas se guardan en rule_key + rule_json.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRule = createRule;
exports.updateRule = updateRule;
exports.deleteRule = deleteRule;
exports.getRulesByIntegration = getRulesByIntegration;
exports.getRuleById = getRuleById;
exports.evaluateOrderRules = evaluateOrderRules;
exports.applyRulesToOrder = applyRulesToOrder;
exports.getRuleTemplates = getRuleTemplates;
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
// ═══════════════════════════════════════════════════════════════════════════
// GESTIÓN DE REGLAS (CRUD)
// ═══════════════════════════════════════════════════════════════════════════
async function createRule(data) {
    const prisma = (0, database_1.getPrisma)();
    const rule = await prisma.integrationRule.create({
        data: {
            integration_id: data.integration_id,
            rule_key: data.rule_key,
            rule_type: data.rule_type,
            rule_json: JSON.stringify(data.rule_config),
            enabled: data.enabled ?? true,
            priority: data.priority ?? 0,
        },
    });
    logger_1.logger.info(`Regla creada: ${rule.id} (Key: ${rule.rule_key})`);
    return formatRule(rule);
}
async function updateRule(ruleId, data) {
    const prisma = (0, database_1.getPrisma)();
    const updateData = { updated_at: new Date() };
    if (data.rule_key !== undefined)
        updateData.rule_key = data.rule_key;
    if (data.rule_type !== undefined)
        updateData.rule_type = data.rule_type;
    if (data.rule_config !== undefined)
        updateData.rule_json = JSON.stringify(data.rule_config);
    if (data.enabled !== undefined)
        updateData.enabled = data.enabled;
    if (data.priority !== undefined)
        updateData.priority = data.priority;
    const rule = await prisma.integrationRule.update({
        where: { id: ruleId },
        data: updateData,
    });
    logger_1.logger.info(`Regla actualizada: ${rule.id}`);
    return formatRule(rule);
}
async function deleteRule(ruleId) {
    const prisma = (0, database_1.getPrisma)();
    await prisma.integrationRule.delete({
        where: { id: ruleId },
    });
    logger_1.logger.info(`Regla eliminada: ${ruleId}`);
}
async function getRulesByIntegration(integrationId) {
    const prisma = (0, database_1.getPrisma)();
    const rules = await prisma.integrationRule.findMany({
        where: { integration_id: integrationId },
        orderBy: [{ priority: 'desc' }, { created_at: 'asc' }],
    });
    return rules.map(formatRule);
}
async function getRuleById(ruleId) {
    const prisma = (0, database_1.getPrisma)();
    const rule = await prisma.integrationRule.findUnique({
        where: { id: ruleId },
    });
    return rule ? formatRule(rule) : null;
}
// ═══════════════════════════════════════════════════════════════════════════
// EVALUACIÓN DE REGLAS
// ═══════════════════════════════════════════════════════════════════════════
async function evaluateOrderRules(integrationId, order, ruleType = 'inbound') {
    const prisma = (0, database_1.getPrisma)();
    const rules = await prisma.integrationRule.findMany({
        where: {
            integration_id: integrationId,
            rule_type: ruleType,
            enabled: true,
        },
        orderBy: { priority: 'desc' },
    });
    const result = {
        should_block: false,
        applied_rules: [],
        transformations: {},
    };
    for (const rule of rules) {
        const config = parseRuleJson(rule.rule_json);
        const evaluation = evaluateRule(rule.rule_key, config, order);
        if (evaluation.matched) {
            result.applied_rules.push(rule.rule_key);
            if (evaluation.block) {
                result.should_block = true;
                result.flag_reason = evaluation.reason || `Bloqueado por regla: ${rule.rule_key}`;
            }
            if (evaluation.transformations) {
                result.transformations = { ...result.transformations, ...evaluation.transformations };
            }
        }
    }
    return result;
}
async function applyRulesToOrder(integrationId, order) {
    const evaluation = await evaluateOrderRules(integrationId, order);
    let transformedOrder = { ...order };
    // Aplicar transformaciones
    if (evaluation.transformations.add_tags) {
        transformedOrder.tags = [
            ...(transformedOrder.tags || []),
            ...evaluation.transformations.add_tags,
        ];
    }
    if (evaluation.transformations.multiply_price && transformedOrder.total) {
        transformedOrder.total = transformedOrder.total * evaluation.transformations.multiply_price;
    }
    if (evaluation.transformations.set_warehouse) {
        transformedOrder.warehouse_id = evaluation.transformations.set_warehouse;
    }
    return { order: transformedOrder, result: evaluation };
}
// ═══════════════════════════════════════════════════════════════════════════
// EVALUACIÓN ESPECÍFICA POR TIPO DE REGLA
// ═══════════════════════════════════════════════════════════════════════════
function evaluateRule(ruleKey, config, order) {
    switch (ruleKey) {
        case 'exclude_skus':
            return evaluateExcludeSkus(config, order);
        case 'block_sku':
            return evaluateBlockSku(config, order);
        case 'add_tag_to_order':
            return evaluateAddTag(config, order);
        case 'multiply_price':
            return evaluateMultiplyPrice(config, order);
        case 'cap_stock':
            return evaluateCapStock(config, order);
        case 'set_warehouse':
            return evaluateSetWarehouse(config, order);
        case 'min_order_total':
            return evaluateMinOrderTotal(config, order);
        case 'block_shipping_method':
            return evaluateBlockShippingMethod(config, order);
        default:
            // Regla genérica con condiciones/acciones
            return evaluateGenericRule(config, order);
    }
}
function evaluateExcludeSkus(config, order) {
    const excludedSkus = config.skus || [];
    const orderSkus = order.items?.map((i) => i.sku) || [];
    const hasExcluded = orderSkus.some((sku) => excludedSkus.includes(sku));
    return {
        matched: hasExcluded,
        block: hasExcluded,
        reason: hasExcluded ? `Orden contiene SKU excluido` : undefined,
    };
}
function evaluateBlockSku(config, order) {
    const blockedSku = config.sku;
    const orderSkus = order.items?.map((i) => i.sku) || [];
    const hasBlocked = orderSkus.includes(blockedSku);
    return {
        matched: hasBlocked,
        block: hasBlocked,
        reason: hasBlocked ? `SKU bloqueado: ${blockedSku}` : undefined,
    };
}
function evaluateAddTag(config, order) {
    const tag = config.tag;
    const condition = config.condition || {};
    // Evaluar condición
    let matched = true;
    if (condition.min_total && order.total < condition.min_total) {
        matched = false;
    }
    if (condition.shipping_type && order.shipping?.mode !== condition.shipping_type) {
        matched = false;
    }
    return {
        matched,
        transformations: matched ? { add_tags: [tag] } : undefined,
    };
}
function evaluateMultiplyPrice(config, order) {
    const factor = config.factor || 1;
    return {
        matched: true,
        transformations: { multiply_price: factor },
    };
}
function evaluateCapStock(config, order) {
    const maxStock = config.max;
    // Esta regla se aplica más a catálogo que a órdenes
    return { matched: false };
}
function evaluateSetWarehouse(config, order) {
    const warehouseId = config.warehouse_id;
    const condition = config.condition || {};
    let matched = true;
    if (condition.state && order.shipping?.receiver_address?.state !== condition.state) {
        matched = false;
    }
    return {
        matched,
        transformations: matched ? { set_warehouse: warehouseId } : undefined,
    };
}
function evaluateMinOrderTotal(config, order) {
    const minTotal = config.min_total;
    const isBelowMin = order.total < minTotal;
    return {
        matched: isBelowMin,
        block: isBelowMin,
        reason: isBelowMin ? `Total menor al mínimo: ${order.total} < ${minTotal}` : undefined,
    };
}
function evaluateBlockShippingMethod(config, order) {
    const blockedMethods = config.methods || [];
    const shippingMethod = order.shipping?.shipping_option?.name;
    const isBlocked = blockedMethods.includes(shippingMethod);
    return {
        matched: isBlocked,
        block: isBlocked,
        reason: isBlocked ? `Método de envío bloqueado: ${shippingMethod}` : undefined,
    };
}
function evaluateGenericRule(config, order) {
    const conditions = config.conditions || [];
    const actions = config.actions || [];
    // Evaluar todas las condiciones (AND)
    const allConditionsMet = conditions.every((cond) => {
        return evaluateCondition(cond, order);
    });
    if (!allConditionsMet) {
        return { matched: false };
    }
    // Aplicar acciones
    let block = false;
    let reason;
    const transformations = {};
    for (const action of actions) {
        if (action.type === 'block') {
            block = true;
            reason = action.reason || 'Bloqueado por regla';
        }
        else if (action.type === 'add_tag') {
            transformations.add_tags = transformations.add_tags || [];
            transformations.add_tags.push(action.tag);
        }
        else if (action.type === 'set_field') {
            transformations[action.field] = action.value;
        }
    }
    return { matched: true, block, reason, transformations };
}
function evaluateCondition(condition, order) {
    const { field, operator, value } = condition;
    const fieldValue = getNestedValue(order, field);
    switch (operator) {
        case 'equals':
            return fieldValue === value;
        case 'not_equals':
            return fieldValue !== value;
        case 'contains':
            return String(fieldValue).includes(value);
        case 'greater_than':
            return fieldValue > value;
        case 'less_than':
            return fieldValue < value;
        case 'in':
            return Array.isArray(value) && value.includes(fieldValue);
        case 'not_in':
            return Array.isArray(value) && !value.includes(fieldValue);
        default:
            return false;
    }
}
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}
// ═══════════════════════════════════════════════════════════════════════════
// PLANTILLAS DE REGLAS
// ═══════════════════════════════════════════════════════════════════════════
function getRuleTemplates() {
    return [
        {
            key: 'exclude_skus',
            name: 'Excluir SKUs',
            description: 'Bloquea órdenes que contengan SKUs específicos',
            rule_type: 'inbound',
            default_config: { skus: [] },
        },
        {
            key: 'block_sku',
            name: 'Bloquear SKU',
            description: 'Bloquea órdenes con un SKU específico',
            rule_type: 'inbound',
            default_config: { sku: '' },
        },
        {
            key: 'add_tag_to_order',
            name: 'Agregar Tag',
            description: 'Agrega un tag a la orden según condiciones',
            rule_type: 'inbound',
            default_config: { tag: '', condition: {} },
        },
        {
            key: 'multiply_price',
            name: 'Multiplicar Precio',
            description: 'Multiplica el precio por un factor',
            rule_type: 'outbound',
            default_config: { factor: 1.0 },
        },
        {
            key: 'cap_stock',
            name: 'Limitar Stock',
            description: 'Limita el stock máximo publicado',
            rule_type: 'outbound',
            default_config: { max: 100 },
        },
        {
            key: 'set_warehouse',
            name: 'Asignar Depósito',
            description: 'Asigna un depósito según ubicación',
            rule_type: 'inbound',
            default_config: { warehouse_id: '', condition: {} },
        },
        {
            key: 'min_order_total',
            name: 'Mínimo de Orden',
            description: 'Bloquea órdenes menores al mínimo',
            rule_type: 'inbound',
            default_config: { min_total: 0 },
        },
        {
            key: 'block_shipping_method',
            name: 'Bloquear Método de Envío',
            description: 'Bloquea órdenes con ciertos métodos de envío',
            rule_type: 'inbound',
            default_config: { methods: [] },
        },
    ];
}
// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function parseRuleJson(ruleJson) {
    try {
        return JSON.parse(ruleJson);
    }
    catch {
        return {};
    }
}
function formatRule(rule) {
    const config = parseRuleJson(rule.rule_json);
    return {
        id: rule.id,
        integration_id: rule.integration_id,
        rule_key: rule.rule_key,
        rule_type: rule.rule_type,
        config,
        enabled: rule.enabled,
        priority: rule.priority,
        created_at: rule.created_at,
        updated_at: rule.updated_at,
    };
}
exports.default = {
    createRule,
    updateRule,
    deleteRule,
    getRulesByIntegration,
    getRuleById,
    evaluateOrderRules,
    applyRulesToOrder,
    getRuleTemplates,
};
//# sourceMappingURL=rules.js.map