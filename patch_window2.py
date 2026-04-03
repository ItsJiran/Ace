import re

with open("src/hooks/useAceWindow.ts", "r") as f:
    text = f.read()

# Replace memConfig with a selector
search1 = r"    const memConfig = useAceMemory<WindowConfig>\(`system:window:\$\{windowUid\}`\);"
replace1 = """    // OPTIMIZATION: Bypass React renders for spatial updates (60fps animations/drags).
    // We only re-render if visual/behavioral non-spatial properties change.
    const memConfig = useAceMemorySelector<WindowConfig, WindowConfig | undefined>(
        `system:window:${windowUid}`,
        (c) => {
            if (!c) return undefined;
            // Omit high-frequency spatial values from React's comparison tree
            const { x, y, width, height, opacity, ...stable } = c;
            return stable as WindowConfig; // Cast so TS doesn't complain, but understand x/y are missing!
        },
        (a, b) => JSON.stringify(a) === JSON.stringify(b)
    );"""

text = text.replace("    const memConfig = useAceMemory<WindowConfig>(`system:window:${windowUid}`);", replace1)

# Now inject physical spatial synchronization outside React!
search2 = r"    const elementRef = useRef<HTMLDivElement \| null>\(null\);"
replace2 = """    const elementRef = useRef<HTMLDivElement | null>(null);

    // O(1) HARDWARE SYNC: Subscribe directly to spatial data, bypassing React entirely
    // This allows 60fps animations and dragging without re-rendering the component tree
    useEffect(() => {
        const syncSpatial = () => {
            if (!elementRef.current) return;
            const liveConfig = KernelEngine.readMemory(`system:window:${windowUid}`) as WindowConfig | undefined;
            if (!liveConfig) return;

            // Only sync spatial transform if we aren't currently manually dragging it
            if (elementRef.current.dataset.isDragging !== 'true') {
                elementRef.current.style.transform = `translate(${liveConfig.x}px, ${liveConfig.y}px)`;
                elementRef.current.style.width = `${liveConfig.width}px`;
                elementRef.current.style.height = `${liveConfig.height}px`;
            }
            // Always sync opacity if not minimized
            if (!liveConfig.is_minimized) {
                elementRef.current.style.opacity = String(liveConfig.opacity ?? 1);
            }
        };

        // Initial sync
        syncSpatial();
        
        // Listen to 60fps kernel updates
        return KernelEngine.subscribe(`system:window:${windowUid}`, syncSpatial);
    }, [windowUid]);"""

text = text.replace("    const elementRef = useRef<HTMLDivElement | null>(null);", replace2)

with open("src/hooks/useAceWindow.ts", "w") as f:
    f.write(text)
