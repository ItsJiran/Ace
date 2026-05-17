import type { AceRegistryType } from '#/schemas/registry-types';
import { AceWindow } from '#/components/layout/ace-window';
import RendererRegistryList from '../components/renderer-registry-list';

export const registry: AceRegistryType.Window = {
    name: 'renderer_registry_list_window',
    slug: 'renderer-registry-list-window',
    react_behavior: 'window_shell',
    default_config: {
        x: 280,
        y: 120,
        width: 560,
        height: 460,
        title: 'Renderer Registry',
        chrome_style: 'standard',
    },
};

export default function RendererRegistryListWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            <RendererRegistryList />
        </AceWindow>
    );
}
