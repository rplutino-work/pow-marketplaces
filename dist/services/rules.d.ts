/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RULES SERVICE - Reglas de Negocio
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gestiona reglas de negocio para transformación de órdenes y catálogo.
 * Usa schema de producción donde reglas se guardan en rule_key + rule_json.
 */
interface RuleConfig {
    conditions?: any;
    actions?: any;
    metadata?: any;
    [key: string]: any;
}
interface RuleEvaluationResult {
    should_block: boolean;
    flag_reason?: string;
    applied_rules: string[];
    transformations: Record<string, any>;
}
export declare function createRule(data: {
    integration_id: string;
    rule_key: string;
    rule_type: string;
    rule_config: RuleConfig;
    enabled?: boolean;
    priority?: number;
}): Promise<{
    id: any;
    integration_id: any;
    rule_key: any;
    rule_type: any;
    config: RuleConfig;
    enabled: any;
    priority: any;
    created_at: any;
    updated_at: any;
}>;
export declare function updateRule(ruleId: string, data: {
    rule_key?: string;
    rule_type?: string;
    rule_config?: RuleConfig;
    enabled?: boolean;
    priority?: number;
}): Promise<{
    id: any;
    integration_id: any;
    rule_key: any;
    rule_type: any;
    config: RuleConfig;
    enabled: any;
    priority: any;
    created_at: any;
    updated_at: any;
}>;
export declare function deleteRule(ruleId: string): Promise<void>;
export declare function getRulesByIntegration(integrationId: string): Promise<{
    id: any;
    integration_id: any;
    rule_key: any;
    rule_type: any;
    config: RuleConfig;
    enabled: any;
    priority: any;
    created_at: any;
    updated_at: any;
}[]>;
export declare function getRuleById(ruleId: string): Promise<{
    id: any;
    integration_id: any;
    rule_key: any;
    rule_type: any;
    config: RuleConfig;
    enabled: any;
    priority: any;
    created_at: any;
    updated_at: any;
} | null>;
export declare function evaluateOrderRules(integrationId: string, order: any, ruleType?: string): Promise<RuleEvaluationResult>;
export declare function applyRulesToOrder(integrationId: string, order: any): Promise<{
    order: any;
    result: RuleEvaluationResult;
}>;
export declare function getRuleTemplates(): ({
    key: string;
    name: string;
    description: string;
    rule_type: string;
    default_config: {
        skus: never[];
        sku?: undefined;
        tag?: undefined;
        condition?: undefined;
        factor?: undefined;
        max?: undefined;
        warehouse_id?: undefined;
        min_total?: undefined;
        methods?: undefined;
    };
} | {
    key: string;
    name: string;
    description: string;
    rule_type: string;
    default_config: {
        sku: string;
        skus?: undefined;
        tag?: undefined;
        condition?: undefined;
        factor?: undefined;
        max?: undefined;
        warehouse_id?: undefined;
        min_total?: undefined;
        methods?: undefined;
    };
} | {
    key: string;
    name: string;
    description: string;
    rule_type: string;
    default_config: {
        tag: string;
        condition: {};
        skus?: undefined;
        sku?: undefined;
        factor?: undefined;
        max?: undefined;
        warehouse_id?: undefined;
        min_total?: undefined;
        methods?: undefined;
    };
} | {
    key: string;
    name: string;
    description: string;
    rule_type: string;
    default_config: {
        factor: number;
        skus?: undefined;
        sku?: undefined;
        tag?: undefined;
        condition?: undefined;
        max?: undefined;
        warehouse_id?: undefined;
        min_total?: undefined;
        methods?: undefined;
    };
} | {
    key: string;
    name: string;
    description: string;
    rule_type: string;
    default_config: {
        max: number;
        skus?: undefined;
        sku?: undefined;
        tag?: undefined;
        condition?: undefined;
        factor?: undefined;
        warehouse_id?: undefined;
        min_total?: undefined;
        methods?: undefined;
    };
} | {
    key: string;
    name: string;
    description: string;
    rule_type: string;
    default_config: {
        warehouse_id: string;
        condition: {};
        skus?: undefined;
        sku?: undefined;
        tag?: undefined;
        factor?: undefined;
        max?: undefined;
        min_total?: undefined;
        methods?: undefined;
    };
} | {
    key: string;
    name: string;
    description: string;
    rule_type: string;
    default_config: {
        min_total: number;
        skus?: undefined;
        sku?: undefined;
        tag?: undefined;
        condition?: undefined;
        factor?: undefined;
        max?: undefined;
        warehouse_id?: undefined;
        methods?: undefined;
    };
} | {
    key: string;
    name: string;
    description: string;
    rule_type: string;
    default_config: {
        methods: never[];
        skus?: undefined;
        sku?: undefined;
        tag?: undefined;
        condition?: undefined;
        factor?: undefined;
        max?: undefined;
        warehouse_id?: undefined;
        min_total?: undefined;
    };
})[];
declare const _default: {
    createRule: typeof createRule;
    updateRule: typeof updateRule;
    deleteRule: typeof deleteRule;
    getRulesByIntegration: typeof getRulesByIntegration;
    getRuleById: typeof getRuleById;
    evaluateOrderRules: typeof evaluateOrderRules;
    applyRulesToOrder: typeof applyRulesToOrder;
    getRuleTemplates: typeof getRuleTemplates;
};
export default _default;
//# sourceMappingURL=rules.d.ts.map