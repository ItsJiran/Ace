import type { RegistryEngine } from './services/registryEngine';
import type { WidgetEngine } from './services/widgetEngine';
import type { ToolEngine } from './services/toolEngine';
import type { ProcessEngine } from './services/processEngine';
import type { WindowEngine } from './services/windowEngine';
import type { EventBus } from './services/eventEngine';
import type { StorageEngine } from './services/storageEngine';
import type { PipelineEngine } from './services/pipelineEngine';

declare global {
  interface Window {
    ACE: {
      registry: RegistryEngine;
      widget: WidgetEngine;
      tool: ToolEngine;
      process: ProcessEngine;
      window: WindowEngine;
      event: EventBus;
      storage: StorageEngine;
      pipeline: PipelineEngine;
    };
  }
}

