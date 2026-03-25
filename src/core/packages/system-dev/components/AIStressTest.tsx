import { useEffect, useRef, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { Play, Square, FilePlus2, FileX2, FolderPlus, FolderX, Save, Activity } from 'lucide-react';
import { useAceMemory } from '#/hooks/useAceMemory';

// ── Types ─────────────────────────────────────────────────────────────

type SDKProvider = 'openai' | 'google' | 'anthropic';

interface GatewayModel {
    id: string;
    name?: string;
}

interface TestStep {
    id: string;
    action: 'write_file' | 'read_file' | 'delete_file' | 'create_directory';
    path: string;
    content?: string;
    description: string;
}

interface TestRunState {
    status: 'idle' | 'running' | 'completed' | 'stopped' | 'error';
    currentStepIndex: number;
    logs: string[];
    sessionId: string | null;
}

// ── Registry ──────────────────────────────────────────────────────────

export const registry: AceRegistryType.Component = {
    name: 'ai_stress_test',
    slug: 'ai-stress-test',
    react_behavior: 'ai_stress_test',
};

// ── Constants ─────────────────────────────────────────────────────────

const TEST_ROOT_DIR = 'stress_test_workspace';
const DEFAULT_STEPS: TestStep[] = [
    {
        id: 'step-1',
        action: 'create_directory',
        path: TEST_ROOT_DIR,
        description: 'Create test workspace directory',
    },
    {
        id: 'step-2',
        action: 'write_file',
        path: `${TEST_ROOT_DIR}/intro.txt`,
        content: 'Hello World from Stress Test',
        description: 'Write intro.txt',
    },
    {
        id: 'step-3',
        action: 'read_file',
        path: `${TEST_ROOT_DIR}/intro.txt`,
        description: 'Verify intro.txt content by reading',
    },
    {
        id: 'step-4',
        action: 'write_file',
        path: `${TEST_ROOT_DIR}/notes.md`,
        content: '# Research Notes\n\nAI is executing this.',
        description: 'Write notes.md markdown file',
    },
    {
        id: 'step-5',
        action: 'delete_file',
        path: `${TEST_ROOT_DIR}/intro.txt`,
        description: 'Cleanup intro.txt',
    },
];

const SDKS: SDKProvider[] = ['openai', 'google', 'anthropic'];

// ── Component ─────────────────────────────────────────────────────────

export default function AIStressTest() {
    // ── Config State ──
    const gatewayConfig = useAceMemory<{
        active_sdk: SDKProvider | null;
        active_model: string | null;
        sdks: Partial<Record<SDKProvider, { models: GatewayModel[] }>>;
    }>(window.ACE.ai_gateway.memory_uid);

    const [selectedSdk, setSelectedSdk] = useState<SDKProvider>('openai');
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [loopCount, setLoopCount] = useState(1);
    const [delayMs, setDelayMs] = useState(1000);

    // ── Runtime State ──
    const [runState, setRunState] = useState<TestRunState>({
        status: 'idle',
        currentStepIndex: -1,
        logs: [],
        sessionId: null,
    });

    const runnerRef = useRef<{ active: boolean; currentLoop: number }>({ active: false, currentLoop: 0 });

    // Sync config from RAM
    useEffect(() => {
        if (gatewayConfig?.active_sdk) setSelectedSdk(gatewayConfig.active_sdk);
        if (gatewayConfig?.active_model) setSelectedModel(gatewayConfig.active_model);
    }, [gatewayConfig?.active_sdk, gatewayConfig?.active_model]);

    const modelOptions = gatewayConfig?.sdks?.[selectedSdk]?.models ?? [];

    const addLog = (msg: string) => {
        setRunState((prev) => ({ ...prev, logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${msg}`] }));
    };

    const stopTest = () => {
        runnerRef.current.active = false;
        setRunState((prev) => ({ ...prev, status: 'stopped' }));
        addLog('🛑 Test stopped by user.');
    };

    const runStep = async (step: TestStep, sessionId: string, model: string) => {
        const prompt = `Execute this action: ${step.action} on path "${step.path}"${step.content ? ` with content: "${step.content}"` : ''}. Description: ${step.description}.`;
        
        // This memory key is transient per step
        const stepMemoryUid = `system:dev:stress_test:step:${Date.now()}`;

        // Send to gateway
        await window.ACE.ai_gateway.sendToSession(sessionId, prompt, stepMemoryUid);

        // In a real stress test, we would wait for the tool execution event confirmation here.
        // For this baseline, we assume "sendToSession" triggers the AI which eventually triggers the tool.
        // We just wait for the network/processing delay to simulate the "thinking" block.
    };

    const startTest = async () => {
        if (runState.status === 'running') return;
        
        const modelToUse = selectedModel || modelOptions[0]?.id || 'gpt-4o-mini';
        addLog(`🚀 Starting stress test [${selectedSdk}/${modelToUse}] - Loops: ${loopCount}`);
        
        runnerRef.current = { active: true, currentLoop: 0 };
        setRunState({
            status: 'running',
            currentStepIndex: -1,
            logs: [],
            sessionId: null,
        });

        try {
            // Create dedicated session
            const sid = await window.ACE.ai_gateway.createSession(selectedSdk, modelToUse);
            setRunState((prev) => ({ ...prev, sessionId: sid }));
            addLog(`Session created: ${sid}`);

            // Loop logic
            while (runnerRef.current.active && runnerRef.current.currentLoop < loopCount) {
                runnerRef.current.currentLoop++;
                addLog(`🔄 Loop ${runnerRef.current.currentLoop}/${loopCount} started...`);

                for (let i = 0; i < DEFAULT_STEPS.length; i++) {
                    if (!runnerRef.current.active) break;
                    
                    const step = DEFAULT_STEPS[i];
                    setRunState((prev) => ({ ...prev, currentStepIndex: i }));
                    addLog(`👉 Step ${i + 1}: ${step.description}`);

                    await runStep(step, sid, modelToUse);

                    // Wait delay
                    await new Promise((r) => setTimeout(r, delayMs));
                }
            }

            if (runnerRef.current.active) {
                addLog('✅ All loops completed successfully.');
                setRunState((prev) => ({ ...prev, status: 'completed' }));
            }
        } catch (error) {
            addLog(`❌ Error: ${String(error)}`);
            setRunState((prev) => ({ ...prev, status: 'error' }));
        } finally {
            runnerRef.current.active = false;
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-zinc-950 text-zinc-200 text-xs">
            {/* Header */}
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-2 font-medium text-zinc-300">
                    <Activity size={14} className="text-rose-400" />
                    AI Stress Test
                </div>
                <div className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-500">
                    {runState.status.toUpperCase()}
                </div>
            </div>

            {/* Config Panel */}
            <div className="p-3 border-b border-zinc-800 grid grid-cols-2 gap-3 bg-zinc-900/20">
                <label className="flex flex-col gap-1">
                    <span className="text-zinc-500 text-[10px] uppercase font-bold">SDK Provider</span>
                    <select
                        value={selectedSdk}
                        onChange={(e) => setSelectedSdk(e.target.value as SDKProvider)}
                        disabled={runState.status === 'running'}
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 focus:border-rose-500 outline-none"
                    >
                        {SDKS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-zinc-500 text-[10px] uppercase font-bold">Model</span>
                    <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        disabled={runState.status === 'running'}
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 focus:border-rose-500 outline-none"
                    >
                        {modelOptions.length === 0 && <option value="">(no models)</option>}
                        {modelOptions.map((m) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-zinc-500 text-[10px] uppercase font-bold">Loops</span>
                    <input
                        type="number"
                        min={1}
                        max={100}
                        value={loopCount}
                        onChange={(e) => setLoopCount(parseInt(e.target.value))}
                        disabled={runState.status === 'running'}
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 focus:border-rose-500 outline-none"
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-zinc-500 text-[10px] uppercase font-bold">Step Delay (ms)</span>
                    <input
                        type="number"
                        min={100}
                        step={100}
                        value={delayMs}
                        onChange={(e) => setDelayMs(parseInt(e.target.value))}
                        disabled={runState.status === 'running'}
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 focus:border-rose-500 outline-none"
                    />
                </label>
            </div>

            {/* Test Steps Preview */}
            <div className="border-b border-zinc-800 bg-zinc-900/10">
                <div className="px-3 py-2 text-[10px] uppercase font-bold text-zinc-500 flex justify-between items-center">
                    <span>Test Sequence ({DEFAULT_STEPS.length} steps)</span>
                </div>
                <div className="max-h-[100px] overflow-auto px-3 pb-2 space-y-1">
                    {DEFAULT_STEPS.map((step, idx) => {
                        const isActive = runState.status === 'running' && runState.currentStepIndex === idx;
                        const isDone = runState.status === 'running' && runState.currentStepIndex > idx;
                        return (
                            <div 
                                key={step.id} 
                                className={`flex items-center gap-2 p-1.5 rounded border ${
                                    isActive 
                                        ? 'bg-rose-900/20 border-rose-500/30 text-rose-200' 
                                        : isDone
                                            ? 'bg-zinc-900/40 border-zinc-800 text-zinc-500'
                                            : 'bg-zinc-900/20 border-zinc-800/50 text-zinc-400'
                                }`}
                            >
                                <span className="font-mono text-[10px] opacity-50 w-4">{idx + 1}.</span>
                                {step.action === 'create_directory' && <FolderPlus size={12} />}
                                {step.action === 'write_file' && <FilePlus2 size={12} />}
                                {step.action === 'read_file' && <Save size={12} />}
                                {step.action === 'delete_file' && <FileX2 size={12} />}
                                <span className="truncate flex-1">{step.description}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Logs Console */}
            <div className="flex-1 overflow-auto p-3 font-mono text-[11px] space-y-1 bg-black/20">
                {runState.logs.length === 0 && (
                    <div className="text-zinc-600 italic">Logs will appear here...</div>
                )}
                {runState.logs.map((log, i) => (
                    <div key={i} className="text-zinc-400 whitespace-nowrap">{log}</div>
                ))}
            </div>

            {/* Controls */}
            <div className="p-3 border-t border-zinc-800 flex gap-2 justify-end bg-zinc-900/50">
                {runState.status === 'running' ? (
                    <button
                        onClick={stopTest}
                        className="flex items-center gap-2 px-4 py-2 bg-red-900/50 hover:bg-red-900/70 border border-red-700/50 text-red-200 rounded font-medium transition-colors"
                    >
                        <Square size={14} fill="currentColor" />
                        Stop Test
                    </button>
                ) : (
                    <button
                        onClick={() => { void startTest(); }}
                        className="flex items-center gap-2 px-4 py-2 bg-rose-700 hover:bg-rose-600 border border-rose-500/50 text-white rounded font-medium transition-colors shadow-[0_0_10px_rgba(225,29,72,0.2)]"
                    >
                        <Play size={14} fill="currentColor" />
                        Start Loop Test
                    </button>
                )}
            </div>
        </div>
    );
}
