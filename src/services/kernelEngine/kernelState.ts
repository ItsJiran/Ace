import { KernelProcessEntry, KernelSharedEntry } from './types';

class KernelStateSingleton {
    public readonly physical_ram = new Map<string, any>();
    public readonly change_listeners = new Set<() => void>();
    private kernel_space_open = false;

    bootKernelSpace(): void {
        this.kernel_space_open = true;
        this.physical_ram.clear();
        this.physical_ram.set('system:process_system', new Map<string, KernelProcessEntry>());
        this.physical_ram.set('system:shared_system',  new Map<string, KernelSharedEntry>());
        this.physical_ram.set('system:window_system',  new Map<string, Set<string>>());
    }

    sealKernelSpace(): void {
        this.kernel_space_open = false;
    }

    isKernelSpaceOpen(): boolean {
        return this.kernel_space_open;
    }

    resetKernelSpace(): void {
        this.change_listeners.clear();
        this.bootKernelSpace();
        this.sealKernelSpace();
    }

    get proc_sys(): Map<string, KernelProcessEntry> {
        return this.physical_ram.get('system:process_system') as Map<string, KernelProcessEntry>;
    }

    get window_sys(): Map<string, Set<string>> {
        return this.physical_ram.get('system:window_system') as Map<string, Set<string>>;
    }
}

export const KernelState = new KernelStateSingleton();
