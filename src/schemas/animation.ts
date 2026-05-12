export type EasingType = 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out' | 'spring_back';

export type LiteralBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type AnimationSegment = {
    phase_label: string;
    duration_ms: number;
    from: 'current' | LiteralBounds;
    to: LiteralBounds;
    easing: EasingType;
    hold_ms?: number;
};

export type AnimationSequence = {
    pattern_id: string;
    positioning_mode: 'stateful_fixed';
    interrupt_policy: 'retarget' | 'queue' | 'drop' | 'finish_current';
    loop?: boolean;
    on_complete?: 'idle';
    segments: AnimationSegment[];
};
