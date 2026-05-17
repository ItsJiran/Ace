// src/hooks/use-render-count.ts
import { useRef, useEffect } from 'react';

export function useRenderCount(componentName: string) {
    const renders = useRef(0);
    renders.current += 1;
    return renders.current;
}