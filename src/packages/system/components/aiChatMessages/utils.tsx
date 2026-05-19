import type React from 'react';
import { BrainCircuit, Database, ListTodo, Wrench } from 'lucide-react';

import type { AIRenderer } from '#/shared/schemas/ai';
import type { ToolChatPreview } from '#/shared/schemas/tooling';
import { RegistryEngine } from '#/engines/registry-engine';

export type AssistantSegment =
    | { kind: 'paragraph'; renderer: AIRenderer }
    | { kind: 'activity'; renderers: AIRenderer[] };

export function resolveLatestTurnSpacing(turn: { assistant_renderers?: AIRenderer[] }): string {
    const assistantCount = turn.assistant_renderers?.length ?? 0;

    if (assistantCount === 0) return 'pb-[42vh]';
    if (assistantCount <= 2) return 'pb-[24vh]';
    return 'pb-[10vh]';
}

export function buildAssistantSegments(renderers: AIRenderer[]): AssistantSegment[] {
    const segments: AssistantSegment[] = [];
    let pendingActivity: AIRenderer[] = [];

    for (const renderer of renderers) {
        if (renderer.component_slug === 'paragraph_renderer') {
            if (pendingActivity.length > 0) {
                segments.push({ kind: 'activity', renderers: pendingActivity });
                pendingActivity = [];
            }

            segments.push({ kind: 'paragraph', renderer });
            continue;
        }

        if (!shouldRenderAssistantActivity(renderer)) {
            continue;
        }

        pendingActivity.push(renderer);
    }

    if (pendingActivity.length > 0) {
        segments.push({ kind: 'activity', renderers: pendingActivity });
    }

    return segments;
}

export function shouldRenderAssistantActivity(renderer: AIRenderer): boolean {
    return getActivityCategoryKey(renderer) !== 'other';
}

export function buildActivityAccordionTitle(renderers: AIRenderer[]): string {
    const categories = collectActivityCategories(renderers);
    if (categories.length === 0) return 'Hidden Activity';
    return categories.join(' & ');
}

export function summarizeActivityRenderers(renderers: AIRenderer[]): string {
    const parts: string[] = [];
    const counts = countActivityKinds(renderers);

    if (counts.chain > 0) parts.push(`${counts.chain} chain step${counts.chain === 1 ? '' : 's'}`);
    if (counts.tool > 0) parts.push(`${counts.tool} tool step${counts.tool === 1 ? '' : 's'}`);
    if (counts.context > 0) parts.push(`${counts.context} context update${counts.context === 1 ? '' : 's'}`);
    if (counts.plan > 0) parts.push(`${counts.plan} plan update${counts.plan === 1 ? '' : 's'}`);
    if (counts.other > 0) parts.push(`${counts.other} runtime event${counts.other === 1 ? '' : 's'}`);

    const labels = renderers
        .map(getRendererSummaryLabel)
        .filter((label, index, arr) => label !== '' && arr.indexOf(label) === index)
        .slice(0, 2);

    if (parts.length === 0 && labels.length === 0) return 'Runtime activity';
    if (labels.length === 0) return parts.join(' · ');
    if (parts.length === 0) return labels.join(' · ');
    return `${parts.join(' · ')}${labels.length > 0 ? ` · ${labels.join(' · ')}` : ''}`;
}

export function getActivityCategoryKey(renderer: AIRenderer): 'chain' | 'tool' | 'context' | 'plan' | 'other' {
    if (renderer.component_slug === 'tool-renderer') return 'tool';
    if (renderer.component_slug === 'context_renderer') return 'context';
    if (renderer.component_slug === 'todo-renderer') return 'plan';
    if (renderer.component_slug === 'agent-activity-renderer') return 'chain';

    if (renderer.component_slug === 'event-renderer') {
        const payload = toPayloadRecord(renderer.payload);
        const action = typeof payload.action === 'string' ? payload.action : '';

        if (action.includes('context')) return 'context';
        if (action.includes('plan')) return 'plan';
        if (action.includes('tool')) return 'tool';
    }

    return 'other';
}

export function getRendererSummaryLabel(renderer: AIRenderer): string {
    if (renderer.component_slug === 'tool-renderer') {
        const payload = toPayloadRecord(renderer.payload);
        const toolSlug = typeof payload.tool_slug === 'string' ? payload.tool_slug : 'tool';
        return `Tool ${toolSlug}`;
    }

    if (renderer.component_slug === 'agent-activity-renderer') {
        const payload = toPayloadRecord(renderer.payload);
        const activeAgent = typeof payload.active_agent === 'string' ? payload.active_agent : '';
        const role = activeAgent || (typeof payload.role === 'string' ? payload.role : 'agent');
        const action = typeof payload.action === 'string' ? payload.action : undefined;
        return action ? `${capitalize(role)} ${action}` : capitalize(role);
    }

    if (renderer.component_slug === 'context_renderer') return 'Context';
    if (renderer.component_slug === 'todo-renderer') return 'Plan';

    if (renderer.component_slug === 'event-renderer') {
        const payload = toPayloadRecord(renderer.payload);
        const action = typeof payload.action === 'string' ? payload.action : 'event';
        return capitalize(action);
    }

    return renderer.component_slug.replaceAll('_', ' ').replaceAll('-', ' ');
}

export function buildActivityNarrative(renderer: AIRenderer): string {
    const payload = toPayloadRecord(renderer.payload);
    const status = renderer.status ?? 'loading';
    const eventType = typeof payload.event_type === 'string' ? payload.event_type : '';

    if (renderer.component_slug === 'tool-renderer') {
        const toolSlug = typeof payload.tool_slug === 'string' ? payload.tool_slug : 'tool';
        const action = typeof payload.action === 'string' ? payload.action : undefined;
        const result = toPayloadRecord(payload.result);
        const resultHint = typeof result.summary === 'string'
            ? result.summary
            : typeof result.message === 'string'
                ? result.message
                : typeof payload.error_message === 'string'
                    ? payload.error_message
                    : undefined;

        if (eventType === 'tool_started') {
            return `Saya mulai mengeksekusi tool ${toolSlug} untuk ${action ?? 'membantu langkah ini'}.`;
        }

        if (status === 'completed' || eventType === 'tool_finished' || eventType === 'tool_completed') {
            return resultHint
                ? `Saya menyelesaikan eksekusi tool ${toolSlug} untuk ${action ?? 'task ini'}: ${resultHint}`
                : `Saya sudah selesai mengeksekusi tool ${toolSlug} untuk ${action ?? 'task ini'}.`;
        }

        if (status === 'error' || eventType === 'tool_failed') {
            return `Saya gagal mengeksekusi tool ${toolSlug}${resultHint ? `: ${resultHint}` : '.'}`;
        }

        return `Saya sedang memproses hasil dari tool ${toolSlug} untuk ${action ?? 'task ini'}.`;
    }

    if (renderer.component_slug === 'agent-activity-renderer') {
        const activeAgent = typeof payload.active_agent === 'string' ? payload.active_agent : '';
        const role = activeAgent || (typeof payload.role === 'string' ? payload.role : 'agent');
        const action = typeof payload.action === 'string' ? payload.action : 'langkah berikutnya';
        const profileName = typeof payload.profile_name === 'string' ? payload.profile_name : role;

        if (eventType === 'chain_started' || eventType === 'agent_started') {
            return `Saya mulai menjalankan ${capitalize(role)} untuk ${action}.`;
        }

        if (eventType === 'chain_stream' || eventType === 'agent_progress') {
            return `Saya sedang memproses ${capitalize(role)} untuk ${action}.`;
        }

        if (status === 'completed' || eventType === 'chain_finished' || eventType === 'agent_finished') {
            return `Saya selesai menjalankan ${capitalize(role)} untuk ${action}.`;
        }

        if (status === 'error' || eventType === 'chain_failed' || eventType === 'agent_failed') {
            return `Saya mengalami kendala saat ${capitalize(role)} menangani ${action}.`;
        }

        return `Saya sedang mempertimbangkan langkah berikutnya melalui ${profileName} untuk ${action}.`;
    }

    if (renderer.component_slug === 'context_renderer') {
        const action = typeof payload.action === 'string' ? payload.action : 'update';
        const title = typeof payload.title === 'string' ? payload.title : 'context';
        return `Saya sedang memperbarui context untuk ${title} dengan aksi ${action}.`;
    }

    if (renderer.component_slug === 'todo-renderer') {
        const title = typeof payload.title === 'string' ? payload.title : 'rencana kerja';
        return `Saya sedang menyusun atau memperbarui ${title}.`;
    }

    if (renderer.component_slug === 'event-renderer') {
        const action = typeof payload.action === 'string' ? payload.action : 'runtime event';
        return `Saya sedang menjalankan ${action}.`;
    }

    return 'Saya sedang menjalankan langkah internal.';
}

export function buildToolPreview(renderer: AIRenderer, result: Record<string, unknown>): React.ReactNode | null {
    const payload = toPayloadRecord(renderer.payload);
    const toolSlug = typeof payload.tool_slug === 'string' ? payload.tool_slug : 'tool';
    const packageRef = typeof payload.package_ref === 'string' ? payload.package_ref : '';

    const registryPreview = buildRegisteredToolPreview({
        packageRef,
        toolSlug,
        action: typeof payload.action === 'string' ? payload.action : undefined,
        invocation: toPayloadRecord(payload.payload),
        result,
        status: renderer.status,
    });
    if (registryPreview) {
        return registryPreview;
    }

    if (toolSlug === 'update_session_plan') {
        const planItems = Array.isArray(result.plan_items) ? result.plan_items.filter((item): item is string => typeof item === 'string') : [];
        if (planItems.length === 0) return null;

        return (
            <div className="space-y-1">
                {planItems.slice(0, 4).map((item, index) => (
                    <div key={`${index}:${item}`} className="system-chat-preview-copy">
                        {index + 1}. {item}
                    </div>
                ))}
            </div>
        );
    }

    const resultPayload = toPayloadRecord(result.result);
    return buildFsToolPreview(Object.keys(resultPayload).length > 0 ? resultPayload : result, '', '');
}

export function buildFsToolPreview(payload: Record<string, unknown>, packageRef: string, toolSlug: string): React.ReactNode | null {
    const action = typeof payload.action === 'string' ? payload.action : '';
    const path = typeof payload.path === 'string' ? payload.path : '';
    const absolutePath = typeof payload.absolute_path === 'string' ? payload.absolute_path : '';

    if (!action && toolSlug !== 'fs-tool' && toolSlug !== 'fs_tool') {
        return null;
    }

    if (action === 'read_file') {
        const content = typeof payload.content === 'string' ? payload.content : '';
        return (
            <div className="space-y-2">
                <div className="system-chat-preview-title">{packageRef ? `${packageRef}/` : ''}{toolSlug || 'fs_tool'} · read_file</div>
                <div className="system-chat-preview-subtitle">{absolutePath || path}</div>
                {content ? <pre className="system-chat-code-block">{content}</pre> : null}
            </div>
        );
    }

    if (action === 'list_directory') {
        const items = Array.isArray(payload.items) ? payload.items : [];
        return (
            <div className="space-y-2">
                <div className="system-chat-preview-title">{packageRef ? `${packageRef}/` : ''}{toolSlug || 'fs_tool'} · list_directory</div>
                <div className="system-chat-preview-subtitle">{absolutePath || path}</div>
                <div className="space-y-1">
                    {items.slice(0, 5).map((item, index) => {
                        const entry = toPayloadRecord(item);
                        const name = typeof entry.name === 'string' ? entry.name : `item-${index + 1}`;
                        const isDirectory = entry.is_directory === true;
                        return <div key={`${index}:${name}`} className="system-chat-preview-copy">{isDirectory ? 'DIR' : 'FILE'} {name}</div>;
                    })}
                </div>
            </div>
        );
    }

    if (action === 'write_file' || action === 'create_directory' || action === 'delete_file') {
        return (
            <div className="space-y-1">
                <div className="system-chat-preview-title">{packageRef ? `${packageRef}/` : ''}{toolSlug || 'fs_tool'} · {action}</div>
                <div className="system-chat-preview-subtitle">{absolutePath || path}</div>
            </div>
        );
    }

    return null;
}

export function resolveToolResultMemoryUid(payload: Record<string, unknown>, result: Record<string, unknown>): string {
    if (typeof result.result_memory_uid === 'string') return result.result_memory_uid;

    const nestedResult = toPayloadRecord(result.result);
    if (typeof nestedResult.result_memory_uid === 'string') return nestedResult.result_memory_uid;
    if (typeof payload.result_memory_uid === 'string') return payload.result_memory_uid;
    return '';
}

export function resolveAccordionPreviewRenderer(renderers: AIRenderer[]): AIRenderer | undefined {
    return [...renderers].reverse().find((renderer) => getActivityCategoryKey(renderer) === 'plan')
        ?? renderers[renderers.length - 1];
}

export function buildRegisteredToolPreview(input: {
    packageRef: string;
    toolSlug: string;
    action?: string;
    invocation?: Record<string, unknown>;
    result: Record<string, unknown>;
    status?: string;
}): React.ReactNode | null {
    const { packageRef, toolSlug, action, invocation, result, status } = input;
    if (!packageRef || !toolSlug) return null;

    const entry = RegistryEngine.getDomainEntry(packageRef, 'tools', toolSlug)?.entry;
    const toolDef = entry?.implementation as {
        buildChatPreview?: (args: {
            action?: string;
            packageRef?: string;
            toolSlug?: string;
            invocation?: Record<string, unknown>;
            result: Record<string, unknown>;
            status?: string;
        }) => ToolChatPreview | null;
    } | undefined;

    if (typeof toolDef?.buildChatPreview !== 'function') return null;

    const preview = toolDef.buildChatPreview({
        action,
        packageRef,
        toolSlug,
        invocation,
        result,
        status,
    });

    return renderToolPreviewModel(preview);
}

export function renderToolPreviewModel(preview: ToolChatPreview | null): React.ReactNode | null {
    if (!preview) return null;

    const hasList = Array.isArray(preview.list_items) && preview.list_items.length > 0;
    const hasLines = Array.isArray(preview.lines) && preview.lines.length > 0;
    const hasCode = typeof preview.code_block?.content === 'string' && preview.code_block.content.length > 0;

    return (
        <div className="space-y-2">
            {preview.title ? <div className="system-chat-preview-title">{preview.title}</div> : null}
            {preview.subtitle ? <div className="system-chat-preview-subtitle">{preview.subtitle}</div> : null}
            {hasLines ? (
                <div className="space-y-1">
                    {preview.lines?.map((line, index) => (
                        <div key={`${index}:${line}`} className="system-chat-preview-copy">{line}</div>
                    ))}
                </div>
            ) : null}
            {hasList ? (
                <div className="space-y-1">
                    {preview.list_items?.map((item, index) => (
                        <div key={`${index}:${item.badge ?? ''}:${item.label}`} className="flex items-start gap-2">
                            {item.badge ? <span className="system-chat-preview-badge">{item.badge}</span> : null}
                            <div className="min-w-0 flex-1">
                                <div className="system-chat-preview-title">{item.label}</div>
                                {item.detail ? <div className="system-chat-preview-subtitle">{item.detail}</div> : null}
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
            {hasCode ? <pre className="system-chat-code-block">{preview.code_block?.content}</pre> : null}
        </div>
    );
}

export function resolveLastChainRenderer(renderers: AIRenderer[]): AIRenderer | undefined {
    return [...renderers].reverse().find((renderer) => getActivityCategoryKey(renderer) === 'chain');
}

export function resolveCurrentPlanItem(renderer: AIRenderer): { title?: string; detail?: string; is_complete?: boolean } | null {
    const payload = toPayloadRecord(renderer.payload);
    const todoItems = Array.isArray(payload.todo_items) ? payload.todo_items : [];
    const normalizedItems = todoItems.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));

    if (normalizedItems.length === 0) return null;

    const activeIndex = normalizedItems.findIndex((item) => item.is_complete !== true);
    return normalizedItems[activeIndex >= 0 ? activeIndex : normalizedItems.length - 1] ?? null;
}

export function formatPlanPreviewText(item: { title?: string; detail?: string; is_complete?: boolean }): string {
    const title = typeof item.title === 'string' && item.title.trim().length > 0 ? item.title : 'Untitled step';
    const detail = typeof item.detail === 'string' && item.detail.trim().length > 0 ? item.detail.trim() : '';
    const prefix = item.is_complete === true ? 'Completed' : 'Current';
    return detail ? `${prefix}: ${title} - ${detail}` : `${prefix}: ${title}`;
}

export function getRendererDebugPayload(renderer: AIRenderer): Record<string, unknown> | null {
    const payload = toPayloadRecord(renderer.payload);
    if (Object.keys(payload).length === 0) return null;
    return payload;
}

export function renderActivityIcon(renderer: AIRenderer, size: number) {
    const category = getActivityCategoryKey(renderer);
    if (category === 'tool') return <Wrench size={size} />;
    if (category === 'chain') return <BrainCircuit size={size} />;
    if (category === 'context') return <Database size={size} />;
    if (category === 'plan') return <ListTodo size={size} />;
    return <BrainCircuit size={size} />;
}

export function getRendererStableKey(renderer: AIRenderer, index: number): string {
    const payload = toPayloadRecord(renderer.payload);
    const eventKey = typeof payload.event_key === 'string' ? payload.event_key : undefined;
    return eventKey ? `${renderer.component_slug}:${eventKey}` : `${renderer.component_slug}:${index}`;
}

export function toPayloadRecord(payload: unknown): Record<string, unknown> {
    return payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
}

export function capitalize(value: string): string {
    if (!value) return value;
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function collectActivityCategories(renderers: AIRenderer[]): string[] {
    const categories: string[] = [];

    for (const renderer of renderers) {
        const category = getActivityCategoryLabel(renderer);
        if (category && !categories.includes(category)) {
            categories.push(category);
        }
    }

    return categories;
}

function countActivityKinds(renderers: AIRenderer[]) {
    return renderers.reduce((acc, renderer) => {
        const category = getActivityCategoryKey(renderer);
        if (category === 'chain') acc.chain += 1;
        else if (category === 'tool') acc.tool += 1;
        else if (category === 'context') acc.context += 1;
        else if (category === 'plan') acc.plan += 1;
        else acc.other += 1;

        return acc;
    }, {
        chain: 0,
        tool: 0,
        context: 0,
        plan: 0,
        other: 0,
    });
}

function getActivityCategoryLabel(renderer: AIRenderer): string | null {
    const category = getActivityCategoryKey(renderer);
    if (category === 'chain') return 'Agent Chaining';
    if (category === 'tool') return 'Tool Execution';
    if (category === 'context') return 'Contexting';
    if (category === 'plan') return 'Planning';
    if (category === 'other') return 'Runtime Activity';
    return null;
}