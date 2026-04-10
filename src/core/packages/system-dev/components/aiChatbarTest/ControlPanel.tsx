import { AISessionStatus } from "#/schemas/ai";

interface ControlPanelProps {
    prompt: string;
    onPromptChange: (prompt: string) => void;
    onSendPrompt: () => void;
    session_status: AISessionStatus;
}

export function ControlPanel({ prompt, onPromptChange, onSendPrompt, session_status }: ControlPanelProps) {
    return (
        <div className="border-t border-zinc-800 px-3 py-2 flex items-end gap-2">
            <textarea
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        onSendPrompt();
                    }
                }}
                placeholder={session_status == AISessionStatus.STREAMING ? 'Waiting current response...' : 'Type prompt... Enter to send'}
                className="flex-1 min-h-[56px] max-h-40 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"
                disabled={session_status == AISessionStatus.STREAMING}
            />
            <button
                onClick={() => { void onSendPrompt(); }}
                className="px-3 py-2 rounded bg-cyan-700 hover:bg-cyan-600 text-white text-sm border border-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={session_status == AISessionStatus.STREAMING}
            >
                Send
            </button>
        </div>
    );
}
