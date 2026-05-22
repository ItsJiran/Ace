import { execFile } from 'node:child_process';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const srcWebDir = path.join(projectRoot, 'src-web');
const distWebDir = path.join(projectRoot, 'docs');
const distAssetsDir = path.join(distWebDir, 'assets');
const publicDir = path.join(projectRoot, 'public');
const projectAssetsDir = path.join(projectRoot, 'assets');
const tailwindBinary = path.join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tailwindcss.cmd' : 'tailwindcss',
);

const filesToCopyFromPublic = [
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
  'apple-touch-icon.png',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'favicon.ico',
  'site.webmanifest',
];

const filesToCopyFromAssets = [
  '1.gif',
  '2.gif',
];

async function buildStyles() {
  await execFileAsync(tailwindBinary, [
    '-c',
    path.join(projectRoot, 'tailwind.config.js'),
    '-i',
    path.join(srcWebDir, 'styles.css'),
    '-o',
    path.join(distAssetsDir, 'web.css'),
    '--minify',
  ]);
}

async function copyStaticFiles() {
  await copyFile(path.join(srcWebDir, 'index.html'), path.join(distWebDir, 'index.html'));

  for (const fileName of filesToCopyFromPublic) {
    await copyFile(path.join(publicDir, fileName), path.join(distWebDir, fileName));
  }

  for (const fileName of filesToCopyFromAssets) {
    await copyFile(path.join(projectAssetsDir, fileName), path.join(distAssetsDir, fileName));
  }
}

async function main() {
  await rm(distWebDir, { recursive: true, force: true });
  await mkdir(distAssetsDir, { recursive: true });
  await buildStyles();
  await copyStaticFiles();

  const builtFiles = await readdir(distWebDir);
  console.log('[build-web] Built /docs with files:', builtFiles.join(', '));
}

main().catch((error) => {
  console.error('[build-web] Failed:', error);
  process.exitCode = 1;
});
