import type React from 'react';

import type { AISession } from '#/schemas/ai';

export interface SystemAIChatMessagesProps {
    session?: AISession | undefined;
    sessionUid?: string | undefined;
    className?: string;
    bottomRef?: React.RefObject<HTMLDivElement | null> | undefined;
}