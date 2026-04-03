const fs = require('fs');
const file = 'src/core/packages/system/components/SystemSettings.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('useRenderCount')) {
    content = content.replace(
        "import { KernelEngine } from '#/services/kernelEngine';",
        "import { KernelEngine } from '#/services/kernelEngine';\nimport { useRenderCount } from '#/hooks/useRenderCount';"
    );
    
    // RenderBadge
    const badgeComponent = `
function RenderBadge({ count, name }: { count: number, name: string }) {
    return (
        <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-mono text-red-500 shadow-sm z-50 pointer-events-none backdrop-blur-sm">
            <span>{name}</span>
            <span className="font-bold">{count}</span>
        </div>
    );
}

// ─── Tab Definitions ─────────────────────────────────────────────────────────`;

    content = content.replace("// ─── Tab Definitions ─────────────────────────────────────────────────────────", badgeComponent);

    // Patch components
    const components = [
        'PackagesTab',
        'KeybindsTab',
        'ToolsTab',
        'GeneralTab',
        'AIGatewayTab',
        'PerformanceTab',
        'SystemSettingsComponent'
    ];

    for (let comp of components) {
        // Regex to find function definition and opening brace.
        // It looks for `function CompName(...args) {`
        const regex = new RegExp(`(function ${comp}\\b[^{]*\\{)`);
        content = content.replace(regex, `$1\n    const renderCount = useRenderCount('${comp}');`);
        
        // Add badge rendering inside the outermost div (usually the first returned JSX tag)
        // This is a bit tricky, but mostly the first `return (` is followed by a `<div`
        const returnRegex = new RegExp(`(function ${comp}\\b.+?return\\s*\\([\\s\\S]*?(?:<div|<form)([^>]*>))`);
        content = content.replace(returnRegex, `$1\n            <RenderBadge name="${comp}" count={renderCount} />`);
    }

    fs.writeFileSync(file, content);
    console.log("Patched successfully.");
} else {
    console.log("Already patched.");
}
