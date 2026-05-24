export type WorkflowNodeName = 'agent';

export type EmitProtocolThreadEvent = (threadUid: string, message: Record<string, unknown>) => void;

export type EmitRecord = (message: Record<string, unknown>) => void;

export type NextProtocolSeq = () => number;