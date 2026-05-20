// src/hooks/use-render-count.ts
import { useRef } from 'react';

export function useRenderCount(_componentName: string) {
    const renders = useRef(0);
    renders.current += 1;
    return renders.current;
}