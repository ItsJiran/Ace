export default async function (key: string): Promise<string | null> {
    if (!key) {
        return null;
    }

    if (window.envVariables?.get) {
        return await window.envVariables.get(key);
    }

    if (typeof process !== 'undefined' && process.env) {
        return process.env[key] ?? null;
    }

    return null;
}