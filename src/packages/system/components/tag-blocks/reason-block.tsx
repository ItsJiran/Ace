/**
 * ReasonBlock — renders <action_reason> as a chain panel.
 */
import React from 'react';
import { Lightbulb } from 'lucide-react';
import { ChainBlock, type ChainBlockProps } from './chain-block';

export type ReasonBlockProps = Omit<ChainBlockProps, 'icon' | 'label' | 'accentClass'>;

const ACCENT = 'text-amber-400 border-amber-500/40';

export function ReasonBlock({ text, done, isLast }: ReasonBlockProps) {
    return (
        <>
        <ChainBlock
            icon={<Lightbulb className="w-3 h-3" />}
            label="Why"
            accentClass={ACCENT}
            text={text}
            done={done}
            isLast={isLast}
        />
        </>
    );
}

