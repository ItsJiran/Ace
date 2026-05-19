type EventRouteRegistrable = {
    registerEventRoutes?: () => void;
};

type AIGatewayBridge = {
    memory_uid: string;
    boot: () => Promise<void> | void;
    fetchModels: (provider: string) => Promise<unknown> | unknown;
};

type ACEBridge = {
    registry: typeof import('#/engines/registry-engine').RegistryEngine;
    kernel: typeof import('#/engines/kernel-engine').KernelEngine;
    window: typeof import('#/engines/window-engine').WindowEngine;
    event: typeof import('#/engines/event-engine').EventBus;
    storage: typeof import('#/engines/kernel-engine').KernelEngine;
    config: typeof import('#/engines/config-engine').ConfigEngine;
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