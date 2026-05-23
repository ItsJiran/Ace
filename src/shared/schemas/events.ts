export type EventSlug = string;

export interface EventData<TPayload = Record<string, unknown>, TMeta = Record<string, unknown>> {
    payload: TPayload;
    meta?: TMeta | undefined;
}

export type RuntimeTarget = 'desktop' | 'background' | 'broadcast';

export type CrossRuntimeEventMessage<
    TPayload = Record<string, unknown>,
    TMeta = Record<string, unknown>,
> = {
    type: 'ace:runtime:event';
    target: RuntimeTarget;
    slug: EventSlug;
    event_data: EventData<TPayload, TMeta>;
};

export type ListenerHandler<TPayload = Record<string, unknown>, TMeta = Record<string, unknown>> = (
    event?: EventData<TPayload, TMeta>,
) => Promise<any> | void;

export type ListenerUid = string;
export type ListenerMap = Map<EventSlug, Map<ListenerUid, ListenerHandler<any, any>>>;
