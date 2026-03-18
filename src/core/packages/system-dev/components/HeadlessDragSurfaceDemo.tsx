import type { AceRegistryType } from '#/schemas/registryTypes';
interface HeadlessDragSurfaceDemoProps {
    windowUid: string;
}

export const registry: AceRegistryType.Component = {
    name: 'headless_drag_surface_demo',
    react_behavior: 'dev_drag_demo',
};

export function HeadlessDragSurfaceDemo({ windowUid }: HeadlessDragSurfaceDemoProps) {
    return (
        <div className="h-full w-full rounded-[28px] border border-cyan-400/30 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.28),_rgba(8,47,73,0.9)_42%,_rgba(5,10,20,0.98)_100%)] p-5 text-cyan-50 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="flex h-full flex-col justify-between rounded-[22px] border border-white/10 bg-black/20 p-5 backdrop-blur-sm">
                <div>
                    <div className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/70">Headless Window</div>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight">Full Surface Drag Test</h3>
                    <p className="mt-3 max-w-xs text-sm leading-6 text-cyan-100/75">
                        Window ini tidak pakai topbar. Drag dari area mana pun di surface ini. Klik kanan di mana pun untuk buka popup kontrol window.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs text-cyan-100/80">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/60">UID</div>
                        <div className="mt-2 break-all font-mono">{windowUid}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/60">Mode</div>
                        <div className="mt-2 font-medium">borderless + full drag</div>
                    </div>
                </div>
            </div>
        </div>
    );
}