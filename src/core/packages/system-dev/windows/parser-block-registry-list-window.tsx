import type { AceRegistryType } from '#/schemas/registry-types';
import { AceWindow } from '#/components/layout/ace-window';
import ParserBlockRegistryList from '../components/parser-block-registry-list';

export const registry: AceRegistryType.Window = {
    name: 'parser_block_registry_list_window',
    slug: 'parser-block-registry-list-window',
    react_behavior: 'window_shell',
    default_config: {
        x: 260,
        y: 120,
        width: 640,
        height: 460,
        title: 'Parser Block Registry',
        chrome_style: 'standard',
    },
};

export default function ParserBlockRegistryListWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            <ParserBlockRegistryList />
        </AceWindow>
    );
}
