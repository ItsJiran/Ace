import { z } from 'zod';


export type SDKProvider = 'openai' | 'google' | 'anthropic';
export type AIProvider = SDKProvider;
export type GatewayModel = {
    id: string;
    name: string;
    context_window?: number;
    capabilities?: string[];
};

// This file defines the data structures and types for the AI Gateway configuration,
// including SDK targets, models, and various result types for connectivity and operations.
// It uses Zod for schema validation and type inference.

export const AIGatewayProviderTargetSchema = z.object({
    api_key: z.string().min(0),
    models: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            // Some providers return `null` for unknown context windows.
            // Normalize null -> undefined so older stored files remain readable.
            context_window: z.union([z.number(), z.null()]).optional().transform((v) => v ?? undefined),
            // Keep tolerant parsing for partially populated provider payloads.
            capabilities: z.union([z.array(z.string()), z.null()]).optional().transform((v) => v ?? undefined),
        })
    ).default([]),
});

// Legacy alias retained for compatibility with the existing UI/config layer.
export const AIGatewaySDKTargetSchema = AIGatewayProviderTargetSchema;

export type AIGatewayProviderTarget = z.infer<typeof AIGatewayProviderTargetSchema>;
export type AIGatewaySDKTarget = AIGatewayProviderTarget;

export const AIGatewayConfigSchema = z.object({
    version: z.literal(2),
    active_provider: z.enum(['openai', 'google', 'anthropic']).nullable().optional(),
    // Compatibility field name retained while the backend runtime is now LangGraph-first.
    active_sdk: z.enum(['openai', 'google', 'anthropic']).nullable().optional(),
    active_model: z.string().nullable(),
    providers: z.object({
        openai: AIGatewayProviderTargetSchema.optional(),
        google: AIGatewayProviderTargetSchema.optional(),
        anthropic: AIGatewayProviderTargetSchema.optional(),
    }).optional(),
    sdks: z.object({
        openai: AIGatewaySDKTargetSchema.optional(),
        google: AIGatewaySDKTargetSchema.optional(),
        anthropic: AIGatewaySDKTargetSchema.optional(),
    }).optional(),
}).transform((input) => {
    const active_provider = input.active_provider ?? input.active_sdk ?? null;
    const providers = input.providers ?? input.sdks ?? {};

    return {
        version: input.version,
        active_provider,
        active_sdk: active_provider,
        active_model: input.active_model,
        providers: {
            openai: providers.openai,
            google: providers.google,
            anthropic: providers.anthropic,
        },
        sdks: {
            openai: providers.openai,
            google: providers.google,
            anthropic: providers.anthropic,
        },
    };
});

export type AIGatewayConfig = z.infer<typeof AIGatewayConfigSchema>;

export type AIGatewayModel = {
    id: string;
    name: string;
    context_window?: number;
    capabilities?: string[];
};

export type AIGatewayConnectivityResult = {
    ok: boolean;
    latency_ms: number;
    status_code: number | null;
    error_message?: string;
};

export type AIGatewayResponseResult = {
    ok: boolean;
    latency_ms: number;
    status_code: number | null;
    response_text: string;
    error_message?: string;
};

export type AIGatewayFetchModelsResult = {
    ok: boolean;
    models: AIGatewayModel[];
    error_message?: string;
};

export type AIGatewaySidecarHealthResult = {
    ok: boolean;
    base_url: string;
    status_code: number | null;
    latency_ms: number;
    gateway_name?: string;
    gateway_contract_version?: string;
    error_message?: string;
};

export type AIGatewayRadarScanResult = {
    ok: boolean;
    scanned_range: [number, number];
    found_ports: number[];
    active_base_url: string | null;
    verified_by: string;
    error_message?: string;
};
