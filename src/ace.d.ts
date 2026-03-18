// src/ace.d.ts
declare global {
  interface Window {
    ACE: {
      registry: {
        registerPackage: (manifest: unknown) => unknown;
        registerPackageModules: (packageName: string, modules: Record<string, unknown>) => void;
      };
    };
  }
}
