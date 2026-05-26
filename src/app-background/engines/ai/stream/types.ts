import type { WorkflowNodeType } from '#/shared/schemas/ai';

export type WorkflowNodeName = WorkflowNodeType;

export type EmitProtocolThreadEvent = (threadUid: string, message: Record<string, unknown>) => void;

export type EmitRecord = (message: Record<string, unknown>) => void;

export type NextProtocolSeq = () => number;