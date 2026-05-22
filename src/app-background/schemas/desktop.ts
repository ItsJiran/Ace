export type DesktopRequestSuccess = {
	type: 'ace:background:desktop:response';
	id: string;
	success: true;
	result: unknown;
};

export type DesktopRequestFailure = {
	type: 'ace:background:desktop:response';
	id: string;
	success: false;
	error: { message: string; stack?: string };
};

export type DesktopRequestMessage = DesktopRequestSuccess | DesktopRequestFailure;