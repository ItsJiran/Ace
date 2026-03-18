// src/hooks/useAceWidget.ts
import { useMemo, useEffect } from 'react';

export interface UseAceWidgetConfig {
    package?: string; // Optional if context provided
    name: string;
    default_visibility?: 'visible' | 'hidden';
}

export interface UseAceWidgetResult {
    widgetUid: string;
}

/**
 * Hook to identify and register a widget within a package.
 * Generates a consistent UID based on package and widget name.
 */
export const useAceWidget = (config: UseAceWidgetConfig): UseAceWidgetResult => {
    // TODO: In the future, this might read from a Context to get the 'current package'
    // For now, we require 'package' in the config or assume a default scope.
    const packageNamespace = config.package || 'unknown';
    
    const widgetUid = useMemo(() => {
        return `${packageNamespace}:${config.name}`;
    }, [packageNamespace, config.name]);

    // Side-effect: Register generic widget existence?
    // In "Registry-Less" mode with Bundler, this hook is statically analyzed.
    // In Runtime Dogfooding, we might want to emit an event or log.
    useEffect(() => {
        // console.log(`[useAceWidget] Widget Mounted: ${widgetUid}`);
    }, [widgetUid]);

    return { widgetUid };
};
