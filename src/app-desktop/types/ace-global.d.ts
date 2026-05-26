type EventRouteRegistrable = {
    registerEventRoutes?: () => void;
};

type AIGatewayBridge = {
    memory_uid: string;
    boot: () => Promise<void> | void;
    fetchModels: (provider: string) => Promise<unknown> | unknown;
    syncModels?: (provider: string) => Promise<unknown> | unknown;
    syncAIMemory?: () => Promise<unknown> | unknown;
    getBackgroundStatus?: () => Promise<unknown> | unknown;
    listThreads?: () => Promise<unknown> | unknown;
    createThread?: (initialState?: Record<string, unknown>) => Promise<unknown> | unknown;
    setCurrentThread?: (threadUid: string | null) => Promise<unknown> | unknown;
    readThread?: (threadUid: string) => Promise<unknown> | unknown;
    syncCurrentThreadFromBackground?: (threadUid: string) => Promise<unknown> | unknown;
    syncThread?: (threadUid: string, payload?: Record<string, unknown>) => Promise<unknown> | unknown;
    startThreadPrompt?: (threadUid: string, prompt: string, overrides?: Record<string, unknown>) => Promise<unknown> | unknown;
    deleteThread?: (threadUid: string) => Promise<unknown> | unknown;
    invoke?: (method: string, payload?: Record<string, unknown>) => Promise<unknown> | unknown;
};

type ACEBridge = {
    registry: typeof import('#/engines/registry-engine').RegistryEngine;
    kernel: typeof import('#/engines/kernel-engine').KernelEngine;
    window: typeof import('#/engines/window-engine').WindowEngine;
    event: typeof import('#/engines/event-engine').EventBus;
    storage: typeof import('#/engines/kernel-engine').KernelEngine;
    config: typeof import('#/engines/config-engine').ConfigEngine;
    ai: AIGatewayBridge;
    ai_gateway: AIGatewayBridge;
    keybind: typeof import('#/engines/keybind-engine').KeybindEngine;
    state: typeof import('#/engines/state-engine').StateEngine;
    logger: typeof import('#/engines/logger-engine').LoggerEngine;
    tool: EventRouteRegistrable;
    context?: EventRouteRegistrable;
    parser?: EventRouteRegistrable;
};

declare global {
    interface Window {
        ACE: ACEBridge;
    }
}

export {};