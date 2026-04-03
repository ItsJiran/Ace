const fs = require('fs');
const path = 'src/components/layout/SpatialVirtualizer.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace TR branch with pure aggressive hiding
content = content.replace(
    /\/\/ Safe hiding for table rows[\s\S]*?el\.dispatchEvent\(new CustomEvent\('ace:visibility', \{ detail: false \}\)\);/,
    `// Aggressive GPU hiding:
                    el.style.setProperty('content-visibility', 'hidden', 'important');
                    el.style.setProperty('visibility', 'hidden', 'important'); // Very aggressive, skips painting completely
                    el.style.setProperty('pointer-events', 'none', 'important');
                    el.style.setProperty('opacity', '0', 'important');
                    el.style.setProperty('contain', 'strict', 'important'); // Strict containment limits layout scopes

                    el.dispatchEvent(new CustomEvent('ace:visibility', { detail: false }));`
);

fs.writeFileSync(path, content, 'utf8');
