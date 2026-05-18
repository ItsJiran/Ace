import { vi } from 'vitest';

async function loadFreshEngineSet() {
    vi.resetModules();

    const [{ ConfigEngine }, { KeybindEngine }, { EventBus }, { KernelEngine }, { FSEngine }] =
        await Promise.all([
            import('#/engines/config-engine'),
            import('#/engines/keybind-engine'),
            import('#/engines/event-engine'),
            import('#/engines/kernel-engine'),
            import('#/engines/fs-engine'),
        ]);

    return { ConfigEngine, KeybindEngine, EventBus, KernelEngine, FSEngine };
}

export default loadFreshEngineSet;