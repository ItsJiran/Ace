export const registry = {
    features: [
        {
            registry_type: 'feature',
            feature_name: 'system_center_dashboard',
        },
        {
            registry_type: 'feature',
            feature_name: 'package_install_queue',
        },
    ]
};

/**
 * System package feature IDs placeholder.
 */
export const SystemFeatures = {
    system_center_dashboard: 'feature:itsjiran/ace-system:center_dashboard:v1',
    package_install_queue: 'feature:itsjiran/ace-system:package_install_queue:v1',
} as const;
