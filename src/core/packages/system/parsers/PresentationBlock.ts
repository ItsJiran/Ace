import type { AceRegistryType } from '#/schemas/registryTypes';
import type { BaseBlock, ParserBlockHandler, ParserBlockValidator } from '#/schemas/parser';

type PresentationFormat = 'list' | 'table' | 'card' | 'markdown' | string;

/** Internal block shape used by this parser implementation. */
interface PresentationBlock extends BaseBlock {
    type: 'presentation';
    package_ref?: string;
    component_slug: string;
    memory_key?: string;
    props?: Record<string, unknown>;
    format?: PresentationFormat;
}

export const validator: ParserBlockValidator = ({ isComplete, payload_json, payload_parse_error }) => {
    if (!isComplete) return;
    if (!payload_json) {
        throw new Error(payload_parse_error || 'presentation block requires a valid JSON payload');
    }

    return {
        ...payload_json,
        package_ref: typeof payload_json.package_ref === 'string' ? payload_json.package_ref.trim() || undefined : undefined,
        component_slug: typeof payload_json.component_slug === 'string' ? payload_json.component_slug.trim() : '',
        memory_key: typeof payload_json.memory_key === 'string' ? payload_json.memory_key.trim() || undefined : undefined,
        props:
            payload_json.props && typeof payload_json.props === 'object' && !Array.isArray(payload_json.props)
                ? payload_json.props
                : undefined,
        format: typeof payload_json.format === 'string' ? payload_json.format.trim() || undefined : undefined,
    };
};

export const registry: AceRegistryType.Parser = {
    name: 'presentation',
    slug: 'presentation',
    tag_name: 'presentation',
    description: 'Embed a registered component reference for client-side rendering. Resolves via RegistryEngine on the client.',
    block_schema: {
        purpose: 'Embed a reference to a registered UI component. The client resolves the component slug via RegistryEngine and renders it, optionally bound to a context memory payload.',
        requiredFields: '"component_slug" — the registered component slug (e.g. "ai_output_list").',
        optionalFields: '"package_ref" (package namespace for lookup, default: "itsjiran/ace-system"), "memory_key" (bind a context memory payload as the component\'s data), "props" (inline prop overrides), "format" (hint: "list" | "table" | "card" | "markdown")',
        payloadNote: [
            'The component reference is resolved via RegistryEngine.resolveEntry("{pkg}:components:{slug}").',
            'If memory_key is provided the client loads the corresponding context memory and passes it as data props.',
            'The block is non-interrupting — the stream continues while the client renders the component.',
        ],
        exampleLines: [
            '  <presentation>',
            '  {"package_ref":"itsjiran/ace-system","component_slug":"ai_output_list","memory_key":"system:session:abc:tool_result:1","format":"list"}',
            '  </presentation>',
            '',
            '  <presentation>',
            '  {"component_slug":"ai_data_table","props":{"title":"Results"},"format":"table"}',
            '  </presentation>',
        ],
    },
};

export const handler: ParserBlockHandler = ({ body, payload_json, payload_parse_error, isComplete, result, emit_result }) => {
    const json = payload_json;

    const packageRef = typeof json?.package_ref === 'string' ? json.package_ref.trim() || undefined : undefined;
    const componentSlug = typeof json?.component_slug === 'string' ? json.component_slug.trim() : '';
    const memoryKey = typeof json?.memory_key === 'string' ? json.memory_key.trim() || undefined : undefined;
    const props =
        json?.props && typeof json.props === 'object' && !Array.isArray(json.props)
            ? (json.props as Record<string, unknown>)
            : undefined;
    const format = typeof json?.format === 'string' ? json.format.trim() || undefined : undefined;

    const block: PresentationBlock = {
        type: 'presentation',
        package_ref: packageRef,
        component_slug: componentSlug,
        memory_key: memoryKey,
        props,
        format,
        payload_raw: body,
        payload_json: json,
        payload_parse_error,
        is_complete: isComplete,
    };

    result.blocks.push(block);

    if (!isComplete) return;

    // Emit the parsed presentation reference so stream consumers and the
    // interaction loop can observe it. No interrupt — the stream continues
    // while the client resolves and renders the component.
    emit_result?.({
        event_name: 'presentation_block_resolved',
        block_type: 'presentation',
        package_ref: packageRef,
        component_slug: componentSlug,
        memory_key: memoryKey,
        props,
        format,
    });
};
