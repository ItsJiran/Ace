/**
 * Prompt Builder Formatting
 *
 * Summary:
 * - normalizes section indentation and blank lines before final prompt composition
 * - keeps section builders free to focus on content instead of output cleanup
 */

export function normalizePromptSection(section: string): string {
    const trimmed = section.replace(/\r\n/g, '\n').trim();
    if (trimmed === '') return '';

    const lines = trimmed.split('\n');
    const indentLengths = lines
        .filter((line) => line.trim() !== '')
        .map((line) => {
            const match = line.match(/^[ \t]*/);
            return match ? match[0].length : 0;
        });

    const commonIndent = indentLengths.length > 0 ? Math.min(...indentLengths) : 0;

    return lines
        .map((line) => line.slice(commonIndent).replace(/[ \t]+$/g, ''))
        .join('\n')
        .trim();
}

export function composePromptSections(sections: string[]): string {
    return sections
        .map(normalizePromptSection)
        .filter(Boolean)
        .join('\n\n');
}