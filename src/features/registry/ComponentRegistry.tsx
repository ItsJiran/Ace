import { RAMViewer } from '../dev/RAMViewer';
import { EventViewer } from '../dev/EventViewer';
import { EventRegistryList } from '../dev/EventRegistryList';
import { ProcessMonitor } from '../dev/ProcessMonitor';
import { ToolsRegistryList } from '../dev/ToolsRegistryList';
import { PipelineRegistryList } from '../dev/PipelineRegistryList';
import { WindowRegistryList } from '../dev/WindowRegistryList';
import { FPSWidget } from '../dev/FPSWidget';
import { StressTestMenu } from '../dev/StressTestMenu';
import { StressTestUIAnimationFPS } from '../dev/StressTestUIAnimationFPS';
import { StressTestPromptResponseLoad } from '../dev/StressTestPromptResponseLoad';
import { StressTestChatMessageFlow } from '../dev/StressTestChatMessageFlow';
import { StressTestWindowMotion } from '../dev/StressTestWindowMotion';
import { StressTestWindowSwarm } from '../dev/StressTestWindowSwarm';
import { StressTestRAMIsolation } from '../dev/StressTestRAMIsolation';
import { StressTestPromptBarAnimation } from '../dev/StressTestPromptBarAnimation';
import { RAMUsageAnalyzer } from '../dev/RAMUsageAnalyzer';
import { HeadlessDragSurfaceDemo } from '../dev/HeadlessDragSurfaceDemo';
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
    'ram_usage_analyzer': RAMUsageAnalyzer,
    'stress_test_menu': StressTestMenu,
    'stress_test_ui_animation_fps': StressTestUIAnimationFPS,
    'stress_test_prompt_response_load': StressTestPromptResponseLoad,
    'stress_test_chat_message_flow': StressTestChatMessageFlow,
    'stress_test_window_motion': StressTestWindowMotion,
    'stress_test_window_swarm': StressTestWindowSwarm,
    'stress_test_ram_isolation': StressTestRAMIsolation,
    'stress_test_prompt_bar_animation': StressTestPromptBarAnimation,
    'headless_drag_surface_demo': HeadlessDragSurfaceDemo,
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
