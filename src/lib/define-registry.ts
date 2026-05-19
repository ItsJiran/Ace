import type { AceRegistryType } from '#/shared/schemas/registry-types';

type RegistryAttachment<TRegistry> = {
	registry: TRegistry;
};

function attachRegistry<TImplementation extends object, TRegistry>(
	implementation: TImplementation,
	registry: TRegistry,
): TImplementation & RegistryAttachment<TRegistry> {
	return Object.assign(implementation, { registry });
}

export function defineComponent<TImplementation extends object>(
	implementation: TImplementation,
	registry: AceRegistryType.Component,
) {
	return attachRegistry(implementation, registry);
}

export function defineWindow<TImplementation extends object>(
	implementation: TImplementation,
	registry: AceRegistryType.Window,
) {
	return attachRegistry(implementation, registry);
}

export function defineWidget<TImplementation extends object>(
	implementation: TImplementation,
	registry: AceRegistryType.Widget,
) {
	return attachRegistry(implementation, registry);
}

export function defineTool<TImplementation extends object>(
	implementation: TImplementation,
	registry: AceRegistryType.Tool,
) {
	return attachRegistry(implementation, registry);
}

export function defineFeature<TImplementation extends object>(
	implementation: TImplementation,
	registry: AceRegistryType.Feature,
) {
	return attachRegistry(implementation, registry);
}

export function defineProcess<TImplementation extends object>(
	implementation: TImplementation,
	registry: AceRegistryType.Process,
) {
	return attachRegistry(implementation, registry);
}

export function definePipeline<TImplementation extends object>(
	implementation: TImplementation,
	registry: AceRegistryType.Pipeline,
) {
	return attachRegistry(implementation, registry);
}

export function defineRenderer<TImplementation extends object>(
	implementation: TImplementation,
	registry: AceRegistryType.Renderer,
) {
	return attachRegistry(implementation, registry);
}