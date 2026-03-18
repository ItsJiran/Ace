import type { AceRegistryType } from '#/schemas/registryTypes';
import { useEffect, useState } from 'react';
import { EventBus } from '#/services/eventEngine';

type RouteItem = {
    route: string;
    handlers: number;
};

export const registry: AceRegistryType.Component = {
    name: 'event_registry_list',
    data_requirements: ['system:events'],
    react_behavior: 'dev_event_registry',
};

export function EventRegistryList() {
    const [routes, setRoutes] = useState<RouteItem[]>([]);

    useEffect(() => {
        const refresh = () => {
            const map = ((EventBus as unknown as { routes?: Map<string, Function[]> }).routes) || new Map();
            const next: RouteItem[] = Array.from(map.entries()).map(([route, handlers]) => ({
                route,
                handlers: handlers.length,
            }));
            next.sort((a, b) => a.route.localeCompare(b.route));
            setRoutes(next);
        };

        refresh();
        const id = window.setInterval(refresh, 800);
        return () => window.clearInterval(id);
    }, []);

    return (
        <div className="h-full w-full bg-zinc-950/90 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/90">
                <p className="text-xs font-semibold text-purple-300">Event Registry List</p>
                <p className="text-[11px] text-zinc-500">Registered EventBus routes</p>
            </div>
            <div className="flex-1 overflow-auto p-2">
                {routes.length === 0 ? (
                    <p className="text-xs text-zinc-500">No routes registered.</p>
                ) : (
                    <div className="space-y-2">
                        {routes.map((item) => (
                            <div key={item.route} className="rounded border border-zinc-800 bg-zinc-900/60 p-2 text-[11px]">
                                <div className="text-zinc-300">{item.route}</div>
                                <div className="text-zinc-500">handlers: {item.handlers}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
