import React, { useState, useEffect, useTransition, useRef } from 'react';

interface DeferredWindowContentProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const DeferredWindowContent: React.FC<DeferredWindowContentProps> = ({ children, fallback }) => {
  const [isReady, setIsReady] = useState(false);
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            observer.disconnect();
            
            // Phase 1: Wait for the Window Shell to paint
            requestAnimationFrame(() => {
              // Phase 2: Wait for the browser to settle layout
              requestAnimationFrame(() => {
                // Phase 3: Transition the heavy content in at lower priority
                startTransition(() => {
                  setIsReady(true);
                });
              });
            });
          }
        });
      },
      {
        rootMargin: '100px', // Pre-load slightly before it comes into view
        threshold: 0,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  if (!isReady) {
    return (
      <div 
        ref={containerRef} 
        className="w-full h-full min-h-[50px] flex items-center justify-center animate-pulse" 
        style={{ contain: 'strict' }}
      >
        {fallback || (
          <div className="w-6 h-6 border-2 border-slate-500/30 border-t-slate-500 rounded-full animate-spin" />
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full" style={{ contain: 'content' }}>
      {children}
    </div>
  );
};
