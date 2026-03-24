import type { RegistryEngine } from './services/registryEngine';
import type { WidgetEngine } from './services/widgetEngine';
import type { ToolEngine } from './services/toolEngine';
import type { ProcessEngine } from './services/processEngine';
import type { WindowEngine } from './services/windowEngine';
import type { EventBus } from './services/eventEngine';
import type { StorageEngine } from './services/storageEngine';
import type { PipelineEngine } from './services/pipelineEngine';
import type { ConfigEngine } from './services/configEngine';
import type { LayoutEngine } from './services/layoutEngine';
import type { KeybindEngine } from './services/keybindEngine';
import type { GlobalStateManager } from './services/globalStateManager';
import type { LoggerEngine } from './services/loggerEngine';
import type { Notification, NotificationCreateInput } from './schemas/notification';

interface ACENotificationAPI {
  push: (input: NotificationCreateInput) => Notification;
  remove: (uid: string) => boolean;
  markRead: (uid: string, value?: boolean) => boolean;
  clear: () => void;
  list: () => Notification[];
  memory_uid: string;
}

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
      config: ConfigEngine;
      layout: LayoutEngine;
      keybind: KeybindEngine;
      global: GlobalStateManager;
      logger: LoggerEngine;
      notification?: ACENotificationAPI;
    };
  }
}

