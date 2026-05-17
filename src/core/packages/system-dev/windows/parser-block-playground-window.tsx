import type { AceRegistryType } from '#/schemas/registry-types';
import { AceWindow } from '#/components/layout/ace-window';
// import ParserBlockPlayground from '../components/ParserBlockPlayground';

export const registry: AceRegistryType.Window = {
    name: 'parser_block_playground_window',
    slug: 'parser-block-playground-window',
    react_behavior: 'window_shell',
    default_config: {
        x: 320,
        y: 110,
        width: 860,
        height: 560,
        title: 'Parser Block Playground',
        window_style:'standard',
        is_locked: false,
        always_on_top: false,
    },
};

export default function ParserBlockPlaygroundWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            {/* <ParserBlockPlayground /> */}
        </AceWindow>
    );
}
