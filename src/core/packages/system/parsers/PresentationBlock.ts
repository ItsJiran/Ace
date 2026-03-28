import type { AceRegistryType } from '#/schemas/registryTypes';
import { getBlockPayloadAs } from '#/schemas/parser';
import type { BaseBlock, ParserBlockHandler, ParserBlockValidator } from '#/schemas/parser';

type PresentationFormat = 'list' | 'table' | 'card' | 'markdown' | string;
const DEFAULT_PRESENTATION_PACKAGE_REF = 'itsjiran/ace-system';

export interface PresentationPayload {
    package_ref?: string;
    component_slug: string;
    memory_uid?: string;
    props?: Record<string, unknown>;
    format?: PresentationFormat;
}

/** Internal block shape used by this parser implementation. */
export interface PresentationBlock extends BaseBlock {
    block_slug: 'presentation';
    package_ref?: string;
    component_slug: string;
    memory_uid?: string;
    props?: Record<string, unknown>;
    format?: PresentationFormat;
}

export function getPresentationPayload(block: BaseBlock | null | undefined): PresentationPayload | null {
    return getBlockPayloadAs<PresentationPayload>(block, 'presentation');
}

export const validator: ParserBlockValidator = ({ isComplete, payload_json, payload_parse_error }) => {
    if (!isComplete) return;
    if (!payload_json) {
        throw new Error(payload_parse_error || 'presentation block requires a valid JSON payload');
    }

    const componentSlug = typeof payload_json.component_slug === 'string' ? payload_json.component_slug.trim() : '';
    const memoryUid = typeof payload_json.memory_uid === 'string' ? payload_json.memory_uid.trim() : '';

    if (!componentSlug) {
        throw new Error('presentation block requires a non-empty component_slug');
    }

    if (!memoryUid) {
        throw new Error('presentation block requires memory_uid');
    }

    return {
        ...payload_json,
        package_ref: typeof payload_json.package_ref === 'string' ? payload_json.package_ref.trim() || DEFAULT_PRESENTATION_PACKAGE_REF : DEFAULT_PRESENTATION_PACKAGE_REF,
        component_slug: componentSlug,
        memory_uid: memoryUid || undefined,
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
    description: 'Embed a registered component reference for client-side rendering. Resolves via RegistryEngine on the client.',
    block_schema: {
        purpose: 'Embed a reference to a registered UI component. The client resolves the component slug via RegistryEngine and renders it, optionally bound to a context memory payload.',
        requiredFields: '"component_slug" — the registered component slug (e.g. "ai_output_list"), "memory_uid" — target memory uid containing the render payload envelope.',
        optionalFields: '"package_ref" (package namespace for lookup, default: "itsjiran/ace-system"), "props" (inline prop overrides), "format" (hint: "list" | "table" | "card" | "markdown")',
        triggerConditions: [
            'AI wants to display tool results, data lists, or structured information to the user',
            'AI needs to show search results, file lists, or database records in a formatted view',
            'AI intends to render a complex UI component that requires client-side interactivity',
            'Tool execution returns data that should be visualized in a specific format',
            'AI wants to present information using a table, card grid, or other specialized layout',
        ],
        promptExamples: [
            'Show the search results in a list format',
            'Display the file browser results in a table',
            'I want to see the configuration options in a card layout',
            'Present the query results to the user in a readable format',
            'Render the tool output as a markdown document',
            'Show the data in a sortable table view',
        ],
        payloadNote: [
            'The component reference is resolved via RegistryEngine.resolveEntry("{pkg}:components:{slug}").',
            'The client loads memory by memory_uid and passes envelope payload to the target component.',
            'The block is non-interrupting — the stream continues while the client renders the component.',
        ],
        exampleLines: [
            '  <presentation>',
            '  {"package_ref":"itsjiran/ace-system","component_slug":"ai_output_list","memory_uid":"system:session:abc:tool_result:1","format":"list"}',
            '  </presentation>',
            '',
            '  <presentation>',
            '  {"component_slug":"ai_data_table","memory_uid":"system:session:abc:tool_schema:1","props":{"title":"Results"},"format":"table"}',
            '  </presentation>',
        ],
    },
};

export const handler: ParserBlockHandler = ({ body, payload_json, payload_parse_error, isComplete, result, emit_result }) => {
    const json = payload_json;

    const packageRef = typeof json?.package_ref === 'string' ? json.package_ref.trim() || DEFAULT_PRESENTATION_PACKAGE_REF : DEFAULT_PRESENTATION_PACKAGE_REF;
    const componentSlug = typeof json?.component_slug === 'string' ? json.component_slug.trim() : '';
    const memoryUid = typeof json?.memory_uid === 'string' ? json.memory_uid.trim() || undefined : undefined;
    const props =
        json?.props && typeof json.props === 'object' && !Array.isArray(json.props)
            ? (json.props as Record<string, unknown>)
            : undefined;
    const format = typeof json?.format === 'string' ? json.format.trim() || undefined : undefined;

    if (isComplete && (!componentSlug || !memoryUid)) {
        emit_result?.({
            event_name: 'presentation_block_invalid',
            block_slug: 'presentation',
            error_message: 'presentation block requires component_slug and memory_uid.',
            component_slug: componentSlug,
            memory_uid: memoryUid,
        });
        return;
    }

    const block: PresentationBlock = {
        block_slug: 'presentation',
        package_ref: packageRef,
        component_slug: componentSlug,
        memory_uid: memoryUid,
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
        block_slug: 'presentation',
        package_ref: packageRef,
        component_slug: componentSlug,
        memory_uid: memoryUid,
        props,
        format,
    });
};
