import type { DesktopHostInvokeMethod, DesktopHostInvokePayloadMap } from '#/shared/schemas/desktop-host';

export type DesktopRPCRequestMessage<Method extends DesktopHostInvokeMethod = DesktopHostInvokeMethod> = {
	type: 'ace:background:desktop:request';
	id: string;
	method: Method;
	payload: DesktopHostInvokePayloadMap[Method];
};

export type DesktopRPCResponseSuccessMessage = {
	type: 'ace:background:desktop:response';
	id: string;
	success: true;
	result: unknown;
};

export type DesktopRPCResponseFailureMessage = {
	type: 'ace:background:desktop:response';
	id: string;
	success: false;
	error: { message: string; stack?: string };
};

export type DesktopRPCResponseMessage =
	| DesktopRPCResponseSuccessMessage
	| DesktopRPCResponseFailureMessage;
