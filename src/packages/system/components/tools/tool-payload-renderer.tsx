import { ToolErrorRenderer } from './tool-error-renderer';
import { ToolFilesystemRenderer } from './tool-filesystem-renderer';
import { ToolWindowRenderer } from './tool-window-renderer';
import { ToolGenericRenderer } from './tool-generic-renderer';
import type { ToolRendererProps } from './tool-renderer.utils';

/**
 * Top-level tool payload dispatcher.
 *
 * Routes to a specialised renderer based on `tool_kind` (populated by
 * normalize-messages).  Falls back to the old name-based heuristic when
 * tool_kind is absent (e.g. ephemeral streaming payloads).
 */
export function ToolPayloadRenderer(props: ToolRendererProps) {
    const kind = props.record?.tool_kind;

    if (kind === 'window') return <ToolWindowRenderer {...props} />;
    if (kind === 'error') return <ToolErrorRenderer {...props} />;
    if (kind === 'filesystem') return <ToolFilesystemRenderer {...props} />;

    // Fallback: sniff tool_name for legacy / ephemeral payloads
    const name = (props.name ?? '').toLowerCase();

    if (/(window|ace_window)/.test(name)) return <ToolWindowRenderer {...props} />;
    if (/(error|exception|fail)/.test(name)) return <ToolErrorRenderer {...props} />;
    if (
        /(filesystem|file_system|\bfs\b|file|directory|path|\bls\b|\bglob\b|\bgrep\b|read_file|write_file|edit_file|execute|shell|command|script)/.test(
            name,
        )
    ) {
        return <ToolFilesystemRenderer {...props} />;
    }

    return <ToolGenericRenderer {...props} />;
}