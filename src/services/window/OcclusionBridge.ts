import { KernelEngine } from '../kernelEngine';
import type { WindowConfig } from '#/schemas/window';

export class OcclusionBridge {
    private intervalId?: number;
    private windowUnsubs: (() => void)[] = [];
    private activeWindowsUnsub?: () => void;
    private isDirty = false;

    public start() {
        if (this.intervalId) return;

        // Initialize the occlusion memory map
        KernelEngine.registerSystemMemory('system:window_occlusion', {});

        this.activeWindowsUnsub = KernelEngine.subscribe(
            'system:window_system',
            () => this.rebuildSubscriptions()
        );
        this.rebuildSubscriptions();

        // 10fps computation loop for spatial culling
        this.intervalId = window.setInterval(() => {
            if (this.isDirty) {
                this.computeOcclusion();
                this.isDirty = false;
            }
        }, 100);
    }

    private rebuildSubscriptions() {
        for (const unsub of this.windowUnsubs) unsub();
        this.windowUnsubs = [];

        const rendered = KernelEngine.getRenderedWindows();
        for (const { uid } of rendered) {
            // Re-compute whenever any window's bounds/state changes
            const unsub = KernelEngine.subscribe(`system:window:${uid}`, () => {
                this.isDirty = true;
            });
            this.windowUnsubs.push(unsub);
        }
        this.isDirty = true;
    }

    private computeOcclusion() {
        const rendered = KernelEngine.getRenderedWindows();
        const configs: WindowConfig[] = [];
        
        for (const { uid } of rendered) {
            const config = KernelEngine.readMemory(`system:window:${uid}`) as WindowConfig | undefined;
            // Minimized windows are physically removed from the flow and don't occlude
            if (config && !config.is_minimized) {
                configs.push(config);
            }
        }

        // Sort from front (highest z) to back (lowest z)
        configs.sort((a, b) => b.z_index - a.z_index);

        const occlusionState: Record<string, boolean> = {};
        const occluders: WindowConfig[] = [];

        for (const win of configs) {
            let occluded = false;

            // Heuristic 1: Is this window 100% inside any single opaque window above it?
            for (const occ of occluders) {
                if (
                    win.x >= occ.x &&
                    win.y >= occ.y &&
                    (win.x + win.width) <= (occ.x + occ.width) &&
                    (win.y + win.height) <= (occ.y + occ.height)
                ) {
                    occluded = true;
                    break;
                }
            }

            occlusionState[win.window_uid] = occluded;

            // Add to occluders if it's eligible to hide things behind it
            // Opaque standard windows act as complete physical occluders.
            if (!occluded && win.chrome_style !== 'borderless' && (win.opacity === undefined || win.opacity >= 0.95)) {
                occluders.push(win);
            }
        }

        KernelEngine.updateMemory('system:window_occlusion', occlusionState);
    }

    public stop() {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        this.activeWindowsUnsub?.();
        this.activeWindowsUnsub = undefined;
        for (const unsub of this.windowUnsubs) unsub();
        this.windowUnsubs = [];
    }
}
