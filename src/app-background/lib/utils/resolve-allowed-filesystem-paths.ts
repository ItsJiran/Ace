export default (prefix: string | null) => {
    if (!prefix) {
        return [] as string[];
    }

    const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    return [normalizedPrefix, `${prefix}**`];
}