import { useState, useRef, useEffect, useCallback } from 'react';
import { Volume2, Mic, Play, Square, Loader, Download } from 'lucide-react';

import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { ConfigField } from './config-field';
import { DefaultConfigSpeech } from '#/shared/constants/config';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import { EventBus } from '#/shared/engines/event-engine';
import { AudioWaveform } from './audio-waveform';
import type { InferConfigData } from '#/shared/schemas/config';

type SpeechSectionProps = {
    config: InferConfigData<typeof DefaultConfigSpeech> | undefined;
    schema: Record<string, import('zod').ZodTypeAny>;
};

export function SystemSettingsSpeechSection({ config, schema }: SpeechSectionProps) {
    const { targets } = useAceTheme();

    // ── Download state ──
    const [ttsDownloading, setTtsDownloading] = useState(false);
    const [sttDownloading, setSttDownloading] = useState(false);
    const [ttsProgress, setTtsProgress] = useState<any>(null);
    const [sttProgress, setSttProgress] = useState<any>(null);

    useEffect(() => {
        const u1 = EventBus.listen('speech:tts-progress', (ctx: any) => {
            setTtsProgress(ctx.payload);
            if (ctx.payload.status === 'done') setTtsDownloading(false);
        });
        const u2 = EventBus.listen('speech:stt-progress', (ctx: any) => {
            setSttProgress(ctx.payload);
            if (ctx.payload.status === 'done') setSttDownloading(false);
        });
        return () => { u1(); u2(); };
    }, []);

    const handleDownloadTTS = useCallback(async () => {
        setTtsDownloading(true);
        setTtsProgress(null);
        try {
            await RPCEngine.invoke('speech.downloadTTS', {}, { timeoutMs: 600000 });
        } catch (err: any) {
            setTtsError(err?.message ?? 'TTS download failed');
        } finally {
            setTtsDownloading(false);
        }
    }, []);

    const handleDownloadSTT = useCallback(async () => {
        setSttDownloading(true);
        setSttProgress(null);
        try {
            await RPCEngine.invoke('speech.downloadSTT', {}, { timeoutMs: 600000 });
        } catch (err: any) {
            setSttError(err?.message ?? 'STT download failed');
        } finally {
            setSttDownloading(false);
        }
    }, []);

    // ── TTS state ──
    const [ttsText, setTtsText] = useState('Hello, this is a test of the text-to-speech engine.');
    const [ttsTesting, setTtsTesting] = useState(false);
    const [ttsError, setTtsError] = useState<string | null>(null);
    const [ttsModel, setTtsModel] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const handleTestTTS = async () => {
        setTtsTesting(true);
        setTtsError(null);
        setTtsModel(null);
        try {
            const { audio, sampleRate, modelPath } = await RPCEngine.invoke('speech.testTTS', { text: ttsText }, { timeoutMs: 120000 }) as any;
            setTtsModel(modelPath);

            // audio from RPC is number[], convert back
            const wav = float32ToWav(new Float32Array(audio as any), sampleRate);
            const blob = new Blob([wav], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            if (audioRef.current) {
                audioRef.current.pause();
                URL.revokeObjectURL(audioRef.current.src);
            }

            const a = new Audio(url);
            audioRef.current = a;
            a.play();
        } catch (err: any) {
            setTtsError(err?.message ?? 'TTS test failed');
        } finally {
            setTtsTesting(false);
        }
    };

    const handleStopTTS = () => {
        audioRef.current?.pause();
        audioRef.current = null;
    };

    // ── STT state ──
    const [sttTesting, setSttTesting] = useState(false);
    const [sttResult, setSttResult] = useState<string | null>(null);
    const [sttError, setSttError] = useState<string | null>(null);
    const [sttModel, setSttModel] = useState<string | null>(null);
    const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    // ── Voice test (mic only, no LLM) ──
    const [voiceTesting, setVoiceTesting] = useState(false);
    const [voiceAudioUrl, setVoiceAudioUrl] = useState<string | null>(null);

    const handleVoiceTest = async () => {
        setVoiceTesting(true);
        setVoiceAudioUrl(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            const chunks: Blob[] = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };
            mediaRecorder.onstop = () => {
                stream.getTracks().forEach((t) => t.stop());
                const blob = new Blob(chunks, { type: 'audio/webm' });
                setVoiceAudioUrl(URL.createObjectURL(blob));
            };

            mediaRecorder.start();
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') mediaRecorder.stop();
                setVoiceTesting(false);
            }, 3000);
        } catch { setVoiceTesting(false); }
    };

    const handleTestSTT = async () => {
        setSttTesting(true);
        setSttError(null);
        setSttResult(null);
        setSttModel(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach((t) => t.stop());
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                setRecordedAudioUrl(URL.createObjectURL(blob));

                try {
                    // Decode audio to Float32Array
                    const arrayBuffer = await blob.arrayBuffer();
                    const audioCtx = new AudioContext({ sampleRate: 16000 });
                    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

                    // Convert to mono Float32Array at 16kHz
                    const mono = audioBuffer.getChannelData(0);
                    const resampled = resampleAudio(mono, audioBuffer.sampleRate, 16000);

                    const { text, modelPath } = await RPCEngine.invoke('speech.testSTT', {
                        audio: Array.from(resampled),
                        sampleRate: 16000,
                    }, { timeoutMs: 120000 }) as any;
                    setSttResult(text);
                    setSttModel(modelPath);
                } catch (err: any) {
                    setSttError(err?.message ?? 'STT transcription failed');
                } finally {
                    setSttTesting(false);
                }
            };

            mediaRecorder.start();
            // Record for 3 seconds
            setTimeout(() => {
                if (mediaRecorderRef.current?.state === 'recording') {
                    mediaRecorderRef.current.stop();
                }
            }, 3000);
        } catch (err: any) {
            setSttError(err?.message ?? 'STT microphone access failed');
            setSttTesting(false);
        }
    };

    return (
        <section className={[targets.shell.first, 'rounded-2xl p-4 flex flex-col gap-4 border-none'].join(' ')}>
            <div className="flex items-start gap-3">
                <div className={[targets.btn.secondary, 'rounded-2xl p-3'].join(' ')}>
                    <Volume2 size={18} />
                </div>
                <div>
                    <div className="text-lg font-semibold">Speech</div>
                    <div className="mt-1 text-sm leading-6">
                        Configure Text-to-Speech (TTS) and Speech-to-Text (STT) ONNX models.
                        Test each engine below.
                    </div>
                </div>
            </div>

            {/* Model Configuration */}
            {Object.entries(schema).map(([key, fieldSchema]) => (
                <ConfigField
                    key={key}
                    storageKey="speech"
                    configKey={key}
                    schema={fieldSchema}
                    value={config?.[key]}
                />
            ))}

            {/* ── Model Download ── */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <Download size={14} className="text-zinc-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        Model Download
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex-1">
                        <button
                            className={[targets.btn.secondary, 'w-full px-3 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5'].join(' ')}
                            onClick={handleDownloadTTS}
                            disabled={ttsDownloading}
                        >
                            {ttsDownloading ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
                            {ttsDownloading ? 'Downloading TTS...' : 'Download TTS Model'}
                        </button>
                        {ttsProgress?.status === 'downloading' && (
                            <div className="mt-1">
                                <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${ttsProgress.progress}%` }} />
                                </div>
                                <div className="text-[9px] text-zinc-500 mt-0.5">{ttsProgress.progress}%</div>
                            </div>
                        )}
                        {ttsProgress?.status === 'done' && (
                            <div className="text-[10px] text-emerald-400 mt-1">TTS model ready</div>
                        )}
                    </div>
                    <div className="flex-1">
                        <button
                            className={[targets.btn.secondary, 'w-full px-3 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5'].join(' ')}
                            onClick={handleDownloadSTT}
                            disabled={sttDownloading}
                        >
                            {sttDownloading ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
                            {sttDownloading ? 'Downloading STT...' : 'Download STT Model'}
                        </button>
                        {sttProgress?.status === 'downloading' && (
                            <div className="mt-1">
                                <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${sttProgress.progress}%` }} />
                                </div>
                                <div className="text-[9px] text-zinc-500 mt-0.5">{sttProgress.progress}%</div>
                            </div>
                        )}
                        {sttProgress?.status === 'done' && (
                            <div className="text-[10px] text-blue-400 mt-1">STT model ready</div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── TTS Test ── */}
            <div className={[targets.shell.first, 'rounded-xl p-3 border border-zinc-700/30'].join(' ')}>
                <div className="flex items-center gap-2 mb-2">
                    <Play size={14} className="text-emerald-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        Text-to-Speech Test
                    </span>
                </div>
                <textarea
                    className="w-full bg-zinc-800/50 rounded-lg p-2 text-sm text-zinc-200 border border-zinc-700/30 resize-none"
                    rows={2}
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    disabled={ttsTesting}
                />
                <div className="flex items-center gap-2 mt-2">
                    <button
                        className={[targets.btn.first, 'px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5'].join(' ')}
                        onClick={handleTestTTS}
                        disabled={ttsTesting}
                    >
                        {ttsTesting ? (
                            <Loader size={12} className="animate-spin" />
                        ) : (
                            <Play size={12} />
                        )}
                        {ttsTesting ? 'Generating...' : 'Test TTS'}
                    </button>
                    <button
                        className={[targets.btn.secondary, 'px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5'].join(' ')}
                        onClick={handleStopTTS}
                    >
                        <Square size={12} />
                        Stop
                    </button>
                </div>
                {ttsModel && (
                    <div className="mt-2 text-[10px] text-emerald-400/70">Model: {ttsModel}</div>
                )}
                {ttsError && (
                    <div className="mt-2 text-[10px] text-red-400">{ttsError}</div>
                )}
            </div>

            {/* ── STT Test ── */}
            <div className={[targets.shell.first, 'rounded-xl p-3 border border-zinc-700/30'].join(' ')}>
                <div className="flex items-center gap-2 mb-2">
                    <Mic size={14} className="text-blue-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        Speech-to-Text Test
                    </span>
                </div>
                <p className="text-xs text-zinc-500 mb-2">
                    Click "Record" and speak for 3 seconds. Your speech will be transcribed.
                </p>
                <button
                    className={[targets.btn.first, 'px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5'].join(' ')}
                    onClick={handleTestSTT}
                    disabled={sttTesting}
                >
                    {sttTesting ? (
                        <>
                            <Loader size={12} className="animate-spin" />
                            Recording...
                        </>
                    ) : (
                        <>
                            <Mic size={12} />
                            Record
                        </>
                    )}
                </button>
                {sttResult && (
                    <div className="mt-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                        <div className="text-xs text-blue-300">{sttResult}</div>
                        {sttModel && (
                            <div className="mt-1 text-[10px] text-blue-400/50">Model: {sttModel}</div>
                        )}
                    </div>
                )}
                {sttError && (
                    <div className="mt-2 text-[10px] text-red-400">{sttError}</div>
                )}
                {recordedAudioUrl && (
                    <div className="mt-2">
                        <div className="text-[10px] text-zinc-500 mb-1">Recorded audio:</div>
                        <AudioWaveform src={recordedAudioUrl} color="rgba(59, 130, 246, 0.6)" />
                        <audio controls className="w-full h-6 mt-1" src={recordedAudioUrl} />
                    </div>
                )}
            </div>

            {/* ── Voice Test (Mic Only) ── */}
            <div className={[targets.shell.first, 'rounded-xl p-3 border border-zinc-700/30'].join(' ')}>
                <div className="flex items-center gap-2 mb-2">
                    <Mic size={14} className="text-amber-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        Voice Test — Mic Check
                    </span>
                </div>
                <p className="text-xs text-zinc-500 mb-2">
                    Test your microphone without using any AI model. Record and playback.
                </p>
                <button
                    className={[targets.btn.secondary, 'px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5'].join(' ')}
                    onClick={handleVoiceTest}
                    disabled={voiceTesting}
                >
                    {voiceTesting ? <><Loader size={12} className="animate-spin" /> Recording 3s...</> : <><Mic size={12} /> Record 3s</>}
                </button>
                {voiceAudioUrl && (
                    <div className="mt-2">
                        <AudioWaveform src={voiceAudioUrl} color="rgba(245, 158, 11, 0.6)" />
                        <audio controls className="w-full h-6 mt-1" src={voiceAudioUrl} />
                    </div>
                )}
            </div>
        </section>
    );
}

// ── Audio helpers ──────────────────────────────────────────────────────────

function float32ToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = samples.length * (bitsPerSample / 8);
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
    }

    return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

function resampleAudio(
    audio: Float32Array,
    fromRate: number,
    toRate: number,
): Float32Array {
    if (fromRate === toRate) return audio;
    const ratio = fromRate / toRate;
    const newLength = Math.round(audio.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
        const srcIndex = i * ratio;
        const srcFloor = Math.floor(srcIndex);
        const srcCeil = Math.min(srcFloor + 1, audio.length - 1);
        const t = srcIndex - srcFloor;
        result[i] = audio[srcFloor] * (1 - t) + audio[srcCeil] * t;
    }
    return result;
}
