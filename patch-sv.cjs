const fs = require('fs');
const path = 'src/components/layout/SpatialVirtualizer.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace target array loop to add data attribute
content = content.replace(
    /observer\.observe\(target\);/g,
    `target.setAttribute('data-spatial', 'true');\n                        observer.observe(target);`
);

fs.writeFileSync(path, content, 'utf8');
