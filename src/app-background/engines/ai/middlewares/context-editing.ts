import { ClearToolUsesEdit, contextEditingMiddleware } from 'langchain';

/**
 * contextEditingMiddleware. This middleware allows the agent to
 * store and retrieve intermediate tool results
 */
export default contextEditingMiddleware({
    edits: [new ClearToolUsesEdit()],
});
