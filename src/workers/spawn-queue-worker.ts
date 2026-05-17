/**
 * Spawn Queue Worker
 * 
 * Runs in a separate thread to manage window spawn queueing.
 * Prevents main UI thread blocking from delaying spawn operations.
 */

interface SpawnRequest {
    id: string;
    options: any;
}

interface SpawnTelemetry {
    current_fps: number;
    ema_fps: number;
    pressure: number;
}

let queue: SpawnRequest[] = [];
let isProcessing = false;
let burstSpawnCount = 0;

// Runtime-adjustable spawn interval (ms between each spawn)
let baseIntervalMs = 28;
const MIN_INTERVAL_MS = 16;
const MAX_INTERVAL_MS = 160;
const TARGET_FPS = 55;
const FPS_FLOOR = 28;
const LOW_FPS_THRESHOLD = 38;
const RECOVER_FPS_THRESHOLD = 46;
const RECOVER_STREAK_REQUIRED = 4;
const POST_SPAWN_SETTLE_MS = 72;
const POST_SPAWN_EXTRA_GUARD_MS = 8;
const REQUIRED_TELEMETRY_SAMPLES_AFTER_SPAWN = 2;
const MAX_PRESPAWN_GATE_REJECTS = 8;
const FORCE_SPAWN_RELEASE_MS = 900;

let latestTelemetry: SpawnTelemetry | null = null;
let telemetryReceivedAtMs = 0;
let filteredCurrentFps = 55;
let filteredEmaFps = 55;
let lastTelemetryLogAtMs = 0;
let lowFpsProtectMode = false;
let lowFpsRecoverStreak = 0;
let lastSpawnAtMs = 0;
let telemetrySeq = 0;
let telemetrySeqAtLastSpawn = 0;
let preSpawnGateRejectCount = 0;
const telemetryCurrentFpsWindow: number[] = [];

const TELEMETRY_MIN_FPS = 12;
const TELEMETRY_MAX_FPS = 120;
const TELEMETRY_MAX_JUMP_PER_UPDATE = 18;
const TELEMETRY_EMA_ALPHA = 0.22;
const TELEMETRY_LOG_INTERVAL_MS = 220;

function nowTs(): string {
    return new Date().toISOString();
}

function logWorker(event: string, data?: Record<string, unknown>): void {
    if (data) {
        console.log(`[SpawnQueueWorker ${nowTs()}] ${event}`, data);
    } else {
        console.log(`[SpawnQueueWorker ${nowTs()}] ${event}`);
    }
}

function explainDelayReason(reason: string): string {
    const explanations: Record<string, string> = {
        'pressure>=24': 'System pressure is very high, so spawn is slowed down aggressively.',
        'pressure>=16': 'System pressure is high, so spawn is delayed to reduce frame contention.',
        'pressure>=10': 'System pressure is moderate-high, applying extra delay.',
        'pressure>=6': 'System pressure is starting to rise, applying mild delay.',
        'burst_penalty': 'Burst spawn protection is active to prevent late-sequence stutter spikes.',
        'queue_remaining>=30': 'Many windows are still pending; proactive slowdown is applied.',
        'queue_remaining>=20': 'Queue is still large; additional preventive delay is applied.',
        'queue_remaining>=10': 'Queue is moderately large; mild preventive delay is applied.',
        'protect_mode': 'Low-FPS protective mode is active until frame rate stabilizes.',
        'stale_telemetry': 'Telemetry is stale; worker waits longer as a safety fallback.',
        'post_spawn_settle': 'Waiting a short settle window after spawn so animation impact is measurable.',
        'telemetry_samples_gate': 'Waiting for enough telemetry samples after spawn before next decision.',
        'no_telemetry_after_spawn': 'No fresh telemetry after spawn yet; delaying until data becomes reliable.',
        'pre_spawn_low_fps': 'Pre-spawn guard blocked spawn because current FPS is still below safe threshold.',
        'pre_spawn_protect_mode': 'Pre-spawn guard blocked spawn because protective mode is still active.',
        'pre_spawn_stale_telemetry': 'Pre-spawn guard blocked spawn because telemetry is stale.',
        'pre_spawn_no_telemetry': 'Pre-spawn guard blocked spawn because telemetry is not available yet.',
        'pre_spawn_force_release': 'Fail-safe force release triggered so queue cannot deadlock under prolonged low FPS.',
    };

    return explanations[reason] ?? 'Adaptive delay was applied by runtime pacing logic.';
}

function getPreSpawnGateDecision(): {
    canSpawn: boolean;
    waitMs: number;
    reason?: string;
    weightedFps?: number;
    requiredFps?: number;
} {
    if (!latestTelemetry) {
        return {
            canSpawn: false,
            waitMs: 36,
            reason: 'pre_spawn_no_telemetry',
        };
    }

    const telemetryAge = performance.now() - telemetryReceivedAtMs;
    if (telemetryAge > 220) {
        return {
            canSpawn: false,
            waitMs: 56,
            reason: 'pre_spawn_stale_telemetry',
        };
    }

    const queueRemaining = queue.length;
    const weightedFps = latestTelemetry.current_fps * 0.7 + latestTelemetry.ema_fps * 0.3;
    const requiredFps = queueRemaining >= 30 ? 50 : queueRemaining >= 20 ? 48 : queueRemaining >= 10 ? 45 : 42;

    if (lowFpsProtectMode && weightedFps < RECOVER_FPS_THRESHOLD) {
        const deficit = RECOVER_FPS_THRESHOLD - weightedFps;
        const waitMs = clamp(Math.round(40 + deficit * 3.2 + queueRemaining * 0.7), 40, 160);
        return {
            canSpawn: false,
            waitMs,
            reason: 'pre_spawn_protect_mode',
            weightedFps,
            requiredFps: RECOVER_FPS_THRESHOLD,
        };
    }

    if (weightedFps < requiredFps) {
        const deficit = requiredFps - weightedFps;
        const waitMs = clamp(Math.round(28 + deficit * 2.8 + queueRemaining * 0.5), 28, 140);
        return {
            canSpawn: false,
            waitMs,
            reason: 'pre_spawn_low_fps',
            weightedFps,
            requiredFps,
        };
    }

    return {
        canSpawn: true,
        waitMs: 0,
        weightedFps,
        requiredFps,
    };
}

/**
 * Main message handler: receives spawn requests from main thread
 */
self.onmessage = (event: MessageEvent) => {
    const { type, payload } = event.data;

    if (type === 'enqueue') {
        const { id, options } = payload as SpawnRequest;
        queue.push({ id, options });
        logWorker('enqueue', { id, queueLength: queue.length, isProcessing });
        
        // Start processing if not already running
        if (!isProcessing) {
            logWorker('start_processing');
            processQueue();
        }
    } else if (type === 'cancel') {
        const { id } = payload;
        const before = queue.length;
        queue = queue.filter((req) => req.id !== id);
        logWorker('cancel', { id, queueBefore: before, queueAfter: queue.length });
    } else if (type === 'set_interval') {
        const newInterval = payload.interval_ms;
        if (typeof newInterval === 'number' && newInterval > 0) {
            const oldInterval = baseIntervalMs;
            baseIntervalMs = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.round(newInterval)));
            if (oldInterval !== baseIntervalMs) {
                logWorker('set_interval', { oldInterval, newInterval: baseIntervalMs });
            }
        }
    } else if (type === 'set_telemetry') {
        const { current_fps, ema_fps, pressure } = payload as Partial<SpawnTelemetry>;
        if (
            typeof current_fps === 'number'
            && typeof ema_fps === 'number'
            && typeof pressure === 'number'
        ) {
            const stable = stabilizeTelemetry(current_fps, ema_fps);
            latestTelemetry = {
                current_fps: stable.current,
                ema_fps: stable.ema,
                pressure,
            };
            telemetryReceivedAtMs = performance.now();
            telemetrySeq += 1;

            // Throttle logs to avoid log spam becoming its own performance source.
            if (telemetryReceivedAtMs - lastTelemetryLogAtMs >= TELEMETRY_LOG_INTERVAL_MS) {
                lastTelemetryLogAtMs = telemetryReceivedAtMs;
                logWorker('set_telemetry', {
                    currentFpsRaw: Number(current_fps.toFixed(2)),
                    emaFpsRaw: Number(ema_fps.toFixed(2)),
                    currentFpsStable: Number(stable.current.toFixed(2)),
                    emaFpsStable: Number(stable.ema.toFixed(2)),
                    pressure,
                    queueLength: queue.length,
                });
            }
        }
    }
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}

function stabilizeTelemetry(currentFpsRaw: number, emaFpsRaw: number): { current: number; ema: number } {
    const clampedCurrent = clamp(currentFpsRaw, TELEMETRY_MIN_FPS, TELEMETRY_MAX_FPS);
    const clampedEma = clamp(emaFpsRaw, TELEMETRY_MIN_FPS, TELEMETRY_MAX_FPS);

    // Limit one-sample leaps (e.g., 40 -> 12 -> 160) before further filtering.
    const delta = clampedCurrent - filteredCurrentFps;
    const limitedCurrent = filteredCurrentFps + clamp(delta, -TELEMETRY_MAX_JUMP_PER_UPDATE, TELEMETRY_MAX_JUMP_PER_UPDATE);

    // Median filter over short window to reject outliers.
    telemetryCurrentFpsWindow.push(limitedCurrent);
    if (telemetryCurrentFpsWindow.length > 5) telemetryCurrentFpsWindow.shift();
    const medianCurrent = median(telemetryCurrentFpsWindow);

    // EMA smoothing for stability without heavy lag.
    filteredCurrentFps = filteredCurrentFps * (1 - TELEMETRY_EMA_ALPHA) + medianCurrent * TELEMETRY_EMA_ALPHA;
    filteredEmaFps = filteredEmaFps * (1 - TELEMETRY_EMA_ALPHA) + clampedEma * TELEMETRY_EMA_ALPHA;

    return {
        current: filteredCurrentFps,
        ema: filteredEmaFps,
    };
}

function getAdaptiveIntervalMs(): { delay: number; reasons: string[] } {
    let interval = baseIntervalMs;
    const now = performance.now();
    const reasons: string[] = [];

    if (latestTelemetry) {
        const weightedFps = latestTelemetry.current_fps * 0.7 + latestTelemetry.ema_fps * 0.3;
        const fpsErrorRatio = clamp((TARGET_FPS - weightedFps) / (TARGET_FPS - FPS_FLOOR), 0, 1);
        const queueRemaining = queue.length;

        // Base adaptive interval from latest FPS telemetry
        interval = 20 + fpsErrorRatio * 70;

        // Pressure penalty from engine backlog (deferred writes + render queue + pending spawns)
        const pressure = latestTelemetry.pressure;
        if (pressure >= 24) {
            interval += 36;
            reasons.push('pressure>=24');
        } else if (pressure >= 16) {
            interval += 22;
            reasons.push('pressure>=16');
        } else if (pressure >= 10) {
            interval += 12;
            reasons.push('pressure>=10');
        } else if (pressure >= 6) {
            interval += 6;
            reasons.push('pressure>=6');
        }

        // Burst progress penalty: as more windows are spawned in one burst,
        // gradually postpone to avoid late-burst stutter (e.g. spawn #30-#40).
        const burstPenalty = Math.min(24, Math.floor(burstSpawnCount / 6) * 4);
        interval += burstPenalty;
        if (burstPenalty > 0) reasons.push('burst_penalty');

        // Preventive guard: if remaining queue is large, start slowing earlier
        // before FPS fully collapses.
        if (queueRemaining >= 30) {
            interval += 18;
            reasons.push('queue_remaining>=30');
        } else if (queueRemaining >= 20) {
            interval += 12;
            reasons.push('queue_remaining>=20');
        } else if (queueRemaining >= 10) {
            interval += 6;
            reasons.push('queue_remaining>=10');
        }

        // Protective mode: if FPS is low, keep delaying until it stabilizes again.
        if (weightedFps <= LOW_FPS_THRESHOLD) {
            if (!lowFpsProtectMode) {
                lowFpsProtectMode = true;
                logWorker('protect_mode_on', {
                    weightedFps: Number(weightedFps.toFixed(2)),
                    queueRemaining,
                });
            }
            lowFpsRecoverStreak = 0;
        } else if (lowFpsProtectMode) {
            if (weightedFps >= RECOVER_FPS_THRESHOLD) {
                lowFpsRecoverStreak += 1;
                if (lowFpsRecoverStreak >= RECOVER_STREAK_REQUIRED) {
                    lowFpsProtectMode = false;
                    lowFpsRecoverStreak = 0;
                    logWorker('protect_mode_off', {
                        weightedFps: Number(weightedFps.toFixed(2)),
                        queueRemaining,
                    });
                }
            } else {
                lowFpsRecoverStreak = 0;
            }
        }

        if (lowFpsProtectMode) {
            // Requested weights: current low FPS + remaining windows to spawn.
            const lowFpsSeverity = clamp((LOW_FPS_THRESHOLD - weightedFps) / (LOW_FPS_THRESHOLD - FPS_FLOOR), 0, 1);
            const remainingWeight = clamp(queueRemaining / 40, 0, 1);
            const protectPenalty =
                30
                + lowFpsSeverity * 55
                + remainingWeight * 40
                + lowFpsSeverity * remainingWeight * 35;
            interval += protectPenalty;
            reasons.push('protect_mode');
        }

        // If telemetry goes stale, fail safe to slower cadence.
        const telemetryAge = performance.now() - telemetryReceivedAtMs;
        if (telemetryAge > 180) {
            interval += Math.min(30, Math.floor((telemetryAge - 180) / 80) * 6);
            reasons.push('stale_telemetry');
        }

        // Spawn -> let animation start -> then read telemetry for next decision.
        const settleDeadline = lastSpawnAtMs + POST_SPAWN_SETTLE_MS;
        const hasFreshPostSpawnTelemetry = telemetryReceivedAtMs >= settleDeadline;
        const telemetrySamplesAfterSpawn = telemetrySeq - telemetrySeqAtLastSpawn;
        const hasEnoughTelemetrySamples = telemetrySamplesAfterSpawn >= REQUIRED_TELEMETRY_SAMPLES_AFTER_SPAWN;
        if (!hasFreshPostSpawnTelemetry) {
            const waitForSettle = Math.max(0, settleDeadline - now);
            interval = Math.max(interval, waitForSettle + POST_SPAWN_EXTRA_GUARD_MS);
            reasons.push('post_spawn_settle');
        }

        // Ensure FPS sample relevance: wait for at least N telemetry updates after spawn.
        if (!hasEnoughTelemetrySamples) {
            const missingSamples = REQUIRED_TELEMETRY_SAMPLES_AFTER_SPAWN - telemetrySamplesAfterSpawn;
            interval = Math.max(interval, 28 + missingSamples * 22);
            reasons.push('telemetry_samples_gate');
        }
    } else if (lastSpawnAtMs > 0) {
        // No telemetry yet after spawn: always wait at least settle window.
        const settleDeadline = lastSpawnAtMs + POST_SPAWN_SETTLE_MS;
        const waitForSettle = Math.max(0, settleDeadline - now);
        interval = Math.max(interval, waitForSettle + POST_SPAWN_EXTRA_GUARD_MS);
        reasons.push('no_telemetry_after_spawn');
    }

    return {
        delay: clamp(Math.round(interval), MIN_INTERVAL_MS, MAX_INTERVAL_MS),
        reasons,
    };
}

/**
 * Process spawn queue at controlled intervals
 * Tells main thread to spawn one window at a time
 */
function processQueue() {
    if (queue.length === 0) {
        isProcessing = false;
        burstSpawnCount = 0;
        lowFpsProtectMode = false;
        lowFpsRecoverStreak = 0;
        lastSpawnAtMs = 0;
        telemetrySeqAtLastSpawn = telemetrySeq;
        preSpawnGateRejectCount = 0;
        logWorker('idle');
        return;
    }

    isProcessing = true;

    // Pre-spawn gate: decide BEFORE emitting spawn event.
    // If FPS/telemetry conditions are not safe, postpone and re-check.
    const gate = getPreSpawnGateDecision();
    const now = performance.now();
    const timeSinceLastSpawn = lastSpawnAtMs > 0 ? now - lastSpawnAtMs : Number.POSITIVE_INFINITY;
    const canForceRelease =
        burstSpawnCount === 0
        || preSpawnGateRejectCount >= MAX_PRESPAWN_GATE_REJECTS
        || timeSinceLastSpawn >= FORCE_SPAWN_RELEASE_MS;

    if (!gate.canSpawn && !canForceRelease) {
        preSpawnGateRejectCount += 1;
        const reason = gate.reason ?? 'pre_spawn_low_fps';
        logWorker('delay_applied', {
            nextDelay: gate.waitMs,
            reasons: [reason],
            reasonDetails: [{
                reason,
                explanation: explainDelayReason(reason),
            }],
            queueLength: queue.length,
            burstSpawnCount,
            protectMode: lowFpsProtectMode,
            weightedFps: gate.weightedFps !== undefined ? Number(gate.weightedFps.toFixed(2)) : null,
            requiredFps: gate.requiredFps ?? null,
            phase: 'pre_spawn_gate',
            gateRejectCount: preSpawnGateRejectCount,
        });

        setTimeout(() => {
            processQueue();
        }, gate.waitMs);
        return;
    }

    if (!gate.canSpawn && canForceRelease) {
        logWorker('delay_applied', {
            nextDelay: 0,
            reasons: ['pre_spawn_force_release'],
            reasonDetails: [{
                reason: 'pre_spawn_force_release',
                explanation: explainDelayReason('pre_spawn_force_release'),
            }],
            queueLength: queue.length,
            burstSpawnCount,
            protectMode: lowFpsProtectMode,
            weightedFps: gate.weightedFps !== undefined ? Number(gate.weightedFps.toFixed(2)) : null,
            requiredFps: gate.requiredFps ?? null,
            phase: 'pre_spawn_gate',
            gateRejectCount: preSpawnGateRejectCount,
            timeSinceLastSpawn: Number.isFinite(timeSinceLastSpawn) ? Number(timeSinceLastSpawn.toFixed(1)) : null,
        });
    }

    preSpawnGateRejectCount = 0;

    const request = queue.shift();

    if (request) {
        // Tell main thread to spawn this window
        self.postMessage({
            type: 'spawn',
            payload: {
                id: request.id,
                options: request.options,
            },
        });
        lastSpawnAtMs = performance.now();
        telemetrySeqAtLastSpawn = telemetrySeq;
        burstSpawnCount += 1;
        logWorker('spawn', {
            id: request.id,
            burstSpawnCount,
            queueRemaining: queue.length,
        });
    }

    // Schedule next spawn
    const { delay: nextDelay, reasons: delayReasons } = getAdaptiveIntervalMs();
    if (delayReasons.length > 0) {
        const uniqueReasons = Array.from(new Set(delayReasons));
        logWorker('delay_applied', {
            nextDelay,
            reasons: uniqueReasons,
            reasonDetails: uniqueReasons.map((reason) => ({
                reason,
                explanation: explainDelayReason(reason),
            })),
            queueLength: queue.length,
            burstSpawnCount,
            protectMode: lowFpsProtectMode,
        });
    }
    logWorker('schedule_next', {
        nextDelay,
        queueLength: queue.length,
        burstSpawnCount,
        protectMode: lowFpsProtectMode,
        recoverStreak: lowFpsRecoverStreak,
        telemetryAgeMs: Number((performance.now() - telemetryReceivedAtMs).toFixed(1)),
    });
    setTimeout(() => {
        processQueue();
    }, nextDelay);
}
