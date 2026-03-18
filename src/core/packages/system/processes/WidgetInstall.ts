import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Process = {
    process_type: 'widget_install',
    description: 'Background process for installing widget packages.',
    observable: true,
    cancellable: true,
};

export default async function widgetInstallProcess() {
    // TODO: Implement widget install process
}
