export const manifest = {
    namespace: 'itsjiran/ace-system',
    package_name: 'itsjiran/ace-system',
    owner_scope: 'core',
    source_scope: 'core',
    display_name: 'ACE System Package',
    file_location: 'src/core/packages/system',
};

const modules = import.meta.glob('./{widgets,components,windows,tools,features,processes,pipelines}/*.{ts,tsx}', {
    eager: true,
});

export default function registerSystemPackage({ packageName }: { packageName: string }) {
    window.ACE.registry.registerPackageModules(packageName, modules);
}
