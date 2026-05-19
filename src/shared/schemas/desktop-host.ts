import type { SpawnWindowOptions, WindowConfig } from './window';

export type DesktopHostInvokeMethod =
	| 'window.list'
	| 'window.get'
	| 'window.update'
	| 'window.focus'
	| 'window.close'
	| 'window.minimize'
	| 'window.restore'
	| 'window.spawn';

export type DesktopHostWindowSnapshot = Pick<
	WindowConfig,
	| 'window_uid'
	| 'title'
	| 'component'
	| 'x'
	| 'y'
	| 'width'
	| 'height'
	| 'z_index'
	| 'opacity'
	| 'is_locked'
	| 'is_resizeable'
	| 'always_on_top'
	| 'is_minimized'
	| 'window_style'
> & {
	package_ref?: string;
	window_slug?: string;
	process_uid?: string;
};

export type DesktopHostWindowUpdatePayload = {
	window_uid: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	title?: string;
	opacity?: number;
	is_locked?: boolean;
	is_resizeable?: boolean;
	always_on_top?: boolean;
	is_minimized?: boolean;
	window_style?: WindowConfig['window_style'];
};

export type DesktopHostInvokePayloadMap = {
	'window.list': Record<string, never>;
	'window.get': { window_uid: string };
	'window.update': DesktopHostWindowUpdatePayload;
	'window.focus': { window_uid: string };
	'window.close': { window_uid: string };
	'window.minimize': { window_uid: string };
	'window.restore': { window_uid: string };
	'window.spawn': SpawnWindowOptions;
};