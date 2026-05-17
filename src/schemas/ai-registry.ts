import { z } from 'zod';

export const AIProviderTypeSchema = z.enum([
    'openclaw',
    'openai',
    'anthropic',
    'ollama',
    'custom'
]);

export type AIProviderType = z.infer<typeof AIProviderTypeSchema>;

/**
 * AI Provider Schema
 * Defines a registered AI service endpoint (e.g. OpenClaw, OpenAI, Local LLM).
 * Each registry entry represents a potential connection source.
 */
export const AIProviderSchema = z.object({
    id: z.string().describe('Unique identifier for this provider configuration (e.g., "openclaw-main").'),
    name: z.string().describe('Display name for the UI.'),
    type: AIProviderTypeSchema,
    
    endpoint: z.string().url().describe('The base API endpoint URL.'),
    apiKey: z.string().optional().describe('API Key for authentication.'),
    
    models: z.array(z.string()).default([]).describe('List of available models from this provider.'),
    
    headers: z.record(z.string()).optional().describe('Custom headers for the connection.'),
    
    isEnabled: z.boolean().default(true),
});

export type AIProvider = z.infer<typeof AIProviderSchema>;
