/**
 * ThoughtBlock — renders <thought> as a chain panel.
 */
import React from 'react';
import { Brain } from 'lucide-react';
import { ChainBlock, type ChainBlockProps } from './chain-block';

export type ThoughtBlockProps = Omit<ChainBlockProps, 'icon' | 'label' | 'accentClass'>;

const ACCENT = 'text-purple-400 border-purple-500/40';

export function ThoughtBlock({ text, done, isLast }: ThoughtBlockProps) {
    return (
        <ChainBlock
            icon={<Brain className="w-3 h-3" />}
            label="Thought"
            accentClass={ACCENT}
            text={text}
            done={done}
            isLast={isLast}
        />
    );
}

