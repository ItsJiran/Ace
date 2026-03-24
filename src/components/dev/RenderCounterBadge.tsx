import { useRenderCount } from '#/hooks/useRenderCount';

interface RenderCounterBadgeProps {
    componentName: string;
    className?: string;
    style?: React.CSSProperties;
    show?: boolean; // Optional override to hide/show
}

export function RenderCounterBadge({ componentName, className, style, show = true }: RenderCounterBadgeProps) {
    const renderCount = useRenderCount(componentName);

    if (!import.meta.env.DEV || !show) return null;

    return (
        <div 
            className={`pointer-events-none select-none z-[99999] absolute top-1 right-1 bg-red-500/80 text-white text-[9px] font-bold px-1 rounded opacity-70 shadow-sm border border-white/20 ${className || ''}`}
            style={style}
            title={`${componentName} Render Count: ${renderCount}`}
        >
            {componentName.substring(0, 12)} R:{renderCount}
        </div>
    );
}