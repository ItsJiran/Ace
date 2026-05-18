function sanitizeRelativePath(targetPath: string): string {
    const normalized = targetPath.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
    if (!normalized) {
        return '';
    }

    const segments = normalized.split('/').filter(Boolean);
    if (segments.some((segment) => segment === '..')) {
        throw new Error(`FSEngine: Relative path cannot escape app config root: ${targetPath}`);
    }

    return segments.join('/');
}

export default sanitizeRelativePath;