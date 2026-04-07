const fs = require('fs');
const file = 'src/core/packages/system-dev/components/AISessionMonitor.tsx';
let txt = fs.readFileSync(file, 'utf8');
txt = txt.replace(/\\\$/g, '$');
txt = txt.replace(/\\`/g, '`');
fs.writeFileSync(file, txt);
console.log('Fixed escaping');
