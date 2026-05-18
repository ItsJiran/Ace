import type { RegistryEngine } from './engines/registry-engine';
import type { ToolEngine } from './engines/tool-engine';

import type { WindowEngine } from './engines/window-engine';
import type { EventBus } from './engines/event-engine';

import type { ConfigEngine } from './engines/config-engine';
import type { KeybindEngine } from './engines/keybind-engine';
import type { GlobalStateManager } from './engines/global-state-manager';
import type { LoggerEngine } from './engines/logger-engine';
import type { AIContextEngine } from './engines/aiContextEngine';
import type { AIContextMemoryEngine } from './engines/ai-context-memory-engine';
import type { KernelEngine } from './engines/kernel-engine';
import type { Notification, NotificationCreateInput } from './schemas/notification';
import type { SDKProvider, AISessionStatus } from './engines/aiGateway/types';
import type {
  AIGatewayConfig,
  AIGatewayFetchModelsResult,
  AIGatewayResponseResult,
  AIGatewaySidecarHealthResult,
  AIGatewayRadarScanResult,
} from './schemas/ai-gateway';

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
  getActiveProvider: () => SDKProvider | null;
  getActiveSDK: () => SDKProvider | null;
  getActiveModel: () => string | null;
  setActiveProvider: (provider: SDKProvider | null) => Promise<boolean>;
  setActiveSDK: (sdk: SDKProvider | null) => Promise<boolean>;
  setActiveModel: (model: string | null) => Promise<boolean>;
  setProviderApiKey: (provider: SDKProvider, apiKey: string) => Promise<boolean>;
  setSDKApiKey: (sdk: SDKProvider, apiKey: string) => Promise<boolean>;
  getGatewayBaseUrl: () => string;
  healthCheckSidecar: (baseUrl?: string) => Promise<AIGatewaySidecarHealthResult>;
  radarScanPorts: (startPort?: number, endPort?: number) => Promise<AIGatewayRadarScanResult>;
  fetchModels: (provider: SDKProvider) => Promise<AIGatewayFetchModelsResult>;
  testResponse: (provider: SDKProvider, model: string, prompt: string) => Promise<AIGatewayResponseResult>;
  createSession: (sdk: SDKProvider, model: string) => Promise<string>;
  closeSession: (sessionId: string) => void;
  listSessions: () => AIGatewaySessionSnapshot[];
  sendToSession: (sessionId: string, prompt: string, reply_to_ram_key: string, parent_process_uid?: string) => Promise<void>;
}

declare global {
  interface Window {
    ACE: {
      global: GlobalStateManager;


      registry: RegistryEngine;
      widget: WidgetEngine;
      tool: ToolEngine;
      kernel: InstanceType<typeof KernelEngine>;
      window: WindowEngine;
      event: EventBus;
      storage: InstanceType<typeof KernelEngine>;
      config: ConfigEngine;
      keybind: KeybindEngine;
      logger: LoggerEngine;
      ai_gateway: ACEAIGatewayAPI;
      context: AIContextEngine;
      context_memory: AIContextMemoryEngine;
      // parser: ParserEngine;
      notification?: ACENotificationAPI;
    };
  }
}

