export default async function (key: string): Promise<string | null> {
    if (!key) {
        return null;
    }

    if (window.electronAPI?.getEnv) {
        return await window.electronAPI.getEnv(key);
    }

    if (typeof process !== 'undefined' && process.env) {
        return process.env[key] ?? null;
    }

    return null;
}