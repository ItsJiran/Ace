import { BootupPipeline, type BootupContext } from '#/core/packages/system/pipelines/BootupPipeline';
import { RegistryEngine } from '#/services/registryEngine';

let bootPromise: Promise<void> | null = null;

/**
 * ACE Boot Sequence
 * Orchestrates the initialization of all core singletons.
 * This should be called exactly once before the React app mounts.
 */
export async function bootACE() {
    if (bootPromise) {
        return bootPromise;
    }

    bootPromise = (async () => {
        console.group('🚀 ACE: Booting System...');
        
        // Initialize window.ACE registry bridge immediately so packages can register
        if (typeof window !== 'undefined') {
            (window as any).ACE = {
                registry: {
                    registerPackage: (manifest: unknown) => RegistryEngine.registerPackage(manifest),
                    registerPackageModules: (packageName: string, modules: Record<string, unknown>) =>
                        RegistryEngine.registerPackageDomainsFromModules(packageName, modules),
                }
            };
            console.log('🔌 ACE Registry Bridge Initialized.');
        }

        const pipeline = new BootupPipeline();        const context: BootupContext = { startTime: Date.now() };

        try {
            await pipeline.run(undefined, context);
            console.log('✅ ACE: System Ready.');
        } catch (error) {
            console.error('❌ ACE: Boot Failed!', error);
            throw error;
        } finally {
            console.groupEnd();
        }
    })();

    return bootPromise;
}
