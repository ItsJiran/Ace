export const manifest = {
    namespace: 'itsjiran/ace-system-dev',
    package_name: 'itsjiran/ace-system-dev',
    owner_scope: 'core',
    source_scope: 'core',
    display_name: 'ACE System Dev Package',
    file_location: 'src/core/packages/system-dev',
};

const modules = import.meta.glob('./{widgets,components,windows,tools,features,processes,pipelines}/*.{ts,tsx}', {
    eager: true,
});

export default function registerSystemDevPackage({ packageName }: { packageName: string }) {
    window.ACE.registry.registerPackageModules(packageName, modules);
}
