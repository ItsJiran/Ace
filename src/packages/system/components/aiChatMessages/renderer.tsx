import { memo } from 'react';
import type React from 'react';

import type { AIRenderer } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registry-types';
import { RegistryEngine } from '#/engines/registry-engine';

const Renderer = memo(function Renderer({ renderer }: { renderer: AIRenderer }) {
    const packageRef = renderer.package_ref;
    let rendererRuntime = null as ReturnType<typeof RegistryEngine.resolveRendererRuntime>;

    if (typeof renderer.component_slug === 'string' && renderer.component_slug.length > 0) {
        rendererRuntime = RegistryEngine.resolveRendererRuntime(renderer.component_slug);
    }

    if (!rendererRuntime && packageRef && typeof renderer.component_slug === 'string') {
        rendererRuntime = RegistryEngine.resolveRendererRuntime(`${packageRef}:renderers:${renderer.component_slug}`);
    }

    const Comp = (rendererRuntime?.component as React.ComponentType<Record<string, unknown>> | undefined) ?? null;

    const baseProps: Record<string, unknown> = {
        payload: renderer.payload,
        status: renderer.status,
    };

    let renderProps: Record<string, unknown> | null = baseProps;
    const maybeHandler = rendererRuntime?.handler;
    if (typeof maybeHandler === 'function') {
        const result = (maybeHandler as AceRegistryType.RendererHandler)({
            payload: renderer.payload,
            status: renderer.status,
            component_slug: renderer.component_slug,
            package_ref: packageRef,
        });

        renderProps = result?.suppress_render
            ? null
            : {
                ...baseProps,
                ...(result?.props ?? {}),
            };
    }

    if (Comp && renderProps) {
        return <Comp {...renderProps} />;
    }

    const payload = renderer.payload;
    if (typeof payload === 'string') return <div className="system-chat-paragraph-copy px-1 py-1">{payload}</div>;
    if (payload && typeof payload === 'object') {
        const text = 'text' in payload && typeof payload.text === 'string' ? payload.text : JSON.stringify(payload);
        return <div className="system-chat-paragraph-copy px-1 py-1">{text}</div>;
    }

    return null;
});

export default Renderer;