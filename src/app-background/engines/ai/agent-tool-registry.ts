import { tool as defineTool } from 'langchain';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';

import type { AceRegistryType } from '#/shared/schemas/registry-types';
import type { RegistryDomainEntry } from '#/shared/schemas/registry';
import { RegistryEngine } from '#/shared/engines/registry-engine';

type RegistryToolEntry = RegistryDomainEntry & {
	implementation?: unknown;
	metadata?: AceRegistryType.Tool;
};

type RegistryToolImplementation = (
	input: Record<string, unknown>,
	context: {
		package_name: string;
		slug: string;
		metadata: AceRegistryType.Tool;
	},
) => Promise<unknown> | unknown;

function resolveParameterSchema(
	parameter: NonNullable<AceRegistryType.Tool['parameters']>['properties'][string],
) {
	let schema: z.ZodTypeAny;

	switch (parameter.type) {
		case 'number':
			schema = z.number();
			break;
		case 'boolean':
			schema = z.boolean();
			break;
		case 'array':
			schema = z.array(z.unknown());
			break;
		case 'object':
			schema = z.record(z.string(), z.unknown());
			break;
		case 'string':
		default:
			schema = z.string();
			break;
	}

	if (parameter.enum?.length && parameter.type === 'string') {
		schema = z.enum(parameter.enum as [string, ...string[]]);
	}

	if (parameter.description) {
		schema = schema.describe(parameter.description);
	}

	return schema;
}

function resolveToolSchema(parameters?: AceRegistryType.Tool['parameters']) {
	if (!parameters?.properties) {
		return z.object({});
	}

	const shape: Record<string, z.ZodTypeAny> = {};
	for (const [key, parameter] of Object.entries(parameters.properties)) {
		const baseSchema = resolveParameterSchema(parameter);
		shape[key] = parameters.required?.includes(key) ? baseSchema : baseSchema.optional();
	}

	return z.object(shape);
}

function wrapRegistryTool(
	package_name: string,
	slug: string,
	entry: RegistryToolEntry,
): StructuredToolInterface | null {
	const implementation = entry.implementation;
	const metadata = entry.metadata ?? { name: slug, slug };

	if (
		implementation &&
		typeof implementation === 'object' &&
		'invoke' in implementation &&
		'name' in implementation
	) {
		return implementation as StructuredToolInterface;
	}

	if (typeof implementation !== 'function') {
		return null;
	}

	const schema = resolveToolSchema(metadata.parameters);
	const name = metadata.slug || slug;
	const description =
		metadata.description || `Tool from ${package_name} for ${metadata.name || slug}.`;
	const runner = implementation as RegistryToolImplementation;

	return defineTool(
		async (input) => {
			const result = await runner(input as Record<string, unknown>, {
				package_name,
				slug,
				metadata,
			});

			if (typeof result === 'string') {
				return result;
			}

			return JSON.stringify(result ?? null, null, 2);
		},
		{
			name,
			description,
			schema,
		},
	);
}

export function resolveAgentToolsFromRegistry() {
	const toolsByName = new Map<string, StructuredToolInterface>();

	for (const pkg of RegistryEngine.getPackages()) {
		const tools = pkg.domains.tools;
		if (!tools) {
			continue;
		}

		for (const [slug, rawEntry] of Object.entries(tools)) {
			const toolEntry = rawEntry as RegistryToolEntry;
			const resolvedTool = wrapRegistryTool(pkg.manifest.package_name, slug, toolEntry);
			if (!resolvedTool) {
				continue;
			}

			toolsByName.set(resolvedTool.name, resolvedTool);
		}
	}

	return Array.from(toolsByName.values());
}