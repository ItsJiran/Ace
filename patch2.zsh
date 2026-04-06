sed -i '/export default function DevMenu() {/a \
    const windowCtx = useWindowContext(); \
    const { markDirty } = useWindowSnapshot(windowCtx?.window_uid || ""); \
    const handleScroll = () => { \
        if (window.debounceScrollTimeout) clearTimeout(window.debounceScrollTimeout); \
        window.debounceScrollTimeout = window.setTimeout(() => { markDirty(); }, 150); \
    };\
' src/core/packages/system-dev/components/DevMenu.tsx
