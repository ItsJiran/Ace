import { useState, useEffect } from 'react';
import { Storage } from '#/services/storageEngine';

const MAX_STR_LEN = 300;

const truncate = (val: any): any => {
    if (typeof val === 'string') {
        return val.length > MAX_STR_LEN ? `[string — ${val.length} chars]` : val;
    }
    if (Array.isArray(val)) return val.map(truncate);
    if (val !== null && typeof val === 'object') {
        const out: Record<string, any> = {};
        for (const k of Object.keys(val)) out[k] = truncate(val[k]);
        return out;
    }
    return val;
};

// ─── Primitive leaf ────────────────────────────────────────────────────────
function PrimitiveValue({ value }: { value: any }) {
    if (value === null) return <span className="text-zinc-500">null</span>;
    if (value === undefined) return <span className="text-zinc-500">undefined</span>;
    if (typeof value === 'boolean')
        return <span className="text-purple-400">{String(value)}</span>;
    if (typeof value === 'number')
        return <span className="text-sky-400">{value}</span>;
    if (typeof value === 'string') {
        const display = value.startsWith('[string') ? (
            <span className="text-zinc-500 italic">{value}</span>
        ) : (
            <span className="text-amber-300">"{value}"</span>
        );
        return display;
    }
    return <span className="text-zinc-300">{String(value)}</span>;
}

// ─── Recursive JSON node ───────────────────────────────────────────────────
function JSONNode({ label, value, depth = 0, defaultOpen = false }: {
    label: string;
    value: any;
    depth?: number;
    defaultOpen?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    const isArray = Array.isArray(value);
    const isObject = value !== null && typeof value === 'object';
    const childCount = isObject ? (isArray ? value.length : Object.keys(value).length) : 0;

    const indent = depth * 12;

    if (!isObject) {
        return (
            <div className="flex items-start gap-1.5 py-[1px]" style={{ paddingLeft: indent }}>
                <span className="text-zinc-400 font-mono text-[11px] shrink-0">{label}:</span>
                <span className="font-mono text-[11px]"><PrimitiveValue value={value} /></span>
            </div>
        );
    }

    const bracket = isArray ? ['[', ']'] : ['{', '}'];

    return (
        <div style={{ paddingLeft: indent }}>
            <button
                onClick={() => setIsOpen(o => !o)}
                className="flex items-center gap-1 py-[1px] w-full text-left hover:bg-white/5 rounded group"
            >
                <span className="text-zinc-600 text-[10px] w-3 shrink-0 text-center select-none">
                    {isOpen ? '▾' : '▸'}
                </span>
                <span className="text-zinc-300 font-mono text-[11px]">{label}</span>
                <span className="text-zinc-600 font-mono text-[11px]">
                    {isOpen ? bracket[0] : `${bracket[0]}…${bracket[1]}`}
                </span>
                {!isOpen && (
                    <span className="text-zinc-600 text-[10px] ml-1">
                        {childCount} {childCount === 1 ? 'item' : 'items'}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="border-l border-zinc-800 ml-[6px]">
                    {isArray
                        ? value.map((item: any, i: number) => (
                            <JSONNode key={i} label={String(i)} value={item} depth={depth + 1} />
                          ))
                        : Object.entries(value).map(([k, v]) => (
                            <JSONNode key={k} label={k} value={v} depth={depth + 1} />
                          ))
                    }
                </div>
            )}

            {isOpen && (
                <div style={{ paddingLeft: 12 }}>
                    <span className="text-zinc-600 font-mono text-[11px]">{bracket[1]}</span>
                </div>
            )}
        </div>
    );
}

// ─── Top-level section (GLOBAL_RAM / CLASSIFICATION_INDEX) ────────────────
function RAMSection({ title, data, accent }: {
    title: string;
    data: Record<string, any>;
    accent: string;
}) {
    const [isOpen, setIsOpen] = useState(true);
    const keys = Object.keys(data);

    return (
        <div className="mb-2">
            <button
                onClick={() => setIsOpen(o => !o)}
                className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-white/5"
            >
                <span className="text-zinc-500 text-[10px] w-3 text-center">{isOpen ? '▾' : '▸'}</span>
                <span className={`text-[11px] font-bold uppercase tracking-widest ${accent}`}>{title}</span>
                <span className="text-zinc-600 text-[10px] ml-1">{keys.length} keys</span>
            </button>

            {isOpen && (
                <div className="mt-0.5">
                    {keys.length === 0 ? (
                        <p className="text-[10px] text-zinc-600 italic px-5 py-1">empty</p>
                    ) : (
                        keys.map(k => (
                            <JSONNode key={k} label={k} value={data[k]} depth={1} defaultOpen={false} />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main component ────────────────────────────────────────────────────────
export const config = {
    name: 'ram_viewer',
    data_requirements: ['system:ram'],
    emits_interactions: [],
    listens_to: [],
    react_behavior: 'dev_ram_monitor',
};

export function RAMViewer() {
    const [globalData, setGlobalData] = useState<Record<string, any>>({});
    const [classData, setClassData] = useState<Record<string, any>>({});
    const [refreshedAt, setRefreshedAt] = useState<string>('');

    const refreshRAM = () => {
        const globalRam = (Storage as any).global_ram as Map<string, any>;
        const classRam = (Storage as any).classification_ram as Map<string, string[]>;

        const sanitizedGlobal: Record<string, any> = {};
        for (const [k, v] of globalRam.entries()) {
            sanitizedGlobal[k] = truncate(v);
        }

        setGlobalData(sanitizedGlobal);
        setClassData(Object.fromEntries(classRam.entries()));
        setRefreshedAt(new Date().toLocaleTimeString());
    };

    useEffect(() => { refreshRAM(); }, []);

    return (
        <div className="flex flex-col h-full bg-zinc-950/50 rounded overflow-hidden border border-zinc-800">
            <div className="p-2 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-500 uppercase">Live RAM Mapping</span>
                    {refreshedAt && (
                        <span className="text-[10px] text-zinc-600">@ {refreshedAt}</span>
                    )}
                </div>
                <button
                    onClick={refreshRAM}
                    className="text-xs bg-emerald-900/40 text-emerald-400 px-2 py-1 rounded hover:bg-emerald-800/60 transition-colors duration-75"
                >
                    Refresh
                </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
                <RAMSection title="Global RAM" data={globalData} accent="text-emerald-400" />
                <RAMSection title="Classification Index" data={classData} accent="text-sky-400" />
            </div>
        </div>
    );
}
