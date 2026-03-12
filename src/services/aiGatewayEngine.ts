import { Storage } from './storageEngine';
import { EventBus } from './eventEngine';
import { parseAIStreamChunk } from './aiParser';
import type { Interaction } from '../schemas/events';

/**
 * Configuration for the AI Gateway connection.
 */
export interface GatewayConfig {
    provider: 'openai' | 'anthropic' | 'custom';
    apiKey: string;
    endpoint?: string;
}

/**
 * AIGatewayEngineSingleton
 * Role: The primary communicator between the local environment and the AI "Brain".
 * It handles the incoming stream, parses it for events, and writes text to RAM.
 */
class AIGatewayEngineSingleton {
    private isConnected = false;
    private config?: GatewayConfig;

    // The persistent buffer for incomplete event blocks
    private activeEventBuffer: string = '';
    private isInsideEventBlock: boolean = false;

    /**
     * Connect to the AI Gateway provider.
     */
    async connect(config: GatewayConfig) {
        console.log(`[AIGatewayEngine] Connecting to ${config.provider}... using API Key: ${config.apiKey.substring(0, 4)}***`);
        this.config = config;

        // Phase 4: Simulated connection latency
        await new Promise(resolve => setTimeout(resolve, 500));

        this.isConnected = true;
        console.log(`[AIGatewayEngine] Connected successfully.`);
    }

    /**
     * Process a chunk of incoming AI stream data.
     * Separates the conversational text from the ```event blocks using a stateful approach.
     */
    handleStreamChunk(chunk: string, ramKey: string, processUid?: string) {
        // We append the new chunk to our processing stream
        const fullStream = this.activeEventBuffer + chunk;
        this.activeEventBuffer = ''; // Reset buffer as we are now processing it

        const { events, textToPrint } = parseAIStreamChunk(fullStream);

        // 1. PATHWAY A: Append Conversational Text to RAM
        // Only print if there's text outside of event blocks.
        if (textToPrint) {
            const currentText = Storage.readMemory(ramKey) || '';
            Storage.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: ramKey,
                payload: { text: currentText + textToPrint }
            });
        }

        // 2. PATHWAY B: Handle Events (Completed vs Incomplete)
        events.forEach(event => {
            if (event.is_complete) {
                // Buffer management: If this was the last incomplete event, we are out.
                this.isInsideEventBlock = false;
                console.log(`[AIGatewayEngine] Stream status: InsideBlock=${this.isInsideEventBlock}`);

                // Convert buffered protocol event to a system-wide Interaction ticket
                const interaction: Interaction = {
                    event_type: 'interaction',
                    window_uid: event.headers.window_uid,
                    process_uid: event.headers.process_uid || processUid,
                    widget_uid: event.headers.widget_uid,
                    action: event.headers.action,
                    payload: JSON.parse(event.raw_payload_buffer || '{}')
                };

                console.log(`[AIGatewayEngine] Completed event detected: ${interaction.action}. Emitting...`);
                EventBus.emit(interaction);
            } else {
                // If it's incomplete, we put it back in the buffer for the next chunk
                // We reconstruct the block so the Regex can find it again
                this.isInsideEventBlock = true;

                // Construct the header line
                const h = event.headers;
                const headerLine = `${h.event_type}, ${h.window_uid}, ${h.process_uid || 'null'}, ${h.widget_uid || 'null'}, ${h.action}, ${h.sub_action}`;

                this.activeEventBuffer = `\n\`\`\`event\n${headerLine}\n${event.raw_payload_buffer}`;
            }
        });
    }

    /**
     * Send a prompt to the AI.
     * In Phase 4, this simulates a streaming response for testing.
     */
    async sendPrompt(prompt: string, reply_to_ram_key: string) {
        if (!this.isConnected) {
            throw new Error('AIGatewayEngine not connected. Please call connect() first.');
        }

        console.log(`[AIGatewayEngine] Sending prompt: "${prompt}"`);

        // PRE-ALLOCATION: Ensure the RAM key exists
        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: reply_to_ram_key,
            payload: { text: '', status: 'streaming' }
        });

        // SIMULATION MODE (Phase 4 Mock)
        // We simulate several chunks arriving over time.
        const chunks = [
            "Hello! I am reading your request.",
            " I will help you with that.\n\n",
            "```event\ninteraction, main_window, null, null, open, open_widget\n",
            "{\n  \"widget_name\": \"calendar_view\"\n}\nend_event\n```\n",
            "There you go! I have opened the calendar for you."
        ];

        for (const chunk of chunks) {
            await new Promise(resolve => setTimeout(resolve, 300));
            this.handleStreamChunk(chunk, reply_to_ram_key);
        }

        // Finalize state
        Storage.dispatchRAMAction({
            action: 'update_memory',
            memory_uid: reply_to_ram_key,
            payload: { status: 'completed' }
        });
    }
}

export const AIGatewayEngine = new AIGatewayEngineSingleton();
