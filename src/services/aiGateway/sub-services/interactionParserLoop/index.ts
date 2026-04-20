/**
 * Interaction Parser Loop Module Index
 *
 * Summary:
 * - exposes the public surface for the parser-loop sub-service package
 * - keeps the top-level compatibility facade stable while internals stay split by responsibility
 *
 * ASCII Diagram:
 *
 *   interactionLoop.ts
 *          |
 *          v
 *        index.ts
 *      /         \
 *     v           v
 *  shared.ts   requestOrchestration.ts
 *                   |
 *                   v
 *            streamProcessor.ts
 *             /      |       \
 *            v       v        v
 *   bufferParsing.ts persistence.ts blockLifecycle.ts
 *            |
 *            v
 *    paragraphStream.ts
 *
 * Notes:
 * - `shared.ts` carries contracts and the event bus
 * - `requestOrchestration.ts` is the runtime entry point used by the outer interaction loop
 */

export { AISessionBlockBus, type SessionInteractionLoopInput } from './shared';
export { sendPromptToGateway } from './requestOrchestration';