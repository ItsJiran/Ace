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
import type { ShellEngine } from './services/shellEngine';
import type { AIContextEngine } from './services/aiContextEngine';
import type { AIContextRagEngine } from './services/aiContextRagEngine';
import type { Notification, NotificationCreateInput } from './schemas/notification';
import type {
  AIGatewayConfig,
  AIGatewayFetchModelsResult,
  AIGatewayResponseResult,
  AIGatewaySidecarHealthResult,
  AIGatewayRadarScanResult,
} from './schemas/ai_gateway';

type SDKProvider = 'openai' | 'google' | 'anthropic';

interface AIGatewaySessionSnapshot {
  sessionId: string;
  sdk: SDKProvider;
  model: string;
  status: 'idle' | 'connected' | 'streaming' | 'error';
  activeOutputRamKey?: string;
  isInsideEventBlock: boolean;
  activeEventBufferLength: number;
  // Enhanced monitoring fields
  summary?: string;
  turns?: Array<{ at: number; role: 'user' | 'assistant' | 'system'; text: string }>;
  context_blocks?: Array<{ at: number; payload: Record<string, unknown> }>;
  used_contexts?: Array<{
    key: string;
    label: string;
    kind: 'summary' | 'history' | 'runtime' | 'tooling' | 'input';
    detail?: string;
    token_estimate?: number;
  }>;
  context_updated_at?: number;
}

interface ACENotificationAPI {
  push: (input: NotificationCreateInput) => Notification;
  remove: (uid: string) => boolean;
  markRead: (uid: string, value?: boolean) => boolean;
  clear: () => void;
  list: () => Notification[];
  memory_uid: string;
}

interface ACEAIGatewayAPI {
  memory_uid: string;
  boot: () => Promise<void>;
  getConfig: () => AIGatewayConfig;
  getActiveSDK: () => SDKProvider | null;
  getActiveModel: () => string | null;
  setActiveSDK: (sdk: SDKProvider | null) => Promise<boolean>;
  setActiveModel: (model: string | null) => Promise<boolean>;
  setSDKApiKey: (sdk: SDKProvider, apiKey: string) => Promise<boolean>;
  getGatewayBaseUrl: () => string;
  healthCheckSidecar: (baseUrl?: string) => Promise<AIGatewaySidecarHealthResult>;
  radarScanPorts: (startPort?: number, endPort?: number) => Promise<AIGatewayRadarScanResult>;
  fetchModels: (sdk: SDKProvider) => Promise<AIGatewayFetchModelsResult>;
  testResponse: (sdk: SDKProvider, model: string, prompt: string) => Promise<AIGatewayResponseResult>;
  createSession: (sdk: SDKProvider, model: string) => Promise<string>;
  closeSession: (sessionId: string) => void;
  listSessions: () => AIGatewaySessionSnapshot[];
  sendToSession: (sessionId: string, prompt: string, reply_to_ram_key: string) => Promise<void>;
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
      ai_gateway: ACEAIGatewayAPI;
      shell: ShellEngine;
      context: AIContextEngine;
      context_rag: AIContextRagEngine;
      notification?: ACENotificationAPI;
    };
  }
}

