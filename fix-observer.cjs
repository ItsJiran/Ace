const fs = require('fs');
const path = 'src/components/layout/SpatialVirtualizer.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacement = `
        let scrollRoot = rootNode;
        while (scrollRoot && scrollRoot !== document.body) {
            const style = window.getComputedStyle(scrollRoot);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') {
                break;
            }
            scrollRoot = scrollRoot.parentElement;
        }
        if (scrollRoot === document.body || !scrollRoot) {
            scrollRoot = null; // Viewport
        }

        const observer = new IntersectionObserver(handleIntersection, {
            root: scrollRoot,
            rootMargin: '150px 0px 150px 0px', 
        });`;

content = content.replace(
    /        const observer = new IntersectionObserver\(handleIntersection, \{\s*root: rootNode,\s*rootMargin: '150px 0px 150px 0px',\s*\}\);/,
    replacement
);

fs.writeFileSync(path, content, 'utf8');
