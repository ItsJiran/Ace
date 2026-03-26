import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockRuntime } from '#/schemas/parser';

export const registry: AceRegistryType.Component = {
    name: 'parser_block_registry_list',
    slug: 'parser-block-registry-list',
    react_behavior: 'parser_block_registry_list',
};

export default function ParserBlockRegistryList() {
    const blocks: ParserBlockRuntime[] = window.ACE.registry.listParserBlocks();

    return (
        <div className="h-full w-full overflow-auto bg-zinc-950 text-zinc-200 p-3">
            <div className="mb-3">
                <div className="text-xs uppercase tracking-wider text-zinc-500">Parser Blocks</div>
                <div className="text-sm font-semibold">Registered Parser Block List</div>
                <div className="text-[11px] text-zinc-500 mt-1">Total: {blocks.length}</div>
            </div>

            {blocks.length === 0 && (
                <div className="rounded border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-400">
                    No parser block registered.
                </div>
            )}

            <div className="space-y-2">
                {blocks.map((item) => (
                    <div key={`${item.package_name}:${item.slug}`} className="rounded border border-zinc-800 bg-zinc-900/70 p-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-zinc-400">{item.package_name}:parsers:{item.slug}</div>
                            <div className="text-[10px] rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">&lt;{item.tag_name}&gt;</div>
                        </div>
                        <div className="mt-1 text-sm font-medium text-zinc-100">{item.schema.purpose}</div>
                        {item.aliases.length > 0 && (
                            <div className="mt-2 text-[11px] text-zinc-400">aliases: {item.aliases.join(', ')}</div>
                        )}
                        {item.schema.requiredFields && (
                            <div className="mt-1 text-[11px] text-zinc-400">required: {item.schema.requiredFields}</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
