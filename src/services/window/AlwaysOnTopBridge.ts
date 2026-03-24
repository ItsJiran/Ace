import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Handles cross-platform z-order consistency by periodically
 * re-asserting the window's "always on top" status.
 * Necessary for certain Linux Window Managers and macOS compositors
 * which tend to reset flags on focus changes.
 */
export class AlwaysOnTopBridge {
    private intervalId?: number;

    /**
     * Start the enforcement loop.
     * Note: This bridge is intentionally aggressive to prevent losing
     * the overlay capability during context switches.
     */
    public start() {
        if (this.intervalId) return;

        const appWindow = getCurrentWindow();
        appWindow.setAlwaysOnTop(true).catch(() => {});

        appWindow.onFocusChanged(({ payload: focused }) => {
            if (!focused) {
                appWindow.setAlwaysOnTop(true).catch(() => {});
            }
        }).catch(() => {});

        // Some Linux window managers may still reshuffle z-order; re-assert periodically.
        this.intervalId = window.setInterval(() => {
            appWindow.setAlwaysOnTop(true).catch(() => {});
        }, 2000);
    }

    public stop() {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }
}