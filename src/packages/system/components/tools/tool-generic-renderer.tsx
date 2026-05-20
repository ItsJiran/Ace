import { Braces, Hammer } from 'lucide-react';

import { ToolSection } from './tool-renderer-shared';
import type { ToolRendererProps } from './tool-renderer.utils';

export function ToolGenericRenderer({ content, artifact }: ToolRendererProps) {
	return (
		<div className="flex flex-col gap-3">
			<ToolSection title="Output" icon={Hammer} value={content} />
			<ToolSection title="Artifact" icon={Braces} value={artifact} />
		</div>
	);
}