import { z } from 'zod';


export type SDKProvider = 'openai' | 'google' | 'anthropic';
export type GatewayModel = {
    id: string;
    name: string;
    context_window?: number;
    capabilities?: string[];
};

// This file defines the data structures and types for the AI Gateway configuration,
// including SDK targets, models, and various result types for connectivity and operations.
// It uses Zod for schema validation and type inference.

// Per-SDK gateway target (simplified - endpoints managed by gateway server)
export const AIGatewaySDKTargetSchema = z.object({
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

export type AIGatewaySDKTarget = z.infer<typeof AIGatewaySDKTargetSchema>;

export const AIGatewayConfigSchema = z.object({
    version: z.literal(2),
    active_sdk: z.enum(['openai', 'google', 'anthropic']).nullable(),
    active_model: z.string().nullable(),
    sdks: z.object({
        openai: AIGatewaySDKTargetSchema.optional(),
        google: AIGatewaySDKTargetSchema.optional(),
        anthropic: AIGatewaySDKTargetSchema.optional(),
    }),
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
