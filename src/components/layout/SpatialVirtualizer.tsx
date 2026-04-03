import React, { useEffect, useRef } from 'react';

/**
 * A lightweight Spatial Auto-Virtualizer Component.
 * Automatically scans its children and recycles off-screen DOM nodes
 * to save GPU/CPU cycles using IntersectionObserver.
 */
export function SpatialVirtualizer({ as: Component = "div", 
    children, 
    className,
    targetSelector = ':scope > *' // Automatically observes direct children by default
}: { 
    children: React.ReactNode;
    className?: string;
    as?: any;
    targetSelector?: string;
}) {
    const rootRef = useRef<any>(null);

    useEffect(() => {
        const rootNode = rootRef.current;
        if (!rootNode) return;

        const observedChildren = new WeakSet<Element>();
        let scanTimeout: any;

        const handleIntersection = (entries: IntersectionObserverEntry[]) => {
            for (const entry of entries) {
                const el = entry.target as HTMLElement;
                if (!el.style) continue;

                if (entry.isIntersecting) {
                    el.style.removeProperty('content-visibility');
                    el.style.removeProperty('pointer-events');
                    el.style.removeProperty('opacity');
                    el.style.removeProperty('visibility');
                    el.style.removeProperty('contain');
                    
                    el.dispatchEvent(new CustomEvent('ace:visibility', { detail: true }));
                } else {
                    const rect = el.getBoundingClientRect();
                    if (rect.height > 0) {
                        el.style.setProperty('contain-intrinsic-size', `auto ${Math.max(rect.height, 10)}px`, 'important');
                    }
                    
                    // Aggressive GPU hiding:
                    // Aggressive GPU hiding:
                    el.style.setProperty('content-visibility', 'hidden', 'important');
                    el.style.setProperty('visibility', 'hidden', 'important'); // Very aggressive, skips painting completely
                    el.style.setProperty('pointer-events', 'none', 'important');
                    el.style.setProperty('opacity', '0', 'important');
                    el.style.setProperty('contain', 'strict', 'important'); // Strict containment limits layout scopes

                    el.dispatchEvent(new CustomEvent('ace:visibility', { detail: false }));
                }
            }
        };


        let scrollRoot = rootNode;
        while (scrollRoot && scrollRoot !== document.body) {
            const style = window.getComputedStyle(scrollRoot);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') {
                break;
            }
            scrollRoot = scrollRoot.parentElement;
        }
        if (scrollRoot === document.body || !scrollRoot) {
            scrollRoot = null; // Viewport
        }

        const observer = new IntersectionObserver(handleIntersection, {
            root: scrollRoot,
            rootMargin: '150px 0px 150px 0px', 
        });

        const performScan = () => {
            if (!rootRef.current) return;
            
            try {
                // Find all target elements that match the selector within the rootNode
                const targets = Array.from(rootRef.current.querySelectorAll(targetSelector));
                
                targets.forEach(target => {
                    if (!observedChildren.has(target)) {
                        observedChildren.add(target);
                        
                        // Fix for inline elements not taking dimensions well
                        const style = window.getComputedStyle(target);
                        if (style.display === 'inline') {
                            (target as HTMLElement).style.display = 'inline-block';
                        }
                        
                        target.setAttribute('data-spatial', 'true');
                        observer.observe(target);
                    }
                });
            } catch (error) {
                console.error('[SpatialVirtualizer] Invalid targetSelector:', error);
            }
        };

        // Initial scan
        scanTimeout = setTimeout(performScan, 50);

        // Re-scan when children change structure
        const mutationObserver = new MutationObserver(() => {
            clearTimeout(scanTimeout);
            scanTimeout = setTimeout(performScan, 150); 
        });

        mutationObserver.observe(rootNode, {
            childList: true,
            subtree: true, // We watch subtree in case the target isn't a direct child
        });

        return () => {
            clearTimeout(scanTimeout);
            mutationObserver.disconnect();
            observer.disconnect();
        };
    }, [targetSelector]);

    return (
        <Component ref={rootRef} className={className || "w-full h-full overflow-y-auto"}>
            {children}
        </Component>
    );
}
