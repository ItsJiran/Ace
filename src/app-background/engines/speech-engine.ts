/**
 * Speech Engine — Text-to-Speech (TTS) and Speech-to-Text (STT) using ONNX models.
 *
 * TTS: AutoTokenizer + AutoModel (direct inference, Kokoro-82M).
 * STT: pipeline('automatic-speech-recognition', ...).
 * Uses @huggingface/transformers v3. Progress via progress_callback option (not env.customProgressCallback).
 */

import { pipeline, env, AutoTokenizer, AutoModel, Tensor } from '@huggingface/transformers';
import * as path from 'node:path';
import * as os from 'node:os';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { FSEngine } from '#/shared/engines/fs-engine';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import { DefaultConfigSpeech } from '#/shared/constants/config';
import type { InferConfigData } from '#/shared/schemas/config';

// ── Module-level env ──────────────────────────────────────────────────────

env.allowLocalModels = false;
(env as any).backends ??= {};
(env as any).backends.onnx ??= {};
(env as any).backends.onnx.wasm ??= {};
(env as any).backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/';
(env as any).backends.onnx.wasm.remoteWasm = false;

// ── Types ─────────────────────────────────────────────────────────────────

type SpeechConfig = InferConfigData<typeof DefaultConfigSpeech>;

export interface DownloadProgress {
    file: string;
    progress: number;
    loaded: number;
    total: number;
    status: string;
}

type ProgressListener = (data: DownloadProgress) => void;

export class SpeechEngine {
    private static instance: SpeechEngine;

    private sttPipeline: any = null;
    private ttsTokenizer: any = null;
    private ttsModel: any = null;
    private currentTTSPath: string | null = null;
    private currentSTTPath: string | null = null;
    private listeners = new Set<ProgressListener>();
    private ttsDownloading = false;
    private sttDownloading = false;
    private cacheDirReady = false;

    static getInstance(): SpeechEngine {
        if (!SpeechEngine.instance) SpeechEngine.instance = new SpeechEngine();
        return SpeechEngine.instance;
    }

    private async ensureCacheDir() {
        if (this.cacheDirReady) return;
        let modelsDir: string;
        try {
            modelsDir = await FSEngine.resolveAppConfigPath('models');
        } catch {
            modelsDir = path.join(os.homedir(), '.config', 'AceAssistant', 'models');
        }
        env.cacheDir = modelsDir;
        await FSEngine.createDirectory('models');
        this.cacheDirReady = true;
        console.log('[SpeechEngine] Cache dir:', modelsDir);
    }

    // ── Progress (stored for RPC polling) ────────────────────────────────

    private lastTTSProgress: DownloadProgress | null = null;
    private lastSTTProgress: DownloadProgress | null = null;

    private emitProgress(data: any) {
        const progress: DownloadProgress = {
            file: data.file ?? '',
            progress: Math.round(data.progress ?? 0),
            loaded: data.loaded ?? 0,
            total: data.total ?? 0,
            status: data.status ?? 'downloading',
        };
        const fname = (data.file ?? '').split('/').pop() || 'unknown';
        console.log(`[SpeechEngine] ${progress.status}: ${fname} ${progress.progress}%`);
        this.listeners.forEach((l) => l(progress));
        if ((data.file ?? '').toLowerCase().includes('kokoro')) this.lastTTSProgress = progress;
        else this.lastSTTProgress = progress;
        // Push to client via RPC
        RPCEngine.invoke('speech.client.progress', { payload: { tts: this.lastTTSProgress, stt: this.lastSTTProgress } }).catch(() => {});
    }

    onProgress(fn: ProgressListener): () => void {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }

    // ── Config ────────────────────────────────────────────────────────────

    private readConfig(): SpeechConfig | undefined {
        return KernelEngine.readMemory(DefaultConfigSpeech.memory_uid) as SpeechConfig | undefined;
    }

    private getTTSPath(): string {
        const cfg = this.readConfig();
        return (cfg as any)?.['speech.tts_model'] ?? 'onnx-community/Kokoro-82M-ONNX';
    }

    private getSTTPath(): string {
        const cfg = this.readConfig();
        return (cfg as any)?.['speech.stt_model'] ?? 'onnx-community/whisper-base';
    }

    get isTTSReady(): boolean {
        return this.ttsModel !== null && this.currentTTSPath === this.getTTSPath();
    }

    get isSTTReady(): boolean {
        return this.sttPipeline !== null && this.currentSTTPath === this.getSTTPath();
    }

    // ── TTS ──────────────────────────────────────────────────────────────

    async downloadTTS(): Promise<void> {
        if (this.isTTSReady) return;
        if (this.ttsDownloading) return;
        this.ttsDownloading = true;
        await this.ensureCacheDir();
        try { await this.ensureTTS(); }
        catch (err: any) { console.error('[SpeechEngine] TTS retry:', err.message); await this.ensureTTS(); }
        finally { this.ttsDownloading = false; }
    }

    async ensureTTS(): Promise<void> {
        const p = this.getTTSPath();
        if (this.ttsModel && this.currentTTSPath === p) return;
        console.log('[SpeechEngine] Loading TTS:', p);
        try {
            this.ttsTokenizer = await AutoTokenizer.from_pretrained(p, {
                progress_callback: (d: any) => this.emitProgress(d),
            } as any);
            this.ttsModel = await AutoModel.from_pretrained(p, {
                quantized: true,
                progress_callback: (d: any) => this.emitProgress(d),
            } as any);
            this.currentTTSPath = p;
            console.log('[SpeechEngine] TTS loaded.');
        } catch (err: any) {
            console.error('[SpeechEngine] TTS load failed:', err.message);
            throw err;
        }
    }

    async testTTS(text: string): Promise<{ audio: Float32Array; sampleRate: number; modelPath: string }> {
        await this.ensureTTS();
        const { input_ids } = await this.ttsTokenizer(text);
        const spk = new Tensor('int64', BigInt64Array.from([0n]), [1]);
        const sty = new Tensor('float32', new Float32Array(256).fill(0), [1, 256]);
        const spd = new Tensor('float32', new Float32Array([1.0]), [1]);
        const out = await this.ttsModel({ input_ids, speaker: spk, style: sty, speed: spd });
        return {
            audio: out?.audio?.data ?? out?.audio ?? new Float32Array(0),
            sampleRate: out?.sample_rate ?? 24000,
            modelPath: this.getTTSPath(),
        };
    }

    // ── STT ──────────────────────────────────────────────────────────────

    async downloadSTT(): Promise<any> {
        if (this.isSTTReady) return;
        if (this.sttDownloading) return;
        this.sttDownloading = true;
        await this.ensureCacheDir();
        try { return await this.ensureSTT(); }
        catch (err: any) { console.error('[SpeechEngine] STT retry:', err.message); return await this.ensureSTT(); }
        finally { this.sttDownloading = false; }
    }

    async ensureSTT(): Promise<any> {
        const p = this.getSTTPath();
        if (this.sttPipeline && this.currentSTTPath === p) return this.sttPipeline;
        console.log('[SpeechEngine] Loading STT:', p);
        try {
            this.sttPipeline = await pipeline('automatic-speech-recognition', p, {
                progress_callback: (d: any) => this.emitProgress(d),
            } as any);
            this.currentSTTPath = p;
            console.log('[SpeechEngine] STT loaded.');
            return this.sttPipeline;
        } catch (err: any) {
            console.error('[SpeechEngine] STT load failed:', err.message);
            throw err;
        }
    }

    async testSTT(audio: Float32Array, sampleRate = 16000): Promise<{ text: string; modelPath: string }> {
        const pipe = await this.ensureSTT();
        const res = await pipe(audio, { sampling_rate: sampleRate });
        return { text: (res as any).text ?? '', modelPath: this.getSTTPath() };
    }

    dispose() {
        this.ttsModel = null; this.ttsTokenizer = null; this.sttPipeline = null;
        this.currentTTSPath = null; this.currentSTTPath = null;
    }

    // ── RPC ──────────────────────────────────────────────────────────────

    async registerRPC() {
        const e = this;
        console.log('[SpeechEngine] Registering RPC...');

        await RPCEngine.handle('speech.downloadTTS', async () => {
            console.log('[SpeechEngine] RPC: downloadTTS start');
            await e.downloadTTS();
            console.log('[SpeechEngine] RPC: downloadTTS done, ready=' + e.isTTSReady);
            return { ready: e.isTTSReady };
        }, { owner: 'SpeechEngine' });

        await RPCEngine.handle('speech.downloadSTT', async () => {
            console.log('[SpeechEngine] RPC: downloadSTT start');
            await e.downloadSTT();
            console.log('[SpeechEngine] RPC: downloadSTT done, ready=' + e.isSTTReady);
            return { ready: e.isSTTReady };
        }, { owner: 'SpeechEngine' });

        await RPCEngine.handle('speech.testTTS', async (p: { text: string }) => {
            console.log('[SpeechEngine] RPC: testTTS len=' + p.text.length);
            return await e.testTTS(p.text);
        }, { owner: 'SpeechEngine' });

        await RPCEngine.handle('speech.testSTT', async (p: { audio: number[]; sampleRate?: number }) => {
            console.log('[SpeechEngine] RPC: testSTT len=' + p.audio.length);
            return await e.testSTT(new Float32Array(p.audio), p.sampleRate ?? 16000);
        }, { owner: 'SpeechEngine' });

        await RPCEngine.handle('speech.progress', async () => ({
            tts: e.lastTTSProgress,
            stt: e.lastSTTProgress,
        }), { owner: 'SpeechEngine' });

        await RPCEngine.handle('speech.getStatus', async () => {
            return { ttsReady: e.isTTSReady, sttReady: e.isSTTReady };
        }, { owner: 'SpeechEngine' });

        console.log('[SpeechEngine] RPC registered.');
    }
}
