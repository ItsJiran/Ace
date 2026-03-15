import { RAMViewer } from '../dev/RAMViewer';
import { EventViewer } from '../dev/EventViewer';
import { EventRegistryList } from '../dev/EventRegistryList';
import { ProcessMonitor } from '../dev/ProcessMonitor';
import { ToolsRegistryList } from '../dev/ToolsRegistryList';
import { PipelineRegistryList } from '../dev/PipelineRegistryList';
import { WindowRegistryList } from '../dev/WindowRegistryList';
import { FPSWidget } from '../dev/FPSWidget';
import { DevMenu } from '#/components/dev/DevMenu';
import { LoadingWidget } from '#/components/widgets/LoadingWidget';
import { SystemConsole } from '#/components/widgets/SystemConsole';

const REGISTRY: Record<string, React.FC<any>> = {
    'ram_viewer': RAMViewer,
    'event_viewer': EventViewer,
    'event_registry_list': EventRegistryList,
    'process_monitor': ProcessMonitor,
    'tools_registry_list': ToolsRegistryList,
    'pipeline_registry_list': PipelineRegistryList,
    'window_registry_list': WindowRegistryList,
    'fps_widget': FPSWidget,
    'dev_menu': DevMenu,
    'loading_widget': LoadingWidget,
    'system_console': SystemConsole,
    // Add more components here in the future
};

interface RegistryProps {
    componentName: string;
    windowUid: string;
    payloadMemoryUid?: string;
}

/**
 * The ComponentRegistry is responsible for taking a string from the EventBus/WindowEngine
 * and mapping it to the actual React logic component. This decouples the core UI Shell
 * from the specific tooling interactions.
 */
export function ComponentRegistry({ componentName, windowUid, payloadMemoryUid }: RegistryProps) {
    const Component = REGISTRY[componentName];

    if (!Component) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 font-mono text-xs opacity-50 p-4 text-center border-2 border-dashed border-zinc-800 rounded">
                <p>Unregistered Component Schema:</p>
                <span className="text-red-400 font-bold mt-1 text-sm">{componentName}</span>
                <p className="mt-4 text-zinc-600">Please register this name in src/features/registry/ComponentRegistry.tsx</p>
            </div>
        );
    }

    return <Component windowUid={windowUid} payloadMemoryUid={payloadMemoryUid} />;
}
