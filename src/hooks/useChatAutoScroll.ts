import { useEffect, useRef } from 'react';

export function useChatAutoScroll<T extends HTMLElement>(dependencies: unknown[]) {
    const bottomRef = useRef<T | null>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, dependencies);

    return bottomRef;
}
