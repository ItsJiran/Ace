/**
 * System package tools contract placeholder.
 * Installer and package management tools can be defined here.
 */
export interface InstallWidgetPackageTool {
    tool_name: 'install_widget_package';
    parameters: {
        source: string;
        note?: string;
    };
}

export interface InstallToolPackageTool {
    tool_name: 'install_tool_package';
    parameters: {
        source: string;
        note?: string;
    };
}
