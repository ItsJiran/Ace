import { AISessionStatus } from "#/schemas/ai";

interface ControlPanelProps {
    prompt: string;
    onPromptChange: (prompt: string) => void;
    onSendPrompt: () => void;
    onStopPrompt: () => void;
    session_status: AISessionStatus;
}

export function ControlPanel({ prompt, onPromptChange, onSendPrompt, onStopPrompt, session_status }: ControlPanelProps) {
    const isStreaming = session_status == AISessionStatus.STREAMING;

    return (
        <div className="border-t border-zinc-800 px-3 py-2 flex items-end gap-2">
            <textarea
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
                        e.preventDefault();
                        onSendPrompt();
                    }
                }}
                placeholder={isStreaming ? 'Streaming... press Stop to interrupt' : 'Type prompt... Enter to send'}
                className="flex-1 min-h-[56px] max-h-40 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"
                disabled={isStreaming}
            />
            <button
                onClick={() => {
                    if (isStreaming) {
                        onStopPrompt();
                        return;
                    }

                    void onSendPrompt();
                }}
                className={`px-3 py-2 rounded text-white text-sm border disabled:opacity-50 disabled:cursor-not-allowed ${isStreaming
                    ? 'bg-rose-700 hover:bg-rose-600 border-rose-500/50'
                    : 'bg-cyan-700 hover:bg-cyan-600 border-cyan-500/50'}`}
            >
                {isStreaming ? 'Stop' : 'Send'}
            </button>
        </div>
    );
}
