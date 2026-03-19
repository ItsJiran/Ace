import { StorageEngine } from './storageEngine';
import { EventBus } from './eventEngine';
import { parseAIStreamChunk } from './aiParser';
import type { Interaction } from '../schemas/events';
import type { AIProvider } from '../schemas/ai_registry';

export interface AISession {
    sessionId: string;
    providerId: string;
    
    // The specific RAM key this session is currently streaming into
    activeOutputRamKey?: string; 
    
    // Parser State (Per-Session Buffer)
    activeEventBuffer: string;
    isInsideEventBlock: boolean;
    
    status: 'idle' | 'connected' | 'streaming' | 'error';
    
    // Future: WebSocket instance
    // socket?: WebSocket;
}

/**
 * AIGatewayEngineSingleton
 * Role: The primary communicator between the local environment and the AI "Brain".
 * It handles the incoming stream, parses it for events, and writes text to RAM.
 * 
 * Functions as a "Provider Registry" managing multiple AI endpoints (OpenClaw, etc.).
 * Manages multiple concurrent AISessions for multi-agentic capabilities.
 */
class AIGatewayEngineSingleton {
    // Registry of configured AI providers
    private providers = new Map<string, AIProvider>();

    // Active Sessions Map (sessionId -> AISession)
    private sessions = new Map<string, AISession>();

    /**
     * Register a new AI Provider configuration.
     * Starts listening for connections on this provider (future logic).
     */
    registerProvider(provider: AIProvider) {
        this.providers.set(provider.id, provider);
        console.log(`[AIGatewayEngine] Registered provider: ${provider.name} (${provider.type})`);
    }

    /**
     * Get a specific provider configuration by ID.
     */
    getProvider(providerId: string) {
        return this.providers.get(providerId);
    }

    /**
     * List all registered providers.
     */
    getAllProviders() {
        return Array.from(this.providers.values());
    }

    /**
     * Create a new isolated session connected to a specific provider.
     * This allows multiple tabs/agents to have independent conversation streams.
     * 
     * @param providerId - The ID of the registered provider to use
     * @returns sessionId - The unique ID for this new session
     */
    async createSession(providerId: string): Promise<string> {
        const provider = this.providers.get(providerId);
        if (!provider) {
            throw new Error(`[AIGatewayEngine] Provider ${providerId} not found.`);
        }

        const sessionId = `sess-${crypto.randomUUID()}`;
        
        const session: AISession = {
            sessionId,
            providerId,
            activeEventBuffer: '',
            isInsideEventBlock: false,
            status: 'connected', // Simulating instant connection for now
        };

        this.sessions.set(sessionId, session);
        console.log(`[AIGatewayEngine] Session ${sessionId} created on provider ${provider.name}.`);
        
        return sessionId;
    }

    /**
     * Close and cleanup a session.
     */
    closeSession(sessionId: string) {
        if (this.sessions.has(sessionId)) {
            this.sessions.delete(sessionId);
            console.log(`[AIGatewayEngine] Session ${sessionId} closed.`);
        }
    }

    /**
     * Process a chunk of incoming AI stream data for a SPECIFIC session.
     * Separates the conversational text from the ```event blocks using session-local state.
     */
    private handleSessionStreamChunk(sessionId: string, chunk: string, ramKey: string, processUid?: string) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        // Append to session-specific buffer
        const fullStream = session.activeEventBuffer + chunk;
        session.activeEventBuffer = ''; 

        const { events, textToPrint } = parseAIStreamChunk(fullStream);

        // 1. PATHWAY A: Append Conversational Text to RAM
        if (textToPrint) {
            const currentText = StorageEngine.readMemory(ramKey) || '';
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: ramKey,
                payload: { text: currentText + textToPrint }
            });
        }

        // 2. PATHWAY B: Handle Events
        events.forEach(event => {
            if (event.is_complete) {
                session.isInsideEventBlock = false;
                
                // Interaction Emission
                const interaction: Interaction = {
                    event_type: 'interaction',
                    window_uid: event.headers.window_uid,
                    process_uid: event.headers.process_uid || processUid,
                    widget_uid: event.headers.widget_uid,
                    action: event.headers.action,
                    sub_action: event.headers.sub_action,
                    payload: JSON.parse(event.raw_payload_buffer || '{}'),
                    
                    // Crucial: Pass session context so the handler knows where to reply!
                    preallocated_memory: {
                        session_id: sessionId,
                        provider_id: session.providerId
                    }
                };

                console.log(`[AIGatewayEngine] [${sessionId}] Event Detected: ${interaction.action}`);
                EventBus.emit(interaction);
            } else {
                session.isInsideEventBlock = true;
                
                // Reconstruct buffer for next chunk
                const h = event.headers;
                const headerLine = `${h.event_type}, ${h.window_uid}, ${h.process_uid || 'null'}, ${h.widget_uid || 'null'}, ${h.action}, ${h.sub_action}`;
                session.activeEventBuffer = `\n\`\`\`event\n${headerLine}\n${event.raw_payload_buffer}`;
            }
        });
    }

    /**
     * Send a prompt to a specific session.
     * In Phase 4, this simulates a streaming response for testing.
     */
    async sendToSession(sessionId: string, prompt: string, reply_to_ram_key: string) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found.`);
        }

        console.log(`[AIGatewayEngine] [${sessionId}] Sending: "${prompt}"`);
        session.status = 'streaming';
        session.activeOutputRamKey = reply_to_ram_key;

        // PRE-ALLOCATION
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: reply_to_ram_key,
            payload: { text: '', status: 'streaming', session_id: sessionId }
        });

        // SIMULATION MODE (Phase 4 Mock)
        const chunks = [
            "Hello! I am reading your request via session " + sessionId + ".",
            " I will help you with that.\n\n",
            "```event\ninteraction, main_window, null, null, open, open_widget\n",
            "{\n  \"widget_name\": \"calendar_view\"\n}\nend_event\n```\n",
            "There you go! I have opened the calendar for you."
        ];

        for (const chunk of chunks) {
            await new Promise(resolve => setTimeout(resolve, 300));
            this.handleSessionStreamChunk(sessionId, chunk, reply_to_ram_key);
        }

        // Finalize state
        session.status = 'connected';
        StorageEngine.dispatchRAMAction({
            action: 'update_memory',
            memory_uid: reply_to_ram_key,
            payload: { status: 'completed' }
        });
    }
    
    // Legacy support alias (deprecated)
    async connect(providerId: string) {
        return this.createSession(providerId);
    }
}

export const AIGatewayEngine = new AIGatewayEngineSingleton();
