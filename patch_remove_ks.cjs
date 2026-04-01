const fs = require('fs');
const files = [
  '__tests__/unit/storageEngine.test.ts',
  '__tests__/unit/processEngine.test.ts',
  '__tests__/unit/aiContextMemoryEngine.test.ts',
  '__tests__/unit/kernelEngine.test.ts',
  '__tests__/feature/processSpawnPerEngine.test.ts',
  '__tests__/feature/engineIntegration.test.ts',
  '__tests__/feature/aiGateway.test.ts',
  '__tests__/feature/processParentPropagation.test.ts',
];
files.forEach(f => {
  if (!fs.existsSync(f)) return;
  let code = fs.readFileSync(f, 'utf8');
  const before = code;
  code = code.replace(/^[^\S\r\n]*KernelEngine\.setupKernelSpace\(\);\n?/gm, '');
  if (code !== before) { fs.writeFileSync(f, code); console.log('patched', f); }
});
