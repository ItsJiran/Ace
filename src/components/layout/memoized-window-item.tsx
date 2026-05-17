import React, { memo } from 'react';
import { RegistryEngine } from '#/services/registry-engine';

type WindowItemProps = {
    uid: string;
    component: string;
};

function WindowItem({ uid, component: componentName }: WindowItemProps) {
    // Resolve purely from windows domain, assuming window components handle their own shell
    console.log(`Resolving window component for: ${componentName}`);
    const Component = RegistryEngine.resolveWindowComponent(componentName) as React.ComponentType<{ windowUid: string }> | undefined;
    if (!Component) return null;
    console.log('Esa 4', Component);

    return (
        <Component 
            windowUid={uid}
        />
    );
}

// Memoize the wrapper so it only re-renders if uid/component string changes
// This effectively stops parent (App) re-renders from trickling down if props are same
export const MemoizedWindowItem = memo(WindowItem, (prev, next) => {
    return prev.uid === next.uid && prev.component === next.component;
});
