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
import * as fs from 'node:fs/promises';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import { EventBus } from '#/shared/engines/event-engine';
import { DefaultConfigSpeech } from '#/shared/constants/config';
import type { InferConfigData } from '#/shared/schemas/config';

// ── Module-level env ──────────────────────────────────────────────────────

env.allowLocalModels = true;
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

    /** Check if model files exist in cache. Returns the model sub-dir path or null. */
    private async modelExistsOnDisk(modelPath: string): Promise<boolean> {
        await this.ensureCacheDir();
        const cacheRoot = env.cacheDir as string;
        // Transformers v3 stores models under cacheDir/huggingface/hub/models--org--model/
        const modelSlug = modelPath.replace(/\//g, '--');
        const possibleDirs = [
            path.join(cacheRoot, 'huggingface', 'hub', `models--${modelSlug}`),
            path.join(cacheRoot, modelSlug),
            path.join(cacheRoot, modelPath),
        ];
        for (const d of possibleDirs) {
            try {
                await fs.access(d);
                const files = await fs.readdir(d);
                if (files.some(f => f.endsWith('.onnx') || f.endsWith('.json'))) {
                    console.log(`[SpeechEngine] Model found on disk: ${d} (${files.length} files)`);
                    return true;
                }
            } catch { /* dir doesn't exist */ }
        }
        return false;
    }

    // ── Progress (stored for RPC polling) ────────────────────────────────

    private lastTTSProgress: DownloadProgress | null = null;
    private lastSTTProgress: DownloadProgress | null = null;

    private emitProgress(data: any, type: 'tts' | 'stt') {
        const progress: DownloadProgress = {
            file: data.file ?? '',
            progress: Math.round(data.progress ?? 0),
            loaded: data.loaded ?? 0,
            total: data.total ?? 0,
            status: data.status ?? 'downloading',
        };
        const fname = (data.file ?? '').split('/').pop() || 'unknown';
        console.log(`[SpeechEngine] ${type} ${progress.status}: ${fname} ${progress.progress}%`);
        this.listeners.forEach((l) => l(progress));
        if (type === 'tts') this.lastTTSProgress = progress;
        else this.lastSTTProgress = progress;
        EventBus.emit(
            type === 'tts' ? 'speech:tts-progress' : 'speech:stt-progress',
            { payload: progress as any },
            { target: 'desktop' },
        ).catch(() => {});
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

        const modelPath = this.getTTSPath();
        const onDisk = await this.modelExistsOnDisk(modelPath);
        if (onDisk) {
            console.log('[SpeechEngine] TTS model already on disk, loading from cache.');
        } else {
            console.log('[SpeechEngine] TTS model not found on disk, downloading...');
        }

        this.ttsDownloading = true;
        try { await this.ensureTTS(); }
        catch (err: any) { console.error('[SpeechEngine] TTS retry:', err.message); await this.ensureTTS(); }
        finally { this.ttsDownloading = false; }
    }

    async ensureTTS(): Promise<void> {
        const p = this.getTTSPath();
        if (this.ttsModel && this.currentTTSPath === p) return;
        console.log('[SpeechEngine] Loading TTS:', p);
        const localPath = await this.resolveLocalModelPath(p);
        const loadPath = localPath ?? p;
        const cb = localPath ? undefined : ((d: any) => this.emitProgress(d, 'tts'));
        try {
            this.ttsTokenizer = await AutoTokenizer.from_pretrained(loadPath, { progress_callback: cb } as any);
            this.ttsModel = await AutoModel.from_pretrained(loadPath, { quantized: true, progress_callback: cb } as any);
            this.currentTTSPath = p;
            console.log('[SpeechEngine] TTS loaded.');
        } catch (err: any) {
            console.error('[SpeechEngine] TTS load failed:', err.message);
            throw err;
        }
    }

    private async resolveLocalModelPath(modelPath: string): Promise<string | null> {
        await this.ensureCacheDir();
        const root = env.cacheDir as string;
        const slug = modelPath.replace(/\//g, '--');
        const dirs = [
            path.join(root, 'huggingface', 'hub', `models--${slug}`, 'snapshots'),
            path.join(root, slug),
            path.join(root, modelPath),
        ];
        console.log('[SpeechEngine] resolveLocalModelPath root:', root, 'modelPath:', modelPath);
        for (const d of dirs) {
            try {
                await fs.access(d);
                console.log('[SpeechEngine] resolveLocalModelPath found dir:', d);
                if (d.endsWith('snapshots')) {
                    const e = await fs.readdir(d);
                    if (e.length > 0) {
                        const resolved = path.join(d, e[0]);
                        console.log('[SpeechEngine] resolveLocalModelPath resolved snapshot:', resolved);
                        return resolved;
                    }
                }
                const f = await fs.readdir(d, { withFileTypes: true });
                const hasModelFiles = f.some(x => x.isFile() && (x.name.endsWith('.onnx') || x.name.endsWith('.json')));
                console.log('[SpeechEngine] resolveLocalModelPath files:', f.map(x => x.name), 'hasModelFiles:', hasModelFiles);
                if (hasModelFiles) return d;
            } catch { /* dir doesn't exist */ }
        }
        console.log('[SpeechEngine] resolveLocalModelPath: not found on disk');
        return null;
    }

    async testTTS(text: string): Promise<{ audio: Float32Array; sampleRate: number; modelPath: string }> {
        await this.downloadTTS();
        const { input_ids } = await this.ttsTokenizer(text);
        const spk = new Tensor('int64', BigInt64Array.from([0n]), [1]);
        const sty = new Tensor('float32', new Float32Array(256).fill(0), [1, 256]);
        const spd = new Tensor('float32', new Float32Array([1.0]), [1]);
        const out = await this.ttsModel({ input_ids, speaker: spk, style: sty, speed: spd });

        console.log('[SpeechEngine] TTS output keys:', Object.keys(out));

        // Try multiple output shapes
        let audio: Float32Array;
        if (out?.audio?.data) audio = out.audio.data;
        else if (Array.isArray(out?.audio)) audio = new Float32Array(out.audio);
        else if (out?.audio instanceof Float32Array) audio = out.audio;
        else if (out?.waveform) audio = out.waveform;
        else if (out?.data && Array.isArray(out.data)) audio = new Float32Array(out.data);
        else {
            const firstKey = Object.keys(out)[0];
            const val = (out as any)[firstKey];
            console.log(`[SpeechEngine] TTS fallback key=${firstKey}, type=${typeof val}`);
            audio = val?.data ?? new Float32Array(Array.isArray(val) ? val : [0]);
        }

        const sampleRate = out?.sample_rate ?? out?.sampling_rate ?? 24000;
        console.log(`[SpeechEngine] TTS audio: ${audio.length} samples @ ${sampleRate}Hz`);
        return { audio: Array.from(audio) as any, sampleRate, modelPath: this.getTTSPath() };
    }

    // ── STT ──────────────────────────────────────────────────────────────

    async downloadSTT(): Promise<any> {
        if (this.isSTTReady) return this.sttPipeline;
        if (this.sttDownloading) return;

        const modelPath = this.getSTTPath();
        const onDisk = await this.modelExistsOnDisk(modelPath);
        if (onDisk) {
            console.log('[SpeechEngine] STT model already on disk, loading from cache.');
        } else {
            console.log('[SpeechEngine] STT model not found on disk, downloading...');
        }

        this.sttDownloading = true;
        try { return await this.ensureSTT(); }
        catch (err: any) { console.error('[SpeechEngine] STT retry:', err.message); return await this.ensureSTT(); }
        finally { this.sttDownloading = false; }
    }

    async ensureSTT(): Promise<any> {
        const p = this.getSTTPath();
        if (this.sttPipeline && this.currentSTTPath === p) return this.sttPipeline;
        console.log('[SpeechEngine] Loading STT:', p);
        const localPath = await this.resolveLocalModelPath(p);
        const loadPath = localPath ?? p;
        const cb = localPath ? undefined : ((d: any) => this.emitProgress(d, 'stt'));
        try {
            this.sttPipeline = await pipeline('automatic-speech-recognition', loadPath, { progress_callback: cb } as any);
            this.currentSTTPath = p;
            console.log('[SpeechEngine] STT loaded.');
            return this.sttPipeline;
        } catch (err: any) {
            console.error('[SpeechEngine] STT load failed:', err.message);
            throw err;
        }
    }

    async testSTT(audio: Float32Array, sampleRate = 16000): Promise<{ text: string; modelPath: string }> {
        const pipe = await this.downloadSTT();
        // Auto-detect language — Whisper guesses language from first 30s.
        // chunk_length_s + stride_length_s enables multi-language without explicit 'language' param.
        const res = await pipe(audio, {
            sampling_rate: sampleRate,
            chunk_length_s: 30,
            stride_length_s: 5,
        });
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
