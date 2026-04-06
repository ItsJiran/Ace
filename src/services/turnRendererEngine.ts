/**
 * TurnRendererEngine
 *
 * Manages per-turn renderer memory for ordered, memory-backed rendering.
 * Each turn (user or assistant message) has a dedicated memory key that stores
 * an ordered array of renderer entries. UI components subscribe to this memory
 * via useAceMemory for reactive rendering.
 *
 * Flow:
 *   aiParser/handler → pushRenderer() → StorageEngine writes → UI re-renders
 *
 * Memory keys:
 *   system:turn:{turnId}:renderers  → TurnRendererMemory (renderer entry list)
 *   system:turn:{turnId}:rd:{index} → Renderer data (props/content per entry)
 */

import { KernelEngine } from '#/services/kernelEngine';

// ── Types ──────────────────────────────────────────────────────────────────────

export type TurnRendererStatus = 'streaming' | 'completed' | 'error';

export interface TurnRendererEntry {
    renderer_slug: string;
    package_ref: string;
    memory_uid: string;
    status: TurnRendererStatus;
    index: number;
    pushed_at: number;
}

export interface TurnRendererMemory {
    turn_id: string;
    role: 'user' | 'assistant';
    renderers: TurnRendererEntry[];
    owner_process_uid?: string;
    updated_at: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_PACKAGE_REF = 'itsjiran/ace-system';

function rendererMemoryKey(turnId: string): string {
    return `system:turn:${turnId}:renderers`;
}

function rendererDataKey(turnId: string, index: number): string {
    return `system:turn:${turnId}:rd:${index}`;
}

// ── Engine ──────────────────────────────────────────────────────────────────────

class TurnRendererEngineSingleton {
    private findLatestRendererIndex(turnId: string, rendererSlug: string): number {
        const current = this.getRenderers(turnId);
        if (!current?.renderers?.length) return -1;

        for (let index = current.renderers.length - 1; index >= 0; index -= 1) {
            if (current.renderers[index]?.renderer_slug === rendererSlug) {
                return current.renderers[index].index;
            }
        }

        return -1;
    }

    /**
     * Read the current turn renderer state.
     */
    getRenderers(turnId: string): TurnRendererMemory | undefined {
        const key = rendererMemoryKey(turnId);
        return KernelEngine.readMemory(key) as TurnRendererMemory | undefined;
    }

    /**
     * Initialize a turn (call once when a new message starts).
     */
    initTurn(turnId: string, role: 'user' | 'assistant', processUid?: string): void {
        const key = rendererMemoryKey(turnId);
        const existing = KernelEngine.readMemory(key);
        if (existing) return; // Already initialized

        const payload: TurnRendererMemory = {
            turn_id: turnId,
            role,
            renderers: [],
            owner_process_uid: processUid,
            updated_at: Date.now(),
        };

        if (processUid) {
            try {
                KernelEngine.createRuntimeMemory({
                    owner_process_uid: processUid,
                    memory_uid: key,
                    payload,
                });
            } catch (e) {
                KernelEngine.updateRuntimeMemory({
                    owner_process_uid: processUid,
                    memory_uid: key,
                    payload,
                });
            }
        } else {
            KernelEngine.writeMemory(key, payload);
        }
    }

    /**
     * Push a new renderer entry to a turn.
     * Returns the index of the new entry.
     */
    pushRenderer(turnId: string, entry: {
        renderer_slug: string;
        package_ref?: string;
        props?: Record<string, unknown>;
        status?: TurnRendererStatus;
    }): number {
        const memKey = rendererMemoryKey(turnId);
        const current = (KernelEngine.readMemory(memKey) as TurnRendererMemory | undefined);
        const renderers = current?.renderers ? [...current.renderers] : [];
        const index = renderers.length;
        const dataKey = rendererDataKey(turnId, index);
        const ownerProcessUid = current?.owner_process_uid;

        // Store renderer data (props) in dedicated memory
        if (ownerProcessUid) {
            try {
                KernelEngine.createRuntimeMemory({
                    owner_process_uid: ownerProcessUid,
                    memory_uid: dataKey,
                    payload: entry.props ?? {}
                });
            } catch (e) {
                KernelEngine.updateRuntimeMemory({
                    owner_process_uid: ownerProcessUid,
                    memory_uid: dataKey,
                    payload: entry.props ?? {}
                });
            }
        } else {
            KernelEngine.writeMemory(dataKey, entry.props ?? {});
        }

        // Add entry to renderer list
        const newEntry: TurnRendererEntry = {
            renderer_slug: entry.renderer_slug,
            package_ref: entry.package_ref || DEFAULT_PACKAGE_REF,
            memory_uid: dataKey,
            status: entry.status || 'completed',
            index,
            pushed_at: Date.now(),
        };
        renderers.push(newEntry);

        const payload: TurnRendererMemory = {
            turn_id: turnId,
            role: current?.role || 'assistant',
            renderers,
            owner_process_uid: ownerProcessUid,
            updated_at: Date.now(),
        };

        if (current) {
            if (ownerProcessUid) {
                KernelEngine.updateRuntimeMemory({ owner_process_uid: ownerProcessUid, memory_uid: memKey, payload });
            } else {
                KernelEngine.updateMemory(memKey, payload);
            }
        } else {
            if (ownerProcessUid) {
                try {
                    KernelEngine.createRuntimeMemory({ owner_process_uid: ownerProcessUid, memory_uid: memKey, payload });
                } catch (e) {
                    KernelEngine.updateRuntimeMemory({ owner_process_uid: ownerProcessUid, memory_uid: memKey, payload });
                }
            } else {
                KernelEngine.writeMemory(memKey, payload);
            }
        }

        return index;
    }

    /**
     * Update the data (props) of an existing renderer entry.
     */
    updateRendererData(turnId: string, index: number, data: Record<string, unknown>): void {
        const dataKey = rendererDataKey(turnId, index);
        KernelEngine.updateMemory(dataKey, data);
    }

    /**
     * Update the status of a renderer entry.
     */
    updateRendererStatus(turnId: string, index: number, status: TurnRendererStatus): void {
        const memKey = rendererMemoryKey(turnId);
        const current = KernelEngine.readMemory(memKey) as TurnRendererMemory | undefined;
        if (!current?.renderers?.[index]) return;

        const renderers = [...current.renderers];
        renderers[index] = { ...renderers[index], status };

        KernelEngine.updateMemory(memKey, {
            ...current,
            renderers,
            updated_at: Date.now(),
        });
    }

    updateLatestRenderer(turnId: string, rendererSlug: string, data: Record<string, unknown>, status?: TurnRendererStatus): void {
        const index = this.findLatestRendererIndex(turnId, rendererSlug);
        if (index < 0) return;

        this.updateRendererData(turnId, index, data);
        if (status) {
            this.updateRendererStatus(turnId, index, status);
        }
    }

    /**
     * Smart push/update for paragraph text during streaming.
     * If the last renderer is a paragraph with status 'streaming', append text.
     * Otherwise push a new paragraph renderer.
     */
    pushOrUpdateParagraph(turnId: string, text: string, status: TurnRendererStatus = 'streaming'): void {
        const memKey = rendererMemoryKey(turnId);
        const current = KernelEngine.readMemory(memKey) as TurnRendererMemory | undefined;
        const renderers = current?.renderers ?? [];

        if (renderers.length > 0) {
            const last = renderers[renderers.length - 1];
            if (last.renderer_slug === 'paragraph-renderer' && last.status === 'streaming') {
                // Append to existing paragraph
                const dataKey = last.memory_uid;
                const existingData = (KernelEngine.readMemory(dataKey) ?? {}) as Record<string, unknown>;
                const currentText = typeof existingData.text === 'string' ? existingData.text : '';

                KernelEngine.updateMemory(dataKey, { ...existingData, text: currentText + text });

                // Update status if needed
                if (status !== 'streaming') {
                    this.updateRendererStatus(turnId, last.index, status);
                }
                return;
            }
        }

        // Push new paragraph renderer
        this.pushRenderer(turnId, {
            renderer_slug: 'paragraph-renderer',
            props: { text },
            status,
        });
    }

    /**
     * Finalize all renderers in a turn.
     * Sets all 'streaming' entries to 'completed'.
     */
    finalizeTurn(turnId: string): void {
        const memKey = rendererMemoryKey(turnId);
        const current = KernelEngine.readMemory(memKey) as TurnRendererMemory | undefined;
        if (!current?.renderers?.length) return;

        let changed = false;
        const renderers = current.renderers.map((entry) => {
            if (entry.status === 'streaming') {
                changed = true;
                return { ...entry, status: 'completed' as TurnRendererStatus };
            }
            return entry;
        });

        if (!changed) return;

        KernelEngine.updateMemory(memKey, {
            ...current,
            renderers,
            updated_at: Date.now(),
        });
    }
}

export const TurnRendererEngine = new TurnRendererEngineSingleton();
