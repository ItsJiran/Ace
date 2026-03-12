import { DBEngine } from './services/dbEngine';
import { ConfigEngine } from './services/configEngine';
import { WindowEngine } from './services/windowEngine';

/**
 * ACE Boot Sequence
 * Orchestrates the initialization of all core singletons.
 * This should be called exactly once before the React app mounts.
 */
export async function bootACE() {
    console.group('🚀 ACE: Booting System...');

    try {
        // 1. Initialize Persistence Layer
        console.log('1/3 Initializing Database...');
        await DBEngine.init();

        // 2. Initialize Config & Keybinds (Syncs DB to RAM)
        console.log('2/3 Refreshing Configuration RAM...');
        await ConfigEngine.boot();

        // 3. Initialize Window Engine (Depends on RAM being ready)
        // Note: WindowEngine is a singleton that auto-init in constructor,
        // but it's safe to reference it here to ensure it exists.
        console.log('3/3 Initializing Window Engine...');
        // @ts-ignore - Just ensuring it's instantiated
        const _ = WindowEngine;

        console.log('✅ ACE: System Ready.');
    } catch (error) {
        console.error('❌ ACE: Boot Failed!', error);
    } finally {
        console.groupEnd();
    }
}
