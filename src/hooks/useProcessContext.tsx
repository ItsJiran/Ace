import React, { createContext, useContext, type ReactNode } from 'react';

/**
 * ProcessContext: Provides process_uid to component tree without prop-drilling.
 *
 * Purpose:
 * 1. Avoid passing process_uid through every component layer
 * 2. Allow deep components to access current process context
 * 3. Enable external packages to retrieve process context via hook
 * 4. Support nested contexts (subprocess spawned in child context)
 *
 * Usage in host application:
 * ```tsx
 * <ProcessContextProvider process_uid={parent_process_uid}>
 *   <MyComponentTree />
 * </ProcessContextProvider>
 * ```
 *
 * Usage in component:
 * ```tsx
 * const { process_uid } = useProcessContext();
 * ```
 *
 * External package usage (via window.ACE bridge):
 * ```tsx
 * const { process_uid } = window.ACE.hooks.useProcessContext();
 * ```
 */

interface ProcessContextValue {
    /** Current process UID in component tree */
    process_uid: string | undefined;

    /** Optional parent process UID (for context chains) */
    parent_process_uid?: string | undefined;

    /** Depth in process tree (0 = root context spawned process) */
    depth?: number;
}

const ProcessContext = createContext<ProcessContextValue | undefined>(undefined);

interface ProcessContextProviderProps {
    children: ReactNode;
    process_uid?: string | undefined;
    parent_process_uid?: string | undefined;
}

/**
 * ProcessContextProvider: Wrap component tree to provide process_uid context.
 *
 * @param process_uid Current process UID (required for context activation)
 * @param parent_process_uid Optional parent UID (for lineage tracking)
 * @param children Component tree
 */
export function ProcessContextProvider({
    children,
    process_uid,
    parent_process_uid,
}: ProcessContextProviderProps) {
    const parent = useProcessContext();

    const value: ProcessContextValue = {
        process_uid,
        parent_process_uid: parent_process_uid ?? parent?.process_uid,
        depth: (parent?.depth ?? -1) + 1,
    };

    return <ProcessContext.Provider value={value}>{children}</ProcessContext.Provider>;
}

/**
 * useProcessContext: Retrieve process context from component tree.
 *
 * Returns undefined context values if hook used outside ProcessContextProvider.
 * Allows graceful degradation for components that work with or without context.
 *
 * @throws TypeError if strict mode (future: require context provider)
 * @returns ProcessContextValue with process_uid and metadata
 */
export function useProcessContext(): ProcessContextValue {
    const context = useContext(ProcessContext);

    if (!context) {
        // Phase B: Warn when context not available
        // Phase D: Throw error to enforce provider requirement
        if (import.meta.env.DEV) {
            console.warn(
                '[ProcessContext] Hook used outside ProcessContextProvider; process_uid will be undefined. ' +
                'Ensure component tree is wrapped with <ProcessContextProvider>.',
            );
        }
        return {
            process_uid: undefined,
            parent_process_uid: undefined,
            depth: -1,
        };
    }

    return context;
}

/**
 * withProcessContext: HOC to inject process context into component props.
 *
 * Useful for class components or special rendering patterns.
 *
 * @param Component Component to wrap
 * @returns Wrapped component with injected processContext prop
 */
export function withProcessContext<P extends { processContext?: ProcessContextValue }>(
    Component: React.ComponentType<P>,
): React.FC<Omit<P, 'processContext'>> {
    const Wrapped = (props: Omit<P, 'processContext'>) => {
        const processContext = useProcessContext();
        return <Component {...(props as P)} processContext={processContext} />;
    };

    Wrapped.displayName = `withProcessContext(${Component.displayName ?? Component.name ?? 'Component'})`;

    return Wrapped;
}
