const fs = require('fs');
const path = 'src/components/layout/SpatialVirtualizer.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /el\.style\.setProperty\('content-visibility',\s*'hidden',\s*'important'\);\s*el\.style\.setProperty\('visibility',\s*'hidden',\s*'important'\);\s*\/\/ Very aggressive, skips painting completely\s*el\.style\.setProperty\('pointer-events',\s*'none',\s*'important'\);\s*el\.style\.setProperty\('opacity',\s*'0',\s*'important'\);\s*el\.style\.setProperty\('contain',\s*'strict',\s*'important'\); \/\/ Strict containment limits layout scopes/g,
    `// Safe hiding for table rows
                    if (el.tagName === 'TR') {
                        el.style.setProperty('visibility', 'hidden', 'important');
                        el.style.setProperty('opacity', '0', 'important');
                        el.style.setProperty('pointer-events', 'none', 'important');
                    } else {
                        el.style.setProperty('content-visibility', 'hidden', 'important');
                        el.style.setProperty('visibility', 'hidden', 'important'); 
                        el.style.setProperty('pointer-events', 'none', 'important');
                        el.style.setProperty('opacity', '0', 'important');
                        el.style.setProperty('contain', 'strict', 'important');
                    }`
);

fs.writeFileSync(path, content, 'utf8');
