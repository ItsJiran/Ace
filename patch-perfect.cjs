const fs = require('fs');
const path = 'src/core/packages/system/components/SystemSettings.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Keybinds tab
content = content.replace(
    /<div className="overflow-y-auto max-h-\[80vh\]">([\s\S]*?)<\/table>\s*<\/div>/,
    `<SpatialVirtualizer className="overflow-y-auto max-h-[80vh]" targetSelector="tbody > tr">$1</table>\n            </SpatialVirtualizer>`
);

// 2. Performance tab
content = content.replace(
    /<div className="overflow-y-auto max-h-\[60vh\] bg-white dark:bg-zinc-900">([\s\S]*?)<\/table>\s*<\/div>/,
    `<SpatialVirtualizer className="overflow-y-auto max-h-[60vh] bg-white dark:bg-zinc-900" targetSelector="tbody > tr">$1</table>\n                </SpatialVirtualizer>`
);

fs.writeFileSync(path, content, 'utf8');
