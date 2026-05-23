import type { CrossRuntimeEventMessage } from './events';

export type BackgroundRPCRequestMessage = {
	type: 'ace:background:rpc:request';
	id: string;
	method: string;
	payload?: Record<string, unknown>;
};

export type BackgroundRPCResultSuccessMessage = {
	type: 'ace:background:rpc:result';
	id: string;
	success: true;
	result: unknown;
};

export type BackgroundRPCResultFailureMessage = {
	type: 'ace:background:rpc:result';
	id: string;
	success: false;
	error: { message: string; stack?: string };
};

export type BackgroundRPCReadyMessage = {
	type: 'ace:background:ready';
};

export type BackgroundRPCInboundMessage = BackgroundRPCRequestMessage | CrossRuntimeEventMessage;

export type BackgroundRPCOutboundMessage =
	| BackgroundRPCResultSuccessMessage
	| BackgroundRPCResultFailureMessage
	| BackgroundRPCReadyMessage
	| CrossRuntimeEventMessage;
