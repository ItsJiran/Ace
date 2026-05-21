import { createCodeInterpreterMiddleware } from '@langchain/quickjs';
import { summarizationMiddleware, llmToolSelectorMiddleware } from 'langchain';

import configurableModelMiddleware from './middlewares/configurable-model';
import contextEditingMiddleware from './middlewares/context-editing';
import syncDesktopKernelSpaceMiddleware from './middlewares/sync-frontend-kernel';
import injectApiKeyMiddleware from './middlewares/inject-api-key';
import injectDesktopContextMiddleware from './middlewares/inject-desktop-context';

export default [
    injectApiKeyMiddleware,
    injectDesktopContextMiddleware,
    configurableModelMiddleware,
    syncDesktopKernelSpaceMiddleware,

    summarizationMiddleware,
    llmToolSelectorMiddleware,
    contextEditingMiddleware,
    createCodeInterpreterMiddleware(),
];
