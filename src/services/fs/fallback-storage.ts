export class FsFallbackStorage {
    constructor(private readonly prefix: string) {}

    private getFallbackKey(filename: string): string {
        return `${this.prefix}${filename}`;
    }

    readRaw(filename: string): string | null {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        try {
            return window.localStorage.getItem(this.getFallbackKey(filename));
        } catch {
            return null;
        }
    }

    writeRaw(filename: string, content: string): boolean {
        if (typeof window === 'undefined' || !window.localStorage) return false;
        try {
            window.localStorage.setItem(this.getFallbackKey(filename), content);
            return true;
        } catch {
            return false;
        }
    }

    hasFile(filename: string): boolean {
        return this.readRaw(filename) !== null;
    }
}