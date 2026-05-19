import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronPath = path.resolve('./node_modules/.bin/electron');
const loaderPath = path.resolve('./scripts/background-alias-loader.mjs');
const mainPath = path.resolve('src/app-background/main.ts');

console.log('Starting child process...');

const child = fork(mainPath, [], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  execPath: electronPath,
  execArgv: [
    '--import', 'tsx',
    '--loader', loaderPath
  ],
  stdio: ['inherit', 'inherit', 'inherit', 'ipc']
});

child.on('message', (msg) => {
  console.log('Received from child:', JSON.stringify(msg, null, 2));
  if (msg.type === 'ace:background:ready') {
    console.log('Sending ai.listThreads request...');
    child.send({
      type: 'ace:background:rpc:request',
      id: 'repro-1',
      method: 'ai.listThreads'
    });
  } else if (msg.type === 'ace:background:rpc:result' && msg.id === 'repro-1') {
    console.log('Received RPC result.');
    child.kill();
    process.exit(msg.success ? 0 : 1);
  }
});

child.on('error', (err) => {
  console.error('Child process error:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log('Child process exited with code:', code);
  if (code !== 0 && code !== null) {
      process.exit(code);
  }
});

setTimeout(() => {
  console.error('Timeout waiting for response');
  child.kill();
  process.exit(1);
}, 30000);
