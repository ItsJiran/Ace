/**
 * Thread Storage — file-based storage for thread action data.
 *
 * Uses FSEngine to persist action output/results to disk,
 * preventing LangGraph state bloat from large payloads.
 *
 * Path structure:
 *   /storage/threads/<threadUid>/cycle/<cycleIndex>/actions/<actionIndex>/output.json
 *   /storage/threads/<threadUid>/cycle/<cycleIndex>/actions/<actionIndex>/result.json
 *
 * Usage:
 *   const ptr = writeActionOutput(threadUid, 0, 0, { stdout: '...' });
 *   // ptr → "/storage/threads/abc/cycle/0/actions/0/output.json"
 *   const data = readActionOutput(ptr);
 */

import { FSEngine } from '#/shared/engines/fs-engine';

const STORAGE_BASE = 'storage/threads';

// ── Path builders ──────────────────────────────────────────────────────────

export function actionDir(threadUid: string, cycleIndex: number, actionIndex: number): string {
    return `${STORAGE_BASE}/${threadUid}/cycle/${cycleIndex}/actions/${actionIndex}`;
}

export function outputPath(threadUid: string, cycleIndex: number, actionIndex: number): string {
    return `${actionDir(threadUid, cycleIndex, actionIndex)}/output.json`;
}

export function resultPath(threadUid: string, cycleIndex: number, actionIndex: number): string {
    return `${actionDir(threadUid, cycleIndex, actionIndex)}/result.json`;
}

// ── Write ──────────────────────────────────────────────────────────────────

/** Persist output data and return the pointer path. */
export async function writeActionOutput(
    threadUid: string,
    cycleIndex: number,
    actionIndex: number,
    data: unknown,
): Promise<string> {
    const dir = actionDir(threadUid, cycleIndex, actionIndex);
    const path = outputPath(threadUid, cycleIndex, actionIndex);
    await FSEngine.createDirectory(dir);
    await FSEngine.saveFile(path, data);
    return path;
}

/** Persist result data and return the pointer path. */
export async function writeActionResult(
    threadUid: string,
    cycleIndex: number,
    actionIndex: number,
    data: unknown,
): Promise<string> {
    const dir = actionDir(threadUid, cycleIndex, actionIndex);
    const path = resultPath(threadUid, cycleIndex, actionIndex);
    await FSEngine.createDirectory(dir);
    await FSEngine.saveFile(path, data);
    return path;
}

// ── Read ───────────────────────────────────────────────────────────────────

/** Read output from a pointer path. */
export async function readActionOutput(pointer: string): Promise<unknown> {
    return await FSEngine.readFile(pointer);
}

/** Read result from a pointer path. */
export async function readActionResult(pointer: string): Promise<unknown> {
    return await FSEngine.readFile(pointer);
}

// ── Cleanup ────────────────────────────────────────────────────────────────

/** Delete all storage for a thread. */
export async function cleanupThreadStorage(threadUid: string): Promise<void> {
    const base = `${STORAGE_BASE}/${threadUid}`;
    await FSEngine.deleteFile(base).catch(() => {});
}
