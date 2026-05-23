import type { RuntimeTarget } from './events';

export type RPCRuntimeTarget = Exclude<RuntimeTarget, 'broadcast'>;
export type RPCRoute = string;

export type RPCRouteRegistryEntry = {
    route: RPCRoute;
    owner_runtime: RPCRuntimeTarget;
    owner_engine: string;
    registered_at: number;
};

export type RPCRouteRegistryState = Record<RPCRoute, RPCRouteRegistryEntry>;

export type RPCRequestMessage<TPayload extends object = Record<string, unknown>> = {
    type: 'ace:rpc:request';
    id: string;
    source: RPCRuntimeTarget;
    target: RPCRuntimeTarget;
    route: RPCRoute;
    payload: TPayload;
};

export type RPCResponseSuccessMessage = {
    type: 'ace:rpc:response';
    id: string;
    source: RPCRuntimeTarget;
    target: RPCRuntimeTarget;
    success: true;
    result: unknown;
};

export type RPCResponseFailureMessage = {
    type: 'ace:rpc:response';
    id: string;
    source: RPCRuntimeTarget;
    target: RPCRuntimeTarget;
    success: false;
    error: { message: string; stack?: string };
};

export type RPCClaimRouteMessage = {
    type: 'ace:rpc:claim-route';
    id: string;
    source: RPCRuntimeTarget;
    route: RPCRoute;
    owner: string;
};

export type RPCClaimRouteResultMessage = {
    type: 'ace:rpc:claim-route:result';
    id: string;
    target: RPCRuntimeTarget;
    success: true;
    entry: RPCRouteRegistryEntry;
    registry: RPCRouteRegistryState;
} | {
    type: 'ace:rpc:claim-route:result';
    id: string;
    target: RPCRuntimeTarget;
    success: false;
    error: { message: string };
    registry: RPCRouteRegistryState;
    entry?: RPCRouteRegistryEntry;
};

export type RPCReleaseRouteMessage = {
    type: 'ace:rpc:release-route';
    source: RPCRuntimeTarget;
    route: RPCRoute;
    owner: string;
};

export type RPCRegistrySyncRequestMessage = {
    type: 'ace:rpc:registry-sync:request';
    id: string;
    source: RPCRuntimeTarget;
};

export type RPCRegistrySyncMessage = {
    type: 'ace:rpc:registry-sync';
    target: RPCRuntimeTarget | 'broadcast';
    registry: RPCRouteRegistryState;
};

export type RPCResponseMessage = RPCResponseSuccessMessage | RPCResponseFailureMessage;
export type RPCMessage<TPayload extends object = Record<string, unknown>> =
    | RPCRequestMessage<TPayload>
    | RPCResponseMessage
    | RPCClaimRouteMessage
    | RPCClaimRouteResultMessage
    | RPCReleaseRouteMessage
    | RPCRegistrySyncRequestMessage
    | RPCRegistrySyncMessage;

export type RPCRouteHandler<
    TPayload extends object = Record<string, unknown>,
    TResult = unknown,
> = (payload: TPayload, request: RPCRequestMessage<TPayload>) => Promise<TResult> | TResult;