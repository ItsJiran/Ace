const { execFileSync, execSync } = require('child_process');

const SHELL_ENV_ALLOWLIST = [
    'OPENAI_API_KEY',
    'OPENAI_KEY',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_KEY',
];

function applyShellEnv(rawEnv) {
    for (const line of String(rawEnv || '').split('\n')) {
        const separatorIndex = line.indexOf('=');
        if (separatorIndex <= 0) {
            continue;
        }

        const key = line.slice(0, separatorIndex);
        const value = line.slice(separatorIndex + 1);

        if (key) {
            process.env[key] = value;
        }
    }
}

function applyAllowlistedShellVariables(rawEnv) {
    for (const entry of String(rawEnv || '').split('\0')) {
        const separatorIndex = entry.indexOf('=');
        if (separatorIndex <= 0) {
            continue;
        }

        const key = entry.slice(0, separatorIndex);
        const value = entry.slice(separatorIndex + 1);

        if (key && value) {
            process.env[key] = value;
        }
    }
}

function loadShellEnvFallback() {
    if (process.platform === 'win32') {
        return;
    }

    const shell = process.env.SHELL || '/bin/zsh';
    const rawEnv = execSync(`${shell} -i -c 'env'`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });

    applyShellEnv(rawEnv);
}

function loadAllowlistedShellVariables() {
    if (process.platform === 'win32') {
        return;
    }

    const shell = process.env.SHELL || '/bin/zsh';
    const probeScript = SHELL_ENV_ALLOWLIST
        .map((key) => `printf '%s=%s\\0' '${key}' "\${${key}:-}"`)
        .join('; ');

    const rawEnv = execFileSync(shell, ['-ilc', probeScript], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });

    applyAllowlistedShellVariables(rawEnv);
}

async function syncShellEnvironment() {
    if (process.platform === 'win32') {
        return;
    }

    try {
        const { default: fixPath } = await import('fix-path');
        fixPath();
    } catch (error) {
        console.warn('[electron] Failed to sync PATH with fix-path:', error);
    }

    try {
        loadShellEnvFallback();
    } catch (error) {
        console.warn('[electron] Failed to load shell env variables:', error);
    }

    try {
        loadAllowlistedShellVariables();
    } catch (error) {
        console.warn('[electron] Failed to load allowlisted shell variables:', error);
    }
}

module.exports = {
    syncShellEnvironment,
};