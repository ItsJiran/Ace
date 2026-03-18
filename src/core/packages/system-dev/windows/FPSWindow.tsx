import type { AceRegistryType } from '#/schemas/registryTypes';
import { FPSWidget } from '../components/FPSWidget';
import { useAceWindow } from '#/hooks/useAceWindow';

export const registry: AceRegistryType.Window = {
    name: 'fps_widget_window',
    react_behavior: 'window_shell',
};

export const FPSWindow = ({ windowUid }: { windowUid: string }) => {
    const { dragHandleProps } = useAceWindow(windowUid);

    // FPS Widget is usually draggable by itself or needs props passed.
    // If FPSWidget doesn't accept drag handle props, we might need to wrap it.
    // Checking FPSWidget again, it doesn't seem to take props. It's just a display.
    // So we wrap it in a draggable div if it's borderless, or just render it if the window shell handles dragging.
    // Assuming standard window behavior for now.

    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-transparent">
             <div {...dragHandleProps} className="w-full h-full cursor-move">
                <FPSWidget />
             </div>
        </div>
    );
};
