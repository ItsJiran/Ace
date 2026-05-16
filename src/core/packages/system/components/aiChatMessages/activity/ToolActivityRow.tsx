import type { AIRenderer } from '#/schemas/ai';

import Renderer from '../Renderer';

export function ToolActivityRow({ renderer }: { renderer: AIRenderer }) {
    return (
        <div className="overflow-hidden rounded-lg transition-all duration-200 ease-out">
            <Renderer renderer={renderer} />
        </div>
    );
}
