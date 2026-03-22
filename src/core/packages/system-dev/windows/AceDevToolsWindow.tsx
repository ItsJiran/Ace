import type { AceRegistryType } from '#/schemas/registryTypes';
import AceDevTools from '../components/AceDevTools';
import { AceWindow } from '#/components/layout/AceWindow';

export const registry: AceRegistryType.Window = {
    name: 'ace_devtools_window',
    slug: 'ace-devtools-window',
};

export default function AceDevToolsWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            <AceDevTools />
        </AceWindow>
    );
}
