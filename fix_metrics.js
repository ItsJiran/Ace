const fs = require('fs');

const km = 'src/services/kernelEngine/kernelMemoryManager.ts';
let kContent = fs.readFileSync(km, 'utf8');
kContent = kContent.split('PerformanceObserver.trackRamOp();').join('if (import.meta.env.DEV) { PerformanceObserver.trackRamOp(); }');
fs.writeFileSync(km, kContent);

const kw = 'src/services/kernelEngine/kernelWindowManager.ts';
let wContent = fs.readFileSync(kw, 'utf8');
wContent = wContent.split('PerformanceObserver.trackWindowSpawn();').join('if (import.meta.env.DEV) { PerformanceObserver.trackWindowSpawn(); }');
fs.writeFileSync(kw, wContent);

// also remove the file after running
fs.unlinkSync('fix_metrics.js');
