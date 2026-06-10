import {
    AgentChatTurn,
    AgentThreadAIMessage,
    AgentThreadToolMessage,
    type AgentThreadToolMessageKind,
} from '#/shared/schemas/agent-thread-state';

// ---------------------------------------------------------------------------
// Raw-content helpers
// ---------------------------------------------------------------------------

function extractTextContent(content: any): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map((block) => (typeof block === 'object' ? block.text || block.data || '' : block))
            .join('');
    }
    return '';
}

function parseIfJson(value: string): unknown {
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

// ---------------------------------------------------------------------------
// Tool-name normalisation
// ---------------------------------------------------------------------------

function normalizename(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');
}

// ---------------------------------------------------------------------------
// Tool-category resolver
// ---------------------------------------------------------------------------

function resolveToolKind(name: string): AgentThreadToolMessageKind {
    const n = normalizename(name);

    if (/(window|ace_window)/.test(n)) return 'window';

    if (
        /(filesystem|file_system|\bfs\b|file|directory|path|\bls\b|\bglob\b|\bgrep\b|read_file|write_file|edit_file|mkdir|delete_file|move_file|copy_file|\bmove\b|shell|command|script|execute)/.test(
            n,
        )
    ) {
        return 'filesystem';
    }

    if (/(error|exception|fail)/.test(n)) return 'error';

    return 'generic';
}

// ---------------------------------------------------------------------------
// Per-tool content formatters
// ---------------------------------------------------------------------------

interface ToolFormatResult {
    content: string;
    parsed: Record<string, unknown>;
}

function formatToolContent(rawContent: unknown, toolName: string): ToolFormatResult {
    const text = extractTextContent(rawContent);
    const n = normalizename(toolName);

    // -- ls ----------------------------------------------------------------
    if (n === 'ls') {
        const lines = text
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
        const entries = lines.map((line) => {
            const dirMatch = line.match(/^(.*) \(directory\)$/);
            if (dirMatch) return { path: dirMatch[1], kind: 'directory' as const };
            const fileMatch = line.match(/^(.*?)(?: \((\d+) bytes\))?$/);
            return { path: fileMatch?.[1] ?? line, kind: 'file' as const, size: fileMatch?.[2] ?? null };
        });
        return {
            content: text,
            parsed: { entries, count: entries.length },
        };
    }

    // -- glob --------------------------------------------------------------
    if (n === 'glob') {
        const paths = text
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
        return {
            content: text,
            parsed: { paths, match_count: paths.length },
        };
    }

    // -- grep --------------------------------------------------------------
    if (n === 'grep') {
        const files: Record<string, Array<{ line: string; text: string }>> = {};
        let currentFile: string | null = null;
        for (const rawLine of text.split('\n')) {
            const line = rawLine.trim();
            if (!line) continue;
            if (!line.startsWith(' ') && line.endsWith(':')) {
                currentFile = line.slice(0, -1);
                files[currentFile] = [];
                continue;
            }
            const m = line.match(/^\s*(\d+):\s?(.*)$/);
            if (currentFile && m) {
                files[currentFile].push({ line: m[1], text: m[2] });
            }
        }
        const fileCount = Object.keys(files).length;
        const matchCount = Object.values(files).reduce((s, v) => s + v.length, 0);
        return {
            content: text,
            parsed: { files, file_count: fileCount, match_count: matchCount },
        };
    }

    // -- read_file ---------------------------------------------------------
    if (n === 'read_file') {
        return {
            content: text,
            parsed: { content: text, is_binary: false },
        };
    }

    // -- write_file --------------------------------------------------------
    if (n === 'write_file') {
        const match = text.match(/Successfully wrote to '(.+)'/);
        return {
            content: text,
            parsed: { path: match?.[1] ?? null, success: !!match },
        };
    }

    // -- edit_file ---------------------------------------------------------
    if (n === 'edit_file') {
        const match = text.match(/Successfully replaced (\d+) occurrence\(s\) in '(.+)'/);
        return {
            content: text,
            parsed: { path: match?.[2] ?? null, occurrences: match?.[1] ?? null, success: !!match },
        };
    }

    // -- execute / shell / command -----------------------------------------
    if (n === 'execute' || n === 'shell' || n === 'command') {
        const sections = text.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
        const cwdLine = sections.find((s) => s.startsWith('cwd: '));
        const cmdLine = sections.find((s) => s.startsWith('$ '));
        const stdoutSec = sections.find((s) => s.startsWith('stdout:'));
        const stderrSec = sections.find((s) => s.startsWith('stderr:'));
        return {
            content: text,
            parsed: {
                cwd: cwdLine?.replace(/^cwd:\s*/, '') ?? null,
                command: cmdLine?.replace(/^\$\s*/, '') ?? null,
                stdout: stdoutSec?.replace(/^stdout:\n?/, '') ?? null,
                stderr: stderrSec?.replace(/^stderr:\n?/, '') ?? null,
            },
        };
    }

    // -- window / ace_window -----------------------------------------------
    if (n === 'window' || n === 'ace_window') {
        const parsed = parseIfJson(text);
        const windows = Array.isArray(parsed) ? parsed : (parsed as any)?.windows ?? [parsed];
        return {
            content: text,
            parsed: { windows: Array.isArray(windows) ? windows : [windows], window_count: Array.isArray(windows) ? windows.length : 1 },
        };
    }

    // -- error tools -------------------------------------------------------
    const parsedJson = parseIfJson(text);
    if (typeof parsedJson === 'object' && parsedJson !== null && !Array.isArray(parsedJson)) {
        const rec = parsedJson as Record<string, unknown>;
        if ('error' in rec || 'message' in rec || 'stderr' in rec) {
            return {
                content: text,
                parsed: {
                    error: rec.error ?? rec.message ?? null,
                    stderr: rec.stderr ?? null,
                    stdout: rec.stdout ?? null,
                },
            };
        }
    }

    // -- fallback ----------------------------------------------------------
    return { content: text, parsed: {} };
}

// ---------------------------------------------------------------------------
// Main normalizer
// ---------------------------------------------------------------------------

export default (rawMessages: any[]): AgentChatTurn[] => {
    if (!Array.isArray(rawMessages)) return [];

    const turns: AgentChatTurn[] = [];
    let currentTurn: AgentChatTurn | null = null;

    const ensureTurn = (msgId: string) => {
        if (!currentTurn) {
            currentTurn = {
                turn_id: `auto-${msgId}`,
                human: { uid: 'dummy', content: '', timestamp: Date.now() },
                responses: [],
            };
        }
    };

    for (const msg of rawMessages) {
        if (!msg) continue;

        const kwargs = msg.kwargs || {};
        const msgId = kwargs.id || msg.id || (Array.isArray(msg.id) ? msg.id[msg.id.length - 1] : 'unknown');
        const idArray = Array.isArray(msg.id) ? msg.id : (typeof msg.id === 'string' ? [msg.id] : []);
        const className = idArray.length > 0 ? idArray[idArray.length - 1] : '';
        const msgType = msg.type || msg._type || '';

        // Detect v3 AIMessage by name prefix or constructor name
        const isAIMessage =
            className === 'AIMessage' ||
            className === 'ai' ||
            msgType === 'ai' ||
            (typeof msg.name === 'string' && msg.name.startsWith('ace-v3'));
        const isHumanMessage =
            className === 'HumanMessage' ||
            className === 'human' ||
            msgType === 'human';
        const isToolMessage =
            className === 'ToolMessage' ||
            className === 'tool' ||
            msgType === 'tool';

        if (isHumanMessage) {
            if (currentTurn) turns.push(currentTurn);
            currentTurn = {
                turn_id: String(msgId),
                human: {
                    uid: String(msgId),
                    content: extractTextContent(kwargs.content || msg.content),
                    timestamp: Date.now(),
                },
                responses: [],
            };
        } else if (isAIMessage) {
            ensureTurn(msgId);
            const usage = kwargs.usage_metadata || {};

            const aiMsg: AgentThreadAIMessage = {
                type: 'AIMessage',
                uid: msgId,
                content: extractTextContent(kwargs.content || msg.content),
                tool_calls:
                    Array.isArray(kwargs.tool_calls) && kwargs.tool_calls.length > 0
                        ? kwargs.tool_calls
                        : null,
                token_usage: kwargs.usage_metadata
                    ? {
                          input: usage.input_tokens || 0,
                          output: usage.output_tokens || 0,
                          total: usage.total_tokens || 0,
                      }
                    : null,
                timestamp: Date.now(),
            };

            currentTurn?.responses.push(aiMsg);
        } else if (isToolMessage) {
            ensureTurn(String(msgId));

            const toolName = kwargs.name || msg.name || 'unknown_tool';
            const rawContent = kwargs.content ?? msg.content;
            const { content, parsed } = formatToolContent(rawContent, toolName);

            const toolMsg: AgentThreadToolMessage = {
                type: 'ToolMessage',
                uid: String(msgId),
                tool_name: toolName,
                tool_call_id: kwargs.tool_call_id || msg.tool_call_id || '',
                content,
                timestamp: Date.now(),
                tool_kind: resolveToolKind(toolName),
                parsed: Object.keys(parsed).length > 0 ? parsed : undefined,
            };

            currentTurn?.responses.push(toolMsg);
        }
    }

    if (currentTurn) {
        turns.push(currentTurn);
    }

    return turns;
}
