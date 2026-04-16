import type { AISession } from '#/schemas/ai';
import type { AIGatewaySDKTarget } from '#/schemas/ai_gateway';

export const AISessionBlockBus = new EventTarget();

export interface SessionInteractionLoopInput {
    session: AISession;
    prompt: string;
}

export interface GatewayTargetConfig {
    activeGatewayUrl: string;
    sdkConfig: AIGatewaySDKTarget;
}

export interface ActiveStreamBlock {
    block_slug: string;
    block_index: number;
    inside_fenced_literal: boolean;
}

export interface StreamRuntimeState {
    pending_buffer: string;
    tmp_paragraph_renderer_index: number;
    tmp_paragraph_memory_uid?: string;
    active_block?: ActiveStreamBlock;
}

export const ACE_BLOCK_START_PREFIX = '@@ace:start';
export const ACE_BLOCK_END_LINE = '@@ace:end';