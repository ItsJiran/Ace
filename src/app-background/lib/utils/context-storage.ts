/**
 * Context Storage — file-based storage for thread context data.
 *
 * ALL context types (file, directory, tool) persist their content to disk
 * as files under a common path structure. The context item's `content` field
 * stores a file pointer path instead of inline data — preventing LangGraph
 * state bloat from large payloads.
 *
 * Path structure:
 *   storage/threads/<threadUid>/context/<type>/<key>/content.txt
 *
 * Usage:
 *   const ptr = await writeFileContext(threadUid, 'src/main.ts', fileContent);
 *   // ptr → "storage/threads/abc/context/file/src%2Fmain.ts/content.txt"
 *   const data = await readContextContent(ptr);
 */

import { FSEngine } from '#/shared/engines/fs-engine';
import type {
    ContextItemFile,
    ContextItemDirectory,
    ContextItemTool,
} from '#/app-background/engines/ai/workflows/ace_graph_v3_simple/types';

const STORAGE_BASE = 'storage/threads';

// ── Helpers ────────────────────────────────────────────────────────────────

function contextDir(threadUid: string, type: string, key: string): string {
    return `${STORAGE_BASE}/${threadUid}/context/${type}/${encodeURIComponent(key)}`;
}
function contextContentPath(threadUid: string, type: string, key: string): string {
    return `${contextDir(threadUid, type, key)}/content.txt`;
}

function generateId(): string {
    return `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Tool result → { payload, result }. */
interface ToolOutputData {
    payload?: unknown;
    result?: unknown;
}
function parseToolOutput(raw: string): ToolOutputData {
    return JSON.parse(raw) as ToolOutputData;
}
function serializeToolOutput(data: ToolOutputData): string {
    return JSON.stringify(data);
}

// ═══════════════════════════════════════════════════════════════════════════
//  FILE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write file context content to disk and return a ContextItemFile with
 * `content` pointing to the file path.
 */
export async function writeFileContext(
    threadUid: string,
    key: string,
    summary: string,
    data: string,
    existingId?: string,
): Promise<ContextItemFile> {
    const dir = contextDir(threadUid, 'file', key);
    const path = contextContentPath(threadUid, 'file', key);
    await FSEngine.createDirectory(dir);
    await FSEngine.saveFile(path, data);
    return {
        id: existingId ?? generateId(),
        type: 'file',
        key,
        summary,
        is_expanded: true,
        content: path,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
//  DIRECTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write directory context content to disk and return a ContextItemDirectory with
 * `content` pointing to the file path.
 */
export async function writeDirectoryContext(
    threadUid: string,
    key: string,
    summary: string,
    data: string,
    existingId?: string,
): Promise<ContextItemDirectory> {
    const dir = contextDir(threadUid, 'directory', key);
    const path = contextContentPath(threadUid, 'directory', key);
    await FSEngine.createDirectory(dir);
    await FSEngine.saveFile(path, data);
    return {
        id: existingId ?? generateId(),
        type: 'directory',
        key,
        summary,
        is_expanded: true,
        content: path,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOOL
// ═══════════════════════════════════════════════════════════════════════════

export function createContextTool(key: string, summary: string): ContextItemTool {
    return {
        id: generateId(),
        type: 'tool',
        key,
        summary,
        is_expanded: true,
    };
}

/** Write tool output to disk. Returns updated item with file pointers. */
export async function writeContextTool(
    threadUid: string,
    item: ContextItemTool,
    data: ToolOutputData,
): Promise<ContextItemTool> {
    const dir = contextDir(threadUid, 'tool', item.key);
    await FSEngine.createDirectory(dir);
    const serialized = serializeToolOutput(data);
    const path = contextContentPath(threadUid, 'tool', item.key);
    await FSEngine.saveFile(path, serialized);
    return { ...item, output: path };
}

/** Read tool output from disk and parse. */
export async function readContextTool(item: ContextItemTool): Promise<ToolOutputData | null> {
    if (!item.output) return null;
    const raw = await FSEngine.readRaw(item.output);
    if (!raw) return null;
    return parseToolOutput(raw as string);
}

// ═══════════════════════════════════════════════════════════════════════════
//  GENERIC READ / CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

/** Read any context content from a pointer path (works for file, directory, tool). */
export async function readContextContent(pointer: string): Promise<string | null> {
    const raw = await FSEngine.readRaw(pointer);
    return raw as string | null;
}

/** Delete all context storage for a thread. */
export async function cleanupContextStorage(threadUid: string): Promise<void> {
    const base = `${STORAGE_BASE}/${threadUid}/context`;
    await FSEngine.deleteFile(base).catch(() => {});
}
