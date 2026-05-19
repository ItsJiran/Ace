import type { EventData, EventSlug, ListenerHandler, ListenerMap, ListenerUid } from '#/shared/schemas/events';
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

    async emit<TEventPayload = Record<string, unknown>, TEventMeta = Record<string, unknown>>(
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
}

// Export as a pure Singleton
export const EventBus = new EventEngineSingleton();
