import { defineTool } from '#/lib/define-registry';
import { DesktopRPCEngine } from '#/app-background/engines/desktop-rpc-engine';

type AceWindowToolInput = {
	action:
		| 'list_windows'
		| 'get_window'
		| 'focus_window'
		| 'move_window'
		| 'resize_window'
		| 'update_window'
		| 'minimize_window'
		| 'restore_window'
		| 'close_window'
		| 'spawn_window';
	window_uid?: string;
	package?: string;
	window?: string;
	title?: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	opacity?: number;
	is_locked?: boolean;
	is_resizeable?: boolean;
	always_on_top?: boolean;
	window_style?: 'standard' | 'borderless';
};

async function AceWindowTool(input: AceWindowToolInput) {
	switch (input.action) {
		case 'list_windows':
			return await DesktopRPCEngine.invoke('window.list');
		case 'get_window':
			if (!input.window_uid) {
				throw new Error('window_uid is required for get_window.');
			}
			return await DesktopRPCEngine.invoke('window.get', { window_uid: input.window_uid });
		case 'focus_window':
			if (!input.window_uid) {
				throw new Error('window_uid is required for focus_window.');
			}
			return await DesktopRPCEngine.invoke('window.focus', { window_uid: input.window_uid });
		case 'minimize_window':
			if (!input.window_uid) {
				throw new Error('window_uid is required for minimize_window.');
			}
			return await DesktopRPCEngine.invoke('window.minimize', { window_uid: input.window_uid });
		case 'restore_window':
			if (!input.window_uid) {
				throw new Error('window_uid is required for restore_window.');
			}
			return await DesktopRPCEngine.invoke('window.restore', { window_uid: input.window_uid });
		case 'close_window':
			if (!input.window_uid) {
				throw new Error('window_uid is required for close_window.');
			}
			return await DesktopRPCEngine.invoke('window.close', { window_uid: input.window_uid });
		case 'move_window':
		case 'resize_window':
		case 'update_window':
			if (!input.window_uid) {
				throw new Error('window_uid is required for window updates.');
			}
			return await DesktopRPCEngine.invoke('window.update', {
				window_uid: input.window_uid,
				x: input.x,
				y: input.y,
				width: input.width,
				height: input.height,
				title: input.title,
				opacity: input.opacity,
				is_locked: input.is_locked,
				is_resizeable: input.is_resizeable,
				always_on_top: input.always_on_top,
				window_style: input.window_style,
			});
		case 'spawn_window':
			if (!input.package || !input.window) {
				throw new Error('package and window are required for spawn_window.');
			}
			return await DesktopRPCEngine.invoke('window.spawn', {
				package: input.package,
				window: input.window,
				title: input.title,
				x: input.x,
				y: input.y,
				width: input.width,
				height: input.height,
				opacity: input.opacity,
				is_locked: input.is_locked,
				is_resizeable: input.is_resizeable,
				always_on_top: input.always_on_top,
				window_style: input.window_style,
			});
		default:
			throw new Error(`Unsupported AceWindow tool action: ${input.action}`);
	}
}

export default defineTool(AceWindowTool, {
	name: 'ace_window_tool',
	slug: 'ace-window',
	description:
		'Inspect and control ACE windows. Use it to list windows, inspect a window, focus it, move or resize it, minimize or restore it, close it, or spawn a new registered window.',
	parameters: {
		type: 'object',
		properties: {
			action: {
				type: 'string',
				description: 'Which window operation to execute.',
				enum: [
					'list_windows',
					'get_window',
					'focus_window',
					'move_window',
					'resize_window',
					'update_window',
					'minimize_window',
					'restore_window',
					'close_window',
					'spawn_window',
				],
			},
			window_uid: {
				type: 'string',
				description: 'Target ACE window uid for inspect/update/focus/minimize/restore/close actions.',
			},
			package: {
				type: 'string',
				description: 'Package namespace for spawn_window, for example itsjiran/ace-system.',
			},
			window: {
				type: 'string',
				description: 'Registered window slug for spawn_window, for example system-ai-chat-window.',
			},
			title: { type: 'string', description: 'Optional window title override.' },
			x: { type: 'number', description: 'Window X position.' },
			y: { type: 'number', description: 'Window Y position.' },
			width: { type: 'number', description: 'Window width.' },
			height: { type: 'number', description: 'Window height.' },
			opacity: { type: 'number', description: 'Window opacity from 0 to 1.' },
			is_locked: { type: 'boolean', description: 'Disable manual drag when true.' },
			is_resizeable: { type: 'boolean', description: 'Allow manual resize when true.' },
			always_on_top: { type: 'boolean', description: 'Keep window above others when true.' },
			window_style: {
				type: 'string',
				description: 'Window chrome style.',
				enum: ['standard', 'borderless'],
			},
		},
		required: ['action'],
	},
});