import { ToolDuckDuckGoRenderer } from './tool-duckduckgo-renderer';
import { ToolErrorRenderer } from './tool-error-renderer';
import { ToolFilesystemRenderer } from './tool-filesystem-renderer';
import { ToolPlanningRenderer } from './tool-planning-renderer';
import { ToolWindowRenderer } from './tool-window-renderer';

import { ToolGenericRenderer } from './tool-generic-renderer';
import type { ToolRendererProps } from './tool-renderer.utils';
import { resolveToolRendererKind } from './tool-renderer.utils';

export function ToolPayloadRenderer(props: ToolRendererProps) {
	const rendererKind = resolveToolRendererKind(props);

	// if (rendererKind === 'planning') {
	// 	return <ToolPlanningRenderer {...props} />;
	// }

	// if (rendererKind === 'window') {
	// 	return <ToolWindowRenderer {...props} />;
	// }

	// if (rendererKind === 'error') {
	// 	return <ToolErrorRenderer {...props} />;
	// }

	// if (rendererKind === 'filesystem') {
	// 	return <ToolFilesystemRenderer {...props} />;
	// }

	// if (rendererKind === 'duckduckgo') {
	// 	return <ToolDuckDuckGoRenderer {...props} />;
	// }

	return <ToolGenericRenderer {...props} />;
}