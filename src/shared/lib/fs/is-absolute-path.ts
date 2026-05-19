function isAbsolutePath(targetPath: string): boolean {
    return /^(?:\/|\\\\|[a-zA-Z]:[\\/])/.test(targetPath);
}

export default isAbsolutePath;