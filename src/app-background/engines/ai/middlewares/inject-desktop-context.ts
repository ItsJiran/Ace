import { SystemMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';
import { AgentConfigType } from '#/shared/schemas/ai.ts';

/**
 * InjectDesktopContextMiddleware. This middleware is designed to inject desktop context information into the agent's message stream. It extracts relevant desktop 
 * and user context from the agent's runtime and constructs a system message that provides this information in a structured format. The injected context includes details 
 * such as screen resolution, viewport size, cursor position, and user information. This allows the agent to have awareness of the user's desktop environment, enabling 
 * it to better understand and respond to spatial instructions or queries related to the screen and user context.
 */

export default createMiddleware({
    name: 'InjectDesktopContext',
    wrapModelCall: async (request, handler) => {
        const runtime = request.runtime as AgentConfigType;
        const runtimeContext =
            runtime.context && typeof runtime.context === 'object'
                ? (runtime.context as {
                      user?: Record<string, unknown>;
                      desktop?: Record<string, unknown>;
                  })
                : undefined;
        const userContext = runtimeContext?.user;
        const desktopContext = runtimeContext?.desktop;

        if (!desktopContext && !userContext) {
            return handler(request);
        }

        const safeDesktopContext = desktopContext ?? {};

        const viewportWidth = Number(safeDesktopContext.viewport_width ?? 0);
        const viewportHeight = Number(safeDesktopContext.viewport_height ?? 0);
        const viewportCenterX = Number(safeDesktopContext.viewport_center_x ?? 0);
        const viewportCenterY = Number(safeDesktopContext.viewport_center_y ?? 0);
        const screenWidth = Number(safeDesktopContext.screen_width ?? 0);
        const screenHeight = Number(safeDesktopContext.screen_height ?? 0);

        const contextMessage = new SystemMessage(
            [
                'Runtime context:',
                `- local username: ${userContext?.username ? String(userContext.username) : 'unknown'}`,
                `- user home directory: ${userContext?.home_dir ? String(userContext.home_dir) : 'unknown'}`,
                'Runtime desktop context:',
                `- screen resolution: ${screenWidth} x ${screenHeight}`,
                `- viewport size: ${viewportWidth} x ${viewportHeight}`,
                `- viewport center: (${viewportCenterX}, ${viewportCenterY})`,
                `- cursor position: (${Number(safeDesktopContext.cursor_x ?? 0)}, ${Number(safeDesktopContext.cursor_y ?? 0)})`,
                `- overlay mode: ${String(safeDesktopContext.mode ?? 'ambient')}`,
                `- focused window uid: ${safeDesktopContext.focused_window_uid ? String(safeDesktopContext.focused_window_uid) : 'none'}`,
                `- active window uid: ${safeDesktopContext.active_window_uid ? String(safeDesktopContext.active_window_uid) : 'none'}`,
                'Use these values when the user gives spatial instructions like "move to the center" or asks about screen-relative positioning.',
            ].join('\n'),
        );

        return handler({
            ...request,
            messages: [contextMessage, ...(request.messages ?? [])],
        });
    },
});
