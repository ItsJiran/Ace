const fs = require('fs');
const path = 'src/core/packages/system/components/SystemSettings.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /<tbody className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">\s*\{keybinds\.map\(\s*\(bind\) => \(/g,
    `<SpatialVirtualizer as="tbody" targetSelector="tr" className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">\n                    {keybinds.map((bind) => (`
);

content = content.replace(
    /<\/tr>\s*\)\)\}\s*<\/tbody>/g,
    `</tr>\n                    ))}\n                </SpatialVirtualizer>`
);

// Do the same for the top memory entries loop
content = content.replace(
    /<tbody className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">\s*\{topEntries\.map\(\s*\(entry,\s*i\) => \(/g,
    `<SpatialVirtualizer as="tbody" targetSelector="tr" className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">\n                            {topEntries.map((entry, i) => (`
);

fs.writeFileSync(path, content, 'utf8');
