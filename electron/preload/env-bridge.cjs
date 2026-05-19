const EXPOSED_ENV_KEYS = new Set([
    'OPENAI_API_KEY',
    'OPENAI_KEY',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_KEY',
]);

function createEnvBridge() {
    return {
        get: (key) => {
            const envKey = String(key || '').trim();
            if (!EXPOSED_ENV_KEYS.has(envKey)) {
                return null;
            }

            return process.env[envKey] ?? null;
        },
        keys: () => Array.from(EXPOSED_ENV_KEYS),
    };
}

module.exports = {
    createEnvBridge,
};