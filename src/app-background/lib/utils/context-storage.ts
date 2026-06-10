/**
 * Context Storage — type-specific CRUD for file, directory, and tool contexts.
 *
 * Parsing formats:
 *   file      → string[] (line-by-line text)
 *   directory → { files: string[], directories: string[] }
 *   tool      → { payload: unknown, result: unknown }
 *
 * Path structure (tool only — file/directory are inline on state):
 *   /storage/threads/<threadUid>/context/tool/<key>/payload_context.txt
 *   /storage/threads/<threadUid>/context/tool/<key>/output_context.txt
 */

import { FSEngine } from '#/shared/engines/fs-engine';
import type {
    ContextItemFile,
    ContextItemDirectory,
    ContextItemTool,
} from '#/app-background/engines/ai/workflows/ace_graph_v3_simple/types';

const STORAGE_BASE = 'storage/threads';

// ── Path builders ──────────────────────────────────────────────────────────

function toolContextDir(threadUid: string, key: string): string {
    return `${STORAGE_BASE}/${threadUid}/context/tool/${key}`;
}
function toolPayloadPath(threadUid: string, key: string): string {
    return `${toolContextDir(threadUid, key)}/payload_context.txt`;
}
function toolOutputPath(threadUid: string, key: string): string {
    return `${toolContextDir(threadUid, key)}/output_context.txt`;
}

// ── Parsers ────────────────────────────────────────────────────────────────

/** File content → string[] (line-by-line). */
function parseFileContent(raw: string): string[] {
    return raw.split('\n');
}
function serializeFileContent(lines: string[]): string {
    return lines.join('\n');
}

/** Directory content → { files, directories }. */
interface DirectoryData {
    files: string[];
    directories: string[];
}
function parseDirectoryContent(raw: string): DirectoryData {
    return JSON.parse(raw) as DirectoryData;
}
function serializeDirectoryContent(data: DirectoryData): string {
    return JSON.stringify(data);
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

export function createContextFile(key: string, summary: string, lines: string[]): ContextItemFile {
    return {
        id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'file',
        key,
        summary,
        is_expanded: true,
        content: serializeFileContent(lines),
    };
}

export function readContextFile(item: ContextItemFile): string[] {
    return parseFileContent(item.content);
}

export function updateContextFile(item: ContextItemFile, lines: string[]): ContextItemFile {
    return { ...item, content: serializeFileContent(lines) };
}

export function appendContextFile(item: ContextItemFile, line: string): ContextItemFile {
    const lines = parseFileContent(item.content);
    lines.push(line);
    return { ...item, content: serializeFileContent(lines) };
}

// ═══════════════════════════════════════════════════════════════════════════
//  DIRECTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createContextDirectory(
    key: string,
    summary: string,
    data: DirectoryData,
): ContextItemDirectory {
    return {
        id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'directory',
        key,
        summary,
        is_expanded: true,
        content: serializeDirectoryContent(data),
    };
}

export function readContextDirectory(item: ContextItemDirectory): DirectoryData {
    return parseDirectoryContent(item.content);
}

export function updateContextDirectory(
    item: ContextItemDirectory,
    data: Partial<DirectoryData>,
): ContextItemDirectory {
    const current = parseDirectoryContent(item.content);
    return {
        ...item,
        content: serializeDirectoryContent({ ...current, ...data }),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOOL
// ═══════════════════════════════════════════════════════════════════════════

export function createContextTool(key: string, summary: string): ContextItemTool {
    return {
        id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    await FSEngine.createDirectory(toolContextDir(threadUid, item.key));
    const serialized = serializeToolOutput(data);
    await FSEngine.writeFile(toolOutputPath(threadUid, item.key), serialized);
    return { ...item, output: toolOutputPath(threadUid, item.key) };
}

/** Read tool output from disk and parse. */
export async function readContextTool(item: ContextItemTool): Promise<ToolOutputData | null> {
    if (!item.output) return null;
    const raw = await FSEngine.readRaw(item.output);
    if (!raw) return null;
    return parseToolOutput(raw);
}

/** Delete tool output files from disk. */
export async function deleteContextTool(threadUid: string, item: ContextItemTool): Promise<void> {
    if (item.payload) await FSEngine.deleteFile(item.payload).catch(() => {});
    if (item.output) await FSEngine.deleteFile(item.output).catch(() => {});
}
