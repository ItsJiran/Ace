function createFSBridge({ ipcRenderer, fs, path }) {
    async function resolveFsPath(targetPath, baseDir) {
        if (baseDir === 'appConfig') {
            const appConfigDir = await ipcRenderer.invoke('ace:path:app-config-dir');
            return path.join(appConfigDir, String(targetPath || ''));
        }

        if (baseDir === 'appCache') {
            const appCacheDir = await ipcRenderer.invoke('ace:path:app-cache-dir');
            return path.join(appCacheDir, String(targetPath || ''));
        }

        if (baseDir === 'appLocal') {
            const appLocalDir = await ipcRenderer.invoke('ace:path:app-local-dir');
            return path.join(appLocalDir, String(targetPath || ''));
        }

        return path.normalize(String(targetPath || ''));
    }

    return {
        fsExists: async (targetPath, baseDir) => {
            const resolvedPath = await resolveFsPath(targetPath, baseDir);
            try {
                await fs.access(resolvedPath);
                return true;
            } catch {
                return false;
            }
        },
        fsWriteTextFile: async (targetPath, content, baseDir) => {
            const resolvedPath = await resolveFsPath(targetPath, baseDir);
            await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
            await fs.writeFile(resolvedPath, String(content), 'utf8');
            return true;
        },
        fsReadTextFile: async (targetPath, baseDir) => {
            const resolvedPath = await resolveFsPath(targetPath, baseDir);
            return fs.readFile(resolvedPath, 'utf8');
        },
        fsMkdir: async (targetPath, baseDir) => {
            const resolvedPath = await resolveFsPath(targetPath, baseDir);
            await fs.mkdir(resolvedPath, { recursive: true });
            return true;
        },
        fsReadDir: async (targetPath, baseDir) => {
            const resolvedPath = await resolveFsPath(targetPath, baseDir);
            const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
            return entries.map((entry) => ({
                name: entry.name,
                path: path.join(resolvedPath, entry.name),
                isDirectory: entry.isDirectory(),
            }));
        },
        fsRemove: async (targetPath, baseDir) => {
            const resolvedPath = await resolveFsPath(targetPath, baseDir);
            await fs.rm(resolvedPath, { force: true, recursive: true });
            return true;
        },
    };
}

module.exports = {
    createFSBridge,
};