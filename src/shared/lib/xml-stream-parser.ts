/**
 * xml-stream-parser.ts  (shared)
 *
 * Streaming XML tag state machine — takes LLM token chunks and emits
 * structured tag-level events (ace_tag_start / ace_tag_delta / ace_tag_end).
 *
 * Modes: Text → OpenTag/CloseTag → Text (loop)
 *
 * Handles:
 *  - Split tokens across chunks: "<thou" + "ght>"
 *  - Mismatched close tags: silently ignored unless name matches openTag
 *  - Progressive per-chunk delta emission
 */

export type XmlStreamTagEvent =
    | { type: 'ace_tag_start'; tag: string }
    | { type: 'ace_tag_delta'; tag: string; text: string }
    | { type: 'ace_tag_end'; tag: string };

const MAX_TAG_LENGTH = 64;
const Text = 0, OpenTag = 1, CloseTag = 2;

export class XmlStreamParser {
    // ── Buffer ──
    private buf = '';                  // unprocessed characters
    private fullText = '';             // complete accumulated text

    // ── State ──
    private mode = Text;
    private openTag = '';              // currently active tag name
    private tagAcc = '';               // accumulating tag name (open or close)
    private textAcc = '';              // accumulating text content
    private tagContents: Record<string, string> = {};

    // ═══════════════════════════════════════════════
    // PUBLIC
    // ═══════════════════════════════════════════════

    /** Feed a chunk from the LLM stream. Returns events for this chunk. */
    feed(chunk: string): XmlStreamTagEvent[] {
        this.fullText += chunk;
        this.buf += chunk;
        const events = this.scan();

        // Emit any remaining text as a delta (per-chunk progressive streaming)
        if (this.textAcc && this.openTag) {
            events.push({ type: 'ace_tag_delta', tag: this.openTag, text: this.textAcc });
            this.textAcc = '';
        }
        return events;
    }

    /** Force-flush remaining text. Call after stream ends. */
    flushRemaining(): XmlStreamTagEvent[] {
        return this.scan(true);
    }

    /** Clean up and return final per-tag contents. */
    close(): Record<string, string> {
        this.scan(true);
        return { ...this.tagContents };
    }

    getFullText(): string { return this.fullText; }

    // ═══════════════════════════════════════════════
    // SCANNER
    // ═══════════════════════════════════════════════

    private scan(force = false): XmlStreamTagEvent[] {
        const events: XmlStreamTagEvent[] = [];
        let i = 0;

        while (i < this.buf.length || force) {
            // Force mode: flush remaining text and exit
            if (i >= this.buf.length) {
                if (force && this.textAcc && this.openTag) {
                    events.push({ type: 'ace_tag_delta', tag: this.openTag, text: this.textAcc });
                    this.textAcc = '';
                }
                break;
            }

            const ch = this.buf[i];

            if (this.mode === Text)       i = this.scanText(ch, i, events);
            else if (this.mode === OpenTag)  i = this.scanOpenTag(ch, i, events);
            else if (this.mode === CloseTag) i = this.scanCloseTag(ch, i, events);
        }

        this.buf = this.buf.slice(i);
        return events;
    }

    // ── TEXT MODE — accumulate content, detect '<' ──

    private scanText(ch: string, i: number, events: XmlStreamTagEvent[]): number {
        if (ch !== '<') {
            this.textAcc += ch;
            return i + 1;
        }

        // '<' detected — flush accumulated text
        if (this.textAcc && this.openTag) {
            events.push({ type: 'ace_tag_delta', tag: this.openTag, text: this.textAcc });
            this.textAcc = '';
        }

        // Look ahead to decide: open tag or close tag?
        if (i + 1 < this.buf.length && this.buf[i + 1] === '/') {
            // Close tag: `</` — halt buffer until `>` confirms it's our tag
            this.mode = CloseTag;
            this.tagAcc = '';
            return i + 2; // skip '</'
        }

        // Open tag: `<...`
        this.mode = OpenTag;
        this.tagAcc = '';
        return i + 1; // skip '<'
    }

    // ── OPEN TAG — accumulate `<tagname>`, emit start on `>` ──

    private scanOpenTag(ch: string, i: number, events: XmlStreamTagEvent[]): number {
        if (ch !== '>') {
            if (this.tagAcc.length < MAX_TAG_LENGTH) this.tagAcc += ch;
            return i + 1;
        }

        // '>' — tag name complete
        const tagName = this.tagAcc.trim();
        this.tagAcc = '';
        this.mode = Text;

        if (tagName.length > 0 && !tagName.startsWith('?')) {
            this.openTag = tagName;
            events.push({ type: 'ace_tag_start', tag: tagName });
        }
        return i + 1;
    }

    // ── CLOSE TAG — buffer `</tagname>`, verify match, emit end on `>` ──

    private scanCloseTag(ch: string, i: number, events: XmlStreamTagEvent[]): number {
        if (ch !== '>') {
            if (this.tagAcc.length < MAX_TAG_LENGTH) this.tagAcc += ch;
            return i + 1;
        }

        // '>' — close tag complete; verify it matches the current openTag
        const closeTagName = this.tagAcc.trim();
        this.tagAcc = '';
        this.mode = Text;

        if (this.openTag) {
            if (closeTagName === this.openTag) {
                // Valid match — emit end
                events.push({ type: 'ace_tag_end', tag: this.openTag });
                this.openTag = '';
            }
            // Mismatch: silently ignore (malformed XML — keep openTag as-is)
        }
        // No open tag: orphan close tag — ignore

        return i + 1;
    }
}
