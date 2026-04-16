/**
 * Prompt Builder Storage Section
 *
 * Summary:
 * - reserved extension point for storage-aware prompt context
 * - currently returns an empty section until storage guidance is formalized
 */

import type { AISession } from '#/schemas/ai';

export function buildStoragePrompt(_session: AISession): string {
    return '';
}