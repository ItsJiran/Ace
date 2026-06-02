type WorkflowNodeType = string;
import { AgentStreamAnyEvent } from '#/shared/schemas/agent-stream-events';

export type WorkflowNodeName = WorkflowNodeType;

export type EmitProtocolThreadEvent = (threadUid: string, event: AgentStreamAnyEvent) => void;

export type EmitRecord = (message: Record<string, unknown>) => void;

export type NextProtocolSeq = () => number;