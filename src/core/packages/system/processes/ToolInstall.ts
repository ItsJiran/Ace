import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Process = {
    process_type: 'tool_install',
    description: 'Background process for installing tool packages.',
    observable: true,
    cancellable: true,
};

export default async function toolInstallProcess() {
    // TODO: Implement tool install process
}
