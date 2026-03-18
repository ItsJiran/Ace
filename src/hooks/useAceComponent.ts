// src/hooks/useAceComponent.ts
import { useMemo, useEffect } from 'react';

export interface UseAceComponentConfig {
    name: string;
    parent_widget: string; // The UID of the parent widget
}

export interface UseAceComponentResult {
    componentUid: string;
}

/**
 * Hook to identify a specific Component within a Widget slot.
 * Generates a consistent UID for stateful components.
 */
export const useAceComponent = (config: UseAceComponentConfig): UseAceComponentResult => {
    
    const componentUid = useMemo(() => {
        return `${config.parent_widget}:${config.name}`;
    }, [config.parent_widget, config.name]);

    useEffect(() => {
        // Log mounting or potentially register capabilities
        // console.log(`[useAceComponent] Component Mounted: ${componentUid}`);
    }, [componentUid]);

    return { componentUid };
};
