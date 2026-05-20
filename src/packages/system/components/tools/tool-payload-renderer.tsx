import { ToolDuckDuckGoRenderer } from './tool-duckduckgo-renderer';
import { ToolFilesystemRenderer } from './tool-filesystem-renderer';
import { ToolGenericRenderer } from './tool-generic-renderer';
import { ToolPlanningRenderer } from './tool-planning-renderer';
import { resolveToolRendererKind } from './tool-renderer.utils';
import type { ToolRendererProps } from './tool-renderer.utils';
import { ToolWindowRenderer } from './tool-window-renderer';

export function ToolPayloadRenderer(props: ToolRendererProps) {
	const rendererKind = resolveToolRendererKind(props);

	if (rendererKind === 'planning') {
		return <ToolPlanningRenderer {...props} />;
	}

	if (rendererKind === 'window') {
		return <ToolWindowRenderer {...props} />;
	}

	if (rendererKind === 'filesystem') {
		return <ToolFilesystemRenderer {...props} />;
	}

	if (rendererKind === 'duckduckgo') {
		return <ToolDuckDuckGoRenderer {...props} />;
	}

	return <ToolGenericRenderer {...props} />;
}