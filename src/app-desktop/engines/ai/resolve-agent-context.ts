import { StateEngine } from '../state-engine';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import readProcessEnv from '#/shared/lib/read-process-env';

export default async () => {
    const desktopState = StateEngine.readDesktopState();
    const username = await readProcessEnv('USER');
    const homeDir = username ? `/home/${username}/` : null;
    return {
        user: {
            username,
            home_dir: homeDir,
        },
        desktop: {
            mode: desktopState.mode,
            window_display_mode: desktopState.window_display_mode,
            screen_width: desktopState.screen_width,
            screen_height: desktopState.screen_height,
            available_screen_width: desktopState.available_screen_width,
            available_screen_height: desktopState.available_screen_height,
            viewport_width: desktopState.viewport_width,
            viewport_height: desktopState.viewport_height,
            viewport_center_x: Math.round(desktopState.viewport_width / 2),
            viewport_center_y: Math.round(desktopState.viewport_height / 2),
            device_pixel_ratio: desktopState.device_pixel_ratio,
            cursor_x: desktopState.mouse_x,
            cursor_y: desktopState.mouse_y,
            focused_window_uid:
                (KernelEngine.readMemory('system:global_state:focused_window') as
                    | string
                    | null
                    | undefined) ?? null,
            active_window_uid:
                (KernelEngine.readMemory('system:global_state:active_window') as
                    | string
                    | null
                    | undefined) ?? null,
        },
    };
};
