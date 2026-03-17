#!/usr/bin/env node
/**
 * ACE Package Installer
 * ---------------------
 * Copies a local package folder into the ACE AppConfig packages directory.
 *
 * Usage:
 *   node scripts/install-package.js <path-to-package-folder>
 *
 * Example:
 *   node scripts/install-package.js example/packages/example-package
 */

import { cpSync, existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

const ACE_APP_CONFIG_ID = 'com.ace.assistant';

// On Linux: ~/.config/com.ace.assistant
// On macOS: ~/Library/Application Support/com.ace.assistant
// On Windows: %APPDATA%\com.ace.assistant
function getAppConfigDir() {
    const platform = process.platform;
    if (platform === 'darwin') {
        return join(homedir(), 'Library', 'Application Support', ACE_APP_CONFIG_ID);
    } else if (platform === 'win32') {
        return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), ACE_APP_CONFIG_ID);
    }
    // Linux / other
    const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
    return join(xdgConfig, ACE_APP_CONFIG_ID);
}

const packagePath = process.argv[2];

if (!packagePath) {
    console.error('Usage: node scripts/install-package.js <path-to-package-folder>');
    process.exit(1);
}

const sourcePath = resolve(packagePath);
const registryFile = join(sourcePath, 'registry.json');

if (!existsSync(sourcePath)) {
    console.error(`Error: Package folder not found: ${sourcePath}`);
    process.exit(1);
}

if (!existsSync(registryFile)) {
    console.error(`Error: No registry.json found in ${sourcePath}`);
    console.error('Every ACE package must have a registry.json at its root.');
    process.exit(1);
}

// Read namespace from registry.json to determine install path
let namespace;
try {
    const manifest = JSON.parse(readFileSync(registryFile, 'utf-8'));
    namespace = manifest.namespace ?? manifest.package_name;
    if (!namespace) {
        throw new Error('Missing "namespace" field in registry.json');
    }
} catch (err) {
    console.error(`Error reading registry.json: ${err.message}`);
    process.exit(1);
}

// namespace is "owner/package-name" → install to packages/owner/package-name/
const appConfigDir = getAppConfigDir();
const destPath = join(appConfigDir, 'packages', ...namespace.split('/'));

console.log(`Installing package: ${namespace}`);
console.log(`  Source : ${sourcePath}`);
console.log(`  Dest   : ${destPath}`);

try {
    cpSync(sourcePath, destPath, { recursive: true });
    console.log(`\n✅ Package "${namespace}" installed successfully.`);
    console.log(`   Restart ACE or trigger RegistryEngine.boot() to load it.`);
} catch (err) {
    console.error(`Error copying package: ${err.message}`);
    process.exit(1);
}
