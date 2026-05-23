import type {
    CrossRuntimeEventMessage,
    EventData,
    EventSlug,
    ListenerHandler,
    ListenerMap,
    ListenerUid,
    RuntimeTarget,
} from '#/shared/schemas/events';
import { KernelEngine } from './kernel-engine';

class EventEngineSingleton {
    /**
     * Event Routing System
     * - React Components (The Waiter) or Gateways emit events with a specific slug and payload.
     * - Background Processes (The Chef) register listeners for specific slugs.
     * - The Event Engine routes emitted events to the appropriate listeners based on slug matching.
     */
    private EventListeners: ListenerMap = new Map<EventSlug, Map<ListenerUid, ListenerHandler<any, any>>>();

    // Predefined memory slot for event stream data, for logging events happened.
    public readonly eventStreamMemoryUid = 'system:event_stream';
    private hasBoundRuntimeBridge = false;

    private resolveCurrentRuntime(): Exclude<RuntimeTarget, 'broadcast'> | null {
        if (typeof window !== 'undefined') {
            return 'desktop';
        }

        if (typeof process !== 'undefined' && process.env?.ACE_RUNTIME_MODE === 'background') {
            return 'background';
        }

        return null;
    }

    private shouldHandleIncomingEvent(target: RuntimeTarget) {
        const currentRuntime = this.resolveCurrentRuntime();
        return Boolean(currentRuntime && (target === currentRuntime || target === 'broadcast'));
    }

    private async relayIncomingRuntimeEvent(event: CrossRuntimeEventMessage) {
        if (!event || typeof event !== 'object' || typeof event.slug !== 'string') {
            console.warn('[EventBus] Received invalid cross-runtime event payload:', event);
            return;
        }

        if (!this.shouldHandleIncomingEvent(event.target)) {
            return;
        }

        const eventData = event.event_data;
        if (!eventData || typeof eventData !== 'object') {
            console.warn(`[EventBus] Missing event data for cross-runtime slug: ${event.slug}`);
            return;
        }

        await this.emit(event.slug, eventData);
    }

    /**
     * A background Process (The Chef) "mounts" itself to listen for a specific action.
     * The handler receives a unified context object with `payload`, `meta`, and `slug`.
     * Listeners can optionally define a `validation_schema` to validate incoming payloads.
     */
    setupKernelSpace() {
        KernelEngine.registerSystemMemory(this.eventStreamMemoryUid, [] as Array<Record<string, unknown>>);
    }

    /**
     * A background Process (The Chef) "mounts" itself to listen for a specific action.
     * The handler receives a unified context object with `payload`, `meta`, and `slug`.
     * Listeners can optionally define a `validation_schema` to validate incoming payloads.
     *
     * @return A function to unregister the listener, which can be used for cleanup.
     */
    listen<TPayload = Record<string, unknown>, TMeta = Record<string, unknown>>(
        slug: EventSlug,
        handler: ListenerHandler<TPayload, TMeta>,
    ): () => void {
        if (!this.EventListeners.has(slug)) {
            this.EventListeners.set(slug, new Map<ListenerUid, ListenerHandler<any, any>>());
        }

        const listeners = this.EventListeners.get(slug)!;
        const listenerUid: ListenerUid = crypto.randomUUID();
        const listener: ListenerHandler<TPayload, TMeta> = handler;
        listeners.set(listenerUid, listener);

        return () => {
            const listeners = this.EventListeners.get(slug);
            if (listeners) {
                listeners.delete(listenerUid);
                if (listeners.size === 0) {
                    this.EventListeners.delete(slug);
                }
            }
        };
    }

    async emit<
        TEventPayload extends Record<string, unknown> = Record<string, unknown>,
        TEventMeta extends Record<string, unknown> = Record<string, unknown>,
    >(
        slug: EventSlug,
        event_data: EventData<TEventPayload, TEventMeta>,
    ) {
        const listeners = this.EventListeners.get(slug);

        if (!listeners || listeners.size === 0) {
            console.warn(`[EventBus] No process is listening to event slug: ${slug}`);
            return;
        }

        // Write to event stream memory for logging event runned, so it can be displayed in the Event Inspector.
        KernelEngine.writeMemory(this.eventStreamMemoryUid, [
            ...(KernelEngine.readMemory(this.eventStreamMemoryUid) as Array<Record<string, unknown>>),
            { slug, event_data },
        ]);

        listeners.forEach((listener) => {
            try {
                Promise.resolve(listener(event_data)).catch((err) => console.error(`[EventBus] Async handler crashed on slug ${slug}:`, err));
            } catch (error) {
                console.error(`[EventBus] Error in handler for slug "${slug}":`, error);
            }
        });
    }

    async emitToRuntime<
        TEventPayload extends Record<string, unknown> = Record<string, unknown>,
        TEventMeta extends Record<string, unknown> = Record<string, unknown>,
    >(
        target: RuntimeTarget,
        slug: EventSlug,
        event_data: EventData<TEventPayload, TEventMeta>,
    ) {
        const currentRuntime = this.resolveCurrentRuntime();

        if (currentRuntime && (target === currentRuntime || target === 'broadcast')) {
            await this.emit(slug, event_data);
        }

        if (!currentRuntime || target === currentRuntime) {
            return;
        }

        const message: CrossRuntimeEventMessage<TEventPayload, TEventMeta> = {
            type: 'ace:runtime:event',
            target,
            slug,
            event_data,
        };

        if (currentRuntime === 'background' && typeof process.send === 'function') {
            process.send(message);
            return;
        }

        if (currentRuntime === 'desktop' && window.electronAPI?.emitRuntimeEvent) {
            window.electronAPI.emitRuntimeEvent(message);
            return;
        }

        console.warn(`[EventBus] Runtime bridge is unavailable for slug: ${slug}`);
    }

    /**
     * Setup a runtime bridge for cross-process event bus emit and listen, for example between desktop and background.
     * This keeps runtime transports in one place while engines continue to speak in local EventBus slugs.
     *
     * Desktop <-> IPC ELECTRON <-> NODE PROCESS <-> Background
     */

    async setupRuntimeBridge() {
        if (this.hasBoundRuntimeBridge) {
            return;
        }

        this.hasBoundRuntimeBridge = true;

        if (typeof window !== 'undefined' && window.electronAPI?.onRuntimeEvent) {
            window.electronAPI.onRuntimeEvent((event) => {
                void this.relayIncomingRuntimeEvent(event);
            });
            return;
        }

        if (typeof process.on === 'function') {
            process.on('message', (message) => {
                const event = message as Partial<CrossRuntimeEventMessage>;
                if (event.type !== 'ace:runtime:event') {
                    return;
                }

                void this.relayIncomingRuntimeEvent(event as CrossRuntimeEventMessage);
            });
        }
    }
}

// Export as a pure Singleton
export const EventBus = new EventEngineSingleton();
