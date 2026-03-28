import type { AceRegistryType } from '#/schemas/registryTypes';
import { AITextBlockHeaderSchema } from '#/schemas/ai_protocol';
import type { BufferedAIEvent } from '#/schemas/ai_protocol';
import type { ParserBlockHandler } from '#/schemas/parser';

function parseEventBlock(body: string): {
    event?: BufferedAIEvent;
    fallbackText?: string;
} {
    const normalizedBody = body.trimStart();
    const firstLineBreak = normalizedBody.indexOf('\n');
    if (firstLineBreak === -1) {
        return { fallbackText: `\`\`\`event\n${normalizedBody}` };
    }

    const headerLine = normalizedBody.slice(0, firstLineBreak).trim();
    const payloadSection = normalizedBody.slice(firstLineBreak + 1);
    const payload = payloadSection.replace(/\n?end_event\s*$/, '');
    const headerParts = headerLine.split(',').map((s) => s.trim());
    const headerValidation = AITextBlockHeaderSchema.safeParse(headerParts);
    if (!headerValidation.success) {
        return { fallbackText: `\`\`\`event\n${normalizedBody}` };
    }

    const [event_type, window_uid, process_uid_raw, widget_uid_raw, action, sub_action] = headerValidation.data;
    const event: BufferedAIEvent = {
        headers: {
            event_type,
            window_uid,
            process_uid: process_uid_raw === 'null' || process_uid_raw === null ? undefined : process_uid_raw,
            widget_uid: widget_uid_raw === 'null' || widget_uid_raw === null ? undefined : widget_uid_raw,
            action,
            sub_action,
        },
        raw_payload_buffer: payload,
        is_complete: /\n?end_event\s*$/.test(payloadSection),
    };

    return { event };
}

export const registry: AceRegistryType.Parser = {
    name: 'event',
    slug: 'event',
    description: 'Fire UI or system event blocks.',
    aliases: ['json'],
    block_schema: {
        purpose: 'Fire a UI or system event to interact with ACE windows, widgets, or processes.',
        triggerConditions: [
            'AI wants to interact with the UI by opening/closing windows or switching tabs',
            'AI needs to send data to a specific window or widget component',
            'AI intends to trigger an action in the ACE system (e.g., execute tool, query storage)',
            'AI responds to user actions that require UI state changes',
        ],
        promptExamples: [
            'Open a new note-taking window for me',
            'Switch to the terminal view tab',
            'Send the search results to the main display',
            'Execute the backup tool through the system',
            'I want to open the settings panel',
            'Show me the file browser window',
        ],
        payloadNote: [
            'Payload format (inside the tag):',
            '  Line 1 — comma-separated header: event_type, window_uid, process_uid, widget_uid, action, sub_action',
            '    event_type : interaction | listener',
            '    window_uid : string ID of the target window',
            '    process_uid: string ID of process, or "null" if not applicable',
            '    widget_uid : string ID of widget, or "null" if not applicable',
            '    action     : lookup | open | send | close | execute_tool | execute_storage',
            '    sub_action : operation name (string)',
            '  Line 2+ — JSON object payload',
            '  Last line — must be exactly: end_event',
        ],
        exampleLines: [
            '  <event>',
            '  interaction, main_window, null, null, open, open_tab',
            '  {"tab_id":"search_view"}',
            '  end_event',
            '  </event>',
            '  Tab berhasil dibuka.',
        ],
    },
};

export const handler: ParserBlockHandler = ({ body, result }) => {
    const parsed = parseEventBlock(body);
    if (parsed.event) {
        result.events.push(parsed.event);
        result.blocks.push({
            block_slug: 'event',
            payload_raw: body,
            payload_json: {
                headers: parsed.event.headers,
                raw_payload_buffer: parsed.event.raw_payload_buffer,
                is_complete: parsed.event.is_complete,
            },
            is_complete: parsed.event.is_complete,
        });
    } else if (parsed.fallbackText) {
        result.blocks.push({
            block_slug: 'paragraph',
            payload_raw: parsed.fallbackText,
            payload_json: { content: parsed.fallbackText },
            is_complete: true,
        });
        result.textToPrint += parsed.fallbackText;
    }
};
