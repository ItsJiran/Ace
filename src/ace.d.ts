import type { RegistryEngine } from './services/registryEngine';
import type { WidgetEngine } from './services/widgetEngine';
import type { ToolEngine } from './services/toolEngine';

import type { WindowEngine } from './services/windowEngine';
import type { EventBus } from './services/eventEngine';

import type { PipelineEngine } from './services/pipelineEngine';
import type { ConfigEngine } from './services/configEngine';
import type { LayoutEngine } from './services/layoutEngine';
import type { KeybindEngine } from './services/keybindEngine';
import type { GlobalStateManager } from './services/globalStateManager';
import type { LoggerEngine } from './services/loggerEngine';
import type { ShellEngine } from './services/shellEngine';
import type { AIContextEngine } from './services/aiContextEngine';
import type { AIContextMemoryEngine } from './services/aiContextMemoryEngine';
import type { KernelEngine } from './services/kernelEngine';
import type { Notification, NotificationCreateInput } from './schemas/notification';
import type { SDKProvider, AISessionStatus } from './services/aiGateway/types';
import type {
  AIGatewayConfig,
  AIGatewayFetchModelsResult,
  AIGatewayResponseResult,
  AIGatewaySidecarHealthResult,
  AIGatewayRadarScanResult,
} from './schemas/ai_gateway';

interface AIGatewaySessionSnapshot {
  sessionId: string;
  sdk: SDKProvider;
  model: string;
  status: AISessionStatus;
  activeOutputRamKey?: string;
  isInsideEventBlock: boolean;
  activeEventBufferLength: number;
  // Enhanced monitoring fields
  summary?: string;
  turns?: Array<{ at: number; role: 'user' | 'assistant' | 'system'; text: string }>;
  history_summaries?: Array<{
    at: number;
    block_slug: 'history_summary_ai_prompt' | 'history_summary_ai_response';
    source: 'ai_parsed' | 'raw' | 'fallback';
    summary: string;
    memory_key?: string;
    ref_uid?: string;
    payload: Record<string, unknown>;
  }>;
  context_blocks?: Array<{ at: number; payload: Record<string, unknown> }>;
  used_contexts?: Array<{
    key: string;
    label: string;
    kind: 'summary' | 'history' | 'runtime' | 'tooling' | 'input';
    detail?: string;
    token_estimate?: number;
  }>;
  context_updated_at?: number;
  protocol_state?: {
    request_started_at: number;
    finished_at?: number;
    summary_paragraph_threshold: number;
    prompt_paragraph_count: number;
    response_paragraph_count: number;
    require_prompt_summary: boolean;
    require_response_summary: boolean;
    prompt_memory_key: string;
    prompt_ref_uid?: string;
    response_memory_key: string;
    response_ref_uid?: string;
    prompt_summary_received: boolean;
    prompt_summary_valid: boolean;
    response_summary_received: boolean;
    response_summary_valid: boolean;
    fallback_prompt_summary_used: boolean;
    fallback_response_summary_used: boolean;
    violations: string[];
  };
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
  sendToSession: (sessionId: string, prompt: string, reply_to_ram_key: string, parent_process_uid?: string) => Promise<void>;
}

declare global {
  interface Window {
    ACE: {
      registry: RegistryEngine;
      widget: WidgetEngine;
      tool: ToolEngine;
      kernel: InstanceType<typeof KernelEngine>;
      window: WindowEngine;
      event: EventBus;
      storage: InstanceType<typeof KernelEngine>;
      pipeline: PipelineEngine;
      config: ConfigEngine;
      layout: LayoutEngine;
      keybind: KeybindEngine;
      global: GlobalStateManager;
      logger: LoggerEngine;
      ai_gateway: ACEAIGatewayAPI;
      shell: ShellEngine;
      context: AIContextEngine;
      context_memory: AIContextMemoryEngine;
      // parser: ParserEngine;
      notification?: ACENotificationAPI;
      hooks: {
        // React hooks for external packages
        // Lazy-loaded via src/services/bridgeHooks.ts
        useProcessContext?: () => { process_uid?: string; parent_process_uid?: string };
      };
    };
  }
}

