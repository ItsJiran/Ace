import { z } from 'zod';
import type {
    ConfigSchemaMapType,
    ConfigStorageType,
} from '#/shared/schemas/config';
import { KeybindActionMap, KeybindButtons } from './keybinds';
import { AIProviders } from './ai';

/**
 * Default general configuration
 * These are the default configuration items that will be loaded into the system. Users can customize these through the UI,
 * and changes will be persisted to ace.config.json. The configuration includes theme settings, window behavior, and debug options.
 */

export const ConfigGeneral_V0_0_0_SchemaMap: ConfigSchemaMapType = {
    'core.theme': z
        .enum(['light', 'dark', 'system'])
        .default('system')
        .describe('The visual theme of the overlay (light, dark, or system).'),

    'core.overlay_opacity': z
        .number()
        .min(0)
        .max(1)
        .default(0.8)
        .describe('The base opacity of the transparent layer containers.'),

    'core.always_on_top': z
        .boolean()
        .default(true)
        .describe('Whether the assistant stays above all other windows.'),

    'core.debug_mode': z
        .boolean()
        .default(false)
        .describe('Enable verbose logging and visual debug helpers.'),
        
    'window.mouse_focus_enabled': z
        .boolean()
        .default(true)
        .describe(
            'Whether mouse presence/click on a window is allowed to focus and activate that window. If disabled, windows remain transparent to mouse focus behavior.',
        ),
};

export const ConfigGeneral_V0_0_0_Schema = z.object(ConfigGeneral_V0_0_0_SchemaMap);
export type ConfigGeneral_V0_0_0_Type = z.infer<typeof ConfigGeneral_V0_0_0_Schema>;

export const CONFIG_GENERAL_VERSIONS = ['0.0.0'] as const;

export const DefaultConfigGeneral: ConfigStorageType<typeof CONFIG_GENERAL_VERSIONS> = {
    memory_uid: 'system:config:general',
    file_name: 'ace.config.json',
    version: '0.0.0',
    config: ConfigGeneral_V0_0_0_SchemaMap,
};

/**
 * Default keybinds configuration
 * These are the default keybinds that will be loaded into the system. Users can customize these through the UI,
 * and changes will be persisted to ace.keybinds.json. The keybinds include toggling overlay modes, cycling display modes,
 * and managing mouse focus for overlay windows. Each keybind is associated with an interaction intent that the system
 * listens for to trigger the corresponding action.
 */

export const ConfigKeybind_V0_0_0_SchemaMap: ConfigSchemaMapType = {
    [KeybindActionMap.toggleOverlayMode]: z
        .array(z.enum(KeybindButtons))
        .default([KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.Backslash])
        .describe('Toggle between Ambient (Pass-through) and Interactive mode.'),
    [KeybindActionMap.cycleDisplayMode]: z
        .array(z.enum(KeybindButtons))
        .default([KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.KeyD])
        .describe(
            'Cycle desktop window display mode between visible, focused-only, semi-transparent, and transparent.',
        ),
};

export const ConfigKeybind_V0_0_0_Schema = z.object(ConfigKeybind_V0_0_0_SchemaMap);
export type ConfigKeybind_V0_0_0_Type = z.infer<typeof ConfigKeybind_V0_0_0_Schema>;

export const CONFIG_KEYBIND_VERSIONS = ['0.0.0'] as const;

export const DefaultConfigKeybinds: ConfigStorageType<typeof CONFIG_KEYBIND_VERSIONS> = {
    memory_uid: 'system:config:keybinds',
    file_name: 'ace.keybinds.json',
    version: '0.0.0',
    config: ConfigKeybind_V0_0_0_SchemaMap,
};


/**
 * Default Configuration for AI Configuration
 * This configuration includes settings related to AI providers, such as the default provider to use for agent interactions. 
 * Users can customize this through the UI, and changes will be persisted to ace.ai_config.json. The configuration allows 
 * for flexibility in choosing different AI providers and managing API keys.
 * 
 * Containing default_provider and default_model, and also containing list of providers with all of the cached models that we have seen so far in the system.
 * This is useful for allowing users to set their preferred AI provider and model, and for the system to manage interactions with multiple AI providers seamlessly.
 */
export const ConfigAI_V0_0_0_SchemaMap: ConfigSchemaMapType = {
    'ai.default_provider': z
        .string()
        .default(AIProviders.OPENAI)
        .describe('The default AI provider to use for agent interactions.'),
    'ai.default_model': z
        .string()
        .default('gpt-3.5-turbo')
        .describe('The default AI model to use for agent interactions.'),
    'ai.providers_models' : z
        .record(z.enum(AIProviders), z.array(z.string()))
        .default({
            [AIProviders.OPENAI]: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-32k'],
            [AIProviders.GOOGLE]: ['gpt-3.5-turbo', 'gpt-4'],
            [AIProviders.ANTHROPIC]: ['claude-2', 'claude-instant-100k'],
        })
        .describe('A mapping of AI providers to their available models.'),
};

export const ConfigAI_V0_0_0_Schema = z.object(ConfigAI_V0_0_0_SchemaMap);
export type ConfigAI_V0_0_0_Type = z.infer<typeof ConfigAI_V0_0_0_Schema>;

// ---- V0.0.1: Rich provider detail (models + model_provider_type + gateway) ----

const ProviderDetailSchema = z.object({
    models: z
        .array(z.string())
        .describe('List of available model names for this provider.'),
    model_provider_type: z
        .string()
        .default('openai')
        .describe('The LangChain driver used as the base wrapper (openai, anthropic, google).'),
    gateway: z
        .string()
        .url()
        .or(z.literal(''))
        .default('')
        .describe('Custom HTTP Gateway/Base URL for this provider (optional).'),
    api_key: z
        .string()
        .default('')
        .describe('API key for this provider. Leave empty to rely on system keyring / env vars.'),
});

export const ConfigAI_V0_0_1_SchemaMap = {
    'ai.default_provider': z
        .string()
        .default('openai')
        .describe('The currently active provider.'),

    'ai.default_model': z
        .string()
        .default('gpt-4o')
        .describe('The currently active model.'),

    'ai.providers': z
        .record(z.string(), ProviderDetailSchema)
        .default({
            openai: {
                models: ['gpt-4o', 'gpt-4o-mini'],
                model_provider_type: 'openai',
                gateway: 'https://api.openai.com/v1',
                api_key: '',
            },
            anthropic: {
                models: ['claude-3-5-sonnet'],
                model_provider_type: 'anthropic',
                gateway: '',
                api_key: '',
            },
            google: {
                models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
                model_provider_type: 'google',
                gateway: '',
                api_key: '',
            },
            deepseek: {
                models: ['deepseek-chat', 'deepseek-coder'],
                model_provider_type: 'openai',
                gateway: 'https://api.deepseek.com/v1',
                api_key: '',
            },
            ollama: {
                models: ['llama3.1', 'qwen2.5-coder', 'deepseek-r1:8b'],
                model_provider_type: 'openai',
                gateway: 'http://localhost:11434/v1',
                api_key: '',
            },
        })
        .describe('Complete configuration for all available AI providers.'),
} satisfies ConfigSchemaMapType;

export const ConfigAI_V0_0_1_Schema = z.object(ConfigAI_V0_0_1_SchemaMap);
export type ConfigAI_V0_0_1_Type = z.infer<typeof ConfigAI_V0_0_1_Schema>;

export const CONFIG_AI_VERSIONS = ['0.0.0', '0.0.1'] as const;

export const DefaultConfigAI: ConfigStorageType<typeof CONFIG_AI_VERSIONS> = {
    memory_uid: 'system:config:ai',
    file_name: 'ace.ai_config.json',
    version: '0.0.1',
    config: ConfigAI_V0_0_1_SchemaMap,
};
