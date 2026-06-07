import { z } from 'zod';
import { KeybindActionSchema, KeybindCombosSchema } from './keybinds';

export const ConfigItemSchema = z.object({
    key: z.string(),
    value: z.any(),
    category: z.string().optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
});
export type ConfigItemType = z.infer<typeof ConfigItemSchema>;

export const ConfigItemKeybindSchema = ConfigItemSchema.extend({
    key: KeybindActionSchema,
    value: KeybindCombosSchema,
});
export type ConfigItemKeybindType = z.infer<typeof ConfigItemKeybindSchema>;

export const ConfigSchemaMapSchema = z.record(
    z.string(),
    z.custom<z.ZodTypeAny>((value) => value instanceof z.ZodType),
);
export type ConfigSchemaMapType = z.infer<typeof ConfigSchemaMapSchema>;

export const ConfigFileSchema = z.object({
    version: z.union([z.number(), z.string()]),
    config: z.record(z.string(), z.unknown()),
});
export type ConfigFileType = z.infer<typeof ConfigFileSchema>;

export const ConfigStorageSchema = z.object({
    memory_uid: z.string(),
    file_name: z.string(),
    version: z.union([z.number(), z.string()]),
    config: ConfigSchemaMapSchema,
});
export type ConfigStorageType<TVersions extends readonly string[] = readonly string[]> = z.infer<typeof ConfigStorageSchema> & {
    version: TVersions[number];
};

export const ConfigStorageMapSchema = z.record(
    z.string(),
    ConfigStorageSchema,
);
export type ConfigStorageMapType = z.infer<typeof ConfigStorageMapSchema>;

/** Derive the runtime config data type from a DefaultConfig's schema map. */
export type InferConfigData<T extends ConfigStorageType> =
    z.infer<z.ZodObject<Extract<T['config'], Record<string, z.ZodTypeAny>>>>;
