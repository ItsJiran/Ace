import { z } from 'zod';

// This file defines the data structures and types for the AI Gateway configuration,
// including SDK targets, models, and various result types for connectivity and operations.
// It uses Zod for schema validation and type inference.

export type AIProvider = 'openai' | 'google' | 'anthropic';
export type AIGatewayModel = {
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
            context_window: z.union([z.number(), z.null()]).optional().transform((v) => v ?? undefined),
            capabilities: z.union([z.array(z.string()), z.null()]).optional().transform((v) => v ?? undefined),
        })
    ).default([]),
});

// This file defines the data structures and types for the AI Gateway configuration,
// including SDK targets, models, and various result types for connectivity and operations.
// It uses Zod for schema validation and type inference.

export type AIGatewayProviderTarget = z.infer<typeof AIGatewayProviderTargetSchema>;
export type AIGatewaySDKTarget = AIGatewayProviderTarget;

// This file defines the data structures and types for the AI Gateway configuration,
// including SDK targets, models, and various result types for connectivity and operations.
// It uses Zod for schema validation and type inference.

export const AIGatewayConfigSchema = z.object({
    version: z.literal(2),
    providers: z.object({
        openai: AIGatewayProviderTargetSchema.optional(),
        google: AIGatewayProviderTargetSchema.optional(),
        anthropic: AIGatewayProviderTargetSchema.optional(),
    }).optional(),
}).transform((input) => {
    const providers = input.providers ?? input.sdks ?? {};
    return {
        version: input.version,
        providers: {
            openai: providers.openai,
            google: providers.google,
            anthropic: providers.anthropic,
        },
    };
});

// This file defines the data structures and types for the AI Gateway configuration,
// including SDK targets, models, and various result types for connectivity and operations.
// It uses Zod for schema validation and type inference.

export type AIGatewayConfig = z.infer<typeof AIGatewayConfigSchema>;
