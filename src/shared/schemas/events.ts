export type EventSlug = string;

export interface EventData<TPayload = Record<string, unknown>, TMeta = Record<string, unknown>> {
    payload: TPayload;
    meta?: TMeta | undefined;
}

export type ListenerHandler<TPayload = Record<string, unknown>, TMeta = Record<string, unknown>> = (
    event?: EventData<TPayload, TMeta>,
) => Promise<any> | void;

export type ListenerUid = string;
export type ListenerMap = Map<EventSlug, Map<ListenerUid, ListenerHandler<any, any>>>;
