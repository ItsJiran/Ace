import { describe, it, expect, beforeEach } from 'vitest';
import { WidgetEngine } from '#/services/widget-engine';
import { RegistryEngine } from '#/services/registry-engine';

const pkgName = 'example/system-monitor';

function registerExamplePackage() {
    RegistryEngine.registerPackage({
        manifest: {
            namespace: pkgName,
            package_name: pkgName,
            version: '1.0.0',
            owner_scope: 'user',
            source_scope: 'local',
            author: 'ExampleDeveloper',
        },
        domains: {
            widgets: {
                system_monitor_widget: {
                    metadata: {
                        name: 'System Monitor Widget',
                    },
                    implementation: {},
                    locator: { module_path: 'mock' },
                },
            },
            components: {
                SystemMonitorComponent: {
                    metadata: {
                        name: 'SystemMonitorComponent',
                        react_behavior: 'headless_data_monitor',
                    },
                    listens_to: [
                        {
                            listened_event: 'os_metric_update',
                            reaction: {
                                reaction_type: 'store_in_ram',
                                action: 'sys_metric_buffer',
                            },
                        },
                        {
                            listened_event: 'critical_system_alert',
                            reaction: {
                                reaction_type: 'emit_interaction',
                                action: 'open_alert_window',
                            },
                        },
                    ],
                    implementation: {},
                    locator: { module_path: 'mock' },
                },
            },
            windows: {
                system_monitor_window: {
                    metadata: {
                        name: 'System Monitor Window',
                        component_name: 'SystemMonitorComponent',
                    },
                    implementation: {},
                    locator: { module_path: 'mock' },
                },
            },
        },
    });
}

describe('Widget Engine (Registry Manager)', () => {
    beforeEach(() => {
        registerExamplePackage();
    });

    it('should resolve a widget from registry domains', () => {
        const resolved = WidgetEngine.getRegistry({
            packageRef: pkgName,
            slug: 'system_monitor_widget',
        });

        expect(resolved).toBeDefined();
        expect(resolved?.entry).toBeDefined();
    });

    it('should throw when registering malformed package manifest', () => {
        expect(() => {
            RegistryEngine.registerPackage({
                manifest: {
                    package_name: 'bad/package',
                    version: '1.0.0',
                    owner_scope: 'invalid_scope',
                    source_scope: 'local',
                },
                domains: {},
            });
        }).toThrow();
    });

    it('should be able to look up a component definition by name', () => {
        const componentDef = WidgetEngine.getComponent({
            packageRef: pkgName,
            slug: 'SystemMonitorComponent',
        });

        expect(componentDef).toBeDefined();
        expect((componentDef?.entry as any)?.metadata?.react_behavior).toBe('headless_data_monitor');
    });

    it('should be able to find which components listen to a specific backend OS event', () => {
        const listeners = WidgetEngine.getComponentsListeningTo('os_metric_update');

        expect(listeners.length).toBeGreaterThan(0);
        const hasExpected = listeners.some((entry) => {
            const metadata = (entry as any)?.metadata;
            return metadata?.name === 'SystemMonitorComponent';
        });
        expect(hasExpected).toBe(true);

        const emptyListeners = WidgetEngine.getComponentsListeningTo('random_hallucinated_event');
        expect(emptyListeners.length).toBe(0);
    });
});
