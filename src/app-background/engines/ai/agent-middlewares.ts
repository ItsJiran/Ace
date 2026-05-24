import { createCodeInterpreterMiddleware } from '@langchain/quickjs';
import { summarizationMiddleware, llmToolSelectorMiddleware, todoListMiddleware } from 'langchain';

import configurableModelMiddleware from './middlewares/configurable-model';
import contextEditingMiddleware from './middlewares/context-editing';
import syncDesktopKernelSpaceMiddleware from './middlewares/sync-frontend-kernel';
import injectApiKeyMiddleware from './middlewares/inject-api-key';
import injectDesktopContextMiddleware from './middlewares/inject-desktop-context';
import threadLivenessGuardMiddleware from './middlewares/thread-liveness-guard';
import { AgentModelModes, type AgentModelModeType } from '#/shared/schemas/ai';

export function createBaseAgentMiddlewares(mode: AgentModelModeType = AgentModelModes.SELECTED) {
    return [
        injectApiKeyMiddleware,
        injectDesktopContextMiddleware,
        configurableModelMiddleware(mode),
        threadLivenessGuardMiddleware,
        syncDesktopKernelSpaceMiddleware,
        todoListMiddleware(),

        summarizationMiddleware,
        llmToolSelectorMiddleware,
        contextEditingMiddleware,
    ];
}

export function createExecutionerMiddlewares(mode: AgentModelModeType = AgentModelModes.SELECTED) {
    return [...createBaseAgentMiddlewares(mode), createCodeInterpreterMiddleware()];
}

export default createExecutionerMiddlewares;
