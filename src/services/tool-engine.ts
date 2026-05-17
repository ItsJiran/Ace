import { RegistryEngine } from './registry-engine';
import { KernelEngine } from './kernel-engine';
import { EventBus } from '#/services/event-engine';
import type { ToolDefinition } from '#/schemas/tooling';
import { PARSER_RUNTIME_EVENT } from '#/schemas/parser-event-names';
import type { CoreEngineHandlerArgs } from '#/schemas/events';
import type { AIContextEntry, AISessionRuntime } from '#/schemas/ai';

export interface ToolManifestEntry {
    slug: string;
    name: string;
    description: string;
    packageRef: string;
    parameters?: Record<string, unknown>;
}

interface ToolActionPayload {
    package_ref?: string;
    tool_slug?: string;
    result_memory_uid?: string;
    memory_uid?: string;
    session_id?: string;
    [k: string]: unknown;
}

type HandlerLifecycleEventName =
    | typeof PARSER_RUNTIME_EVENT.HANDLER_DISPATCH
    | typeof PARSER_RUNTIME_EVENT.HANDLER_STARTED
    | typeof PARSER_RUNTIME_EVENT.HANDLER_RESULT
    | typeof PARSER_RUNTIME_EVENT.HANDLER_ERROR;

class ToolEngineSingleton {
    private isRouteBound = false;

    private async runRouteProcess<T>(input: {
        routeType: string;
        sourceProcessUid?: string;
        metadata?: Record<string, unknown>;
        payload?: Record<string, unknown>;
        run: (processUid: string) => Promise<T>;
    }): Promise<T> {
        const { routeType, sourceProcessUid, metadata, run } = input;
        const proc = sourceProcessUid
            ? KernelEngine.spawnSubprocess(sourceProcessUid, routeType, {
                metadata: { ...(metadata || {}), source_process_uid: sourceProcessUid },
                process_kind: 'tool_run',
                owner_engine: 'tool-engine',
            })
            : KernelEngine.spawnProcess(routeType, metadata || {}, {
                process_kind: 'tool_run',
                owner_engine: 'tool-engine',
            });
        try {
            const result = await run(proc.process_uid);
            KernelEngine.updateProcessStatus(proc.process_uid, 'done');
            return result;
        } catch (err) {
            KernelEngine.updateProcessStatus(proc.process_uid, 'failed');
            throw err;
        }
    }

    private writeToolResultMemory(input: {
        processUid?: string;
        resultMemoryUid?: string;
        payload: Record<string, unknown>;
    }) {
        const { processUid, resultMemoryUid, payload } = input;
        if (!resultMemoryUid) return;

        if (processUid) {
            const created = KernelEngine.createRuntimeMemory({
                owner_process_uid: processUid,
                memory_uid: resultMemoryUid,
                payload,
                memory_scope: 'session',
                retention_policy: 'keep_on_done',
            });

            if (!created) {
                KernelEngine.updateRuntimeMemory({
                    owner_process_uid: processUid,
                    memory_uid: resultMemoryUid,
                    payload,
                });
            }
            return;
        }

        KernelEngine.writeMemory(resultMemoryUid, payload);
    }

    private buildToolMemoryEnvelope(input: {
        status: 'ok' | 'error';
        action: 'list' | 'view_schema' | 'execute';
        packageRef?: string;
        toolSlug?: string;
        resultMemoryUid?: string;
        sessionId?: string;
        data: Record<string, unknown>;
    }) {
        const {
            status,
            action,
            packageRef,
            toolSlug,
            resultMemoryUid,
            sessionId,
            data,
        } = input;

        const at = Date.now();
        const eventName = status === 'error'
            ? PARSER_RUNTIME_EVENT.HANDLER_ERROR
            : PARSER_RUNTIME_EVENT.HANDLER_RESULT;

        return {
            // Keep critical fields mirrored at top-level for route consumers.
            status,
            action,
            package_ref: packageRef,
            tool_slug: toolSlug,
            result_memory_uid: resultMemoryUid,
            finished_at: at,
            ...data,

            // Source-aware envelope (package + handler + payload only).
            payload: data,
            schema_ref: `itsjiran/ace-system:tools:runtime:${action}:result`,
            schema_version: '1.0.0',
            schema_kind: 'json_schema',
            validation_status: 'validated',
            validated_at: at,
            source: {
                package_ref: packageRef,
                handler_ref: `tool:${action}:${packageRef || 'unknown'}:${toolSlug || 'n/a'}`,
                parsed_tag: 'tool',
                action,
                event_name: eventName,
                result_memory_uid: resultMemoryUid,
                session_id: sessionId,
                at,
            },
        };
    }

    private resolveResultKey(raw: ToolActionPayload, preallocated_memory?: Record<string, unknown>): string | undefined {
        return typeof preallocated_memory?.reply_to_ram_key === 'string'
            ? preallocated_memory.reply_to_ram_key
            : typeof raw.result_memory_uid === 'string'
                ? raw.result_memory_uid
                : typeof raw.memory_uid === 'string'
                    ? raw.memory_uid
                    : undefined;
    }

    private publishToolActionResult(input: {
        process_uid: string;
        sessionId?: string;
        eventName: HandlerLifecycleEventName;
        payload: Record<string, unknown>;
    }) {
        const { process_uid, sessionId, eventName, payload } = input;
        if (!sessionId) return;

        EventBus.emit({
            event_type: 'interaction',
            action: 'parser_result',
            sub_action: 'session',
            process_uid,
            payload: {
                session_id: sessionId,
                parsed_tag: 'tool',
                block_slug: 'tool',
                at: Date.now(),
                event_name: eventName,
                ...payload,
            },
        });
    }

    private publishToolActionStarted(input: {
        process_uid: string;
        sessionId?: string;
        action: 'list' | 'view_schema' | 'execute';
        payload: Record<string, unknown>;
    }) {
        this.publishToolActionResult({
            process_uid: input.process_uid,
            sessionId: input.sessionId,
            eventName: PARSER_RUNTIME_EVENT.HANDLER_STARTED,
            payload: {
                action: input.action,
                ...input.payload,
            },
        });
    }

    private appendSessionToolArtifacts(input: {
        sessionId?: string;
        requestId?: string;
        packageRef?: string;
        toolSlug?: string;
        action: 'execute';
        status: 'ok' | 'error';
        resultMemoryUid?: string;
        result?: unknown;
        errorMessage?: string;
    }) {
        const { sessionId, requestId, packageRef, toolSlug, action, status, resultMemoryUid, result, errorMessage } = input;
        if (!sessionId) return;

        const sessionState = KernelEngine.readMemory(`system:ai_session:${sessionId}:state`) as AISessionRuntime | undefined;
        if (!sessionState) return;

        const toolLabel = [packageRef, toolSlug].filter(Boolean).join('/') || toolSlug || 'tool';
        const rawPayload = {
            status,
            action,
            request_id: requestId,
            package_ref: packageRef,
            tool_slug: toolSlug,
            result_memory_uid: resultMemoryUid,
            result,
            error_message: errorMessage,
        };
        const summary = this.summarizeToolArtifact(rawPayload);
        const now = Date.now();
        const contextEntry: AIContextEntry = {
            at: now,
            title: `${toolLabel} · ${action}`,
            content: summary,
            status: 'active',
            lifecycle_turn: sessionState.turn_index,
            source: 'tool-engine',
            mirrored_at: now,
            payload: rawPayload,
        };
        const nextContextRecords = resultMemoryUid
            ? [
                ...(sessionState.context_records ?? []).filter((entry) => entry.payload?.result_memory_uid !== resultMemoryUid),
                contextEntry,
            ]
            : [...(sessionState.context_records ?? []), contextEntry];

        KernelEngine.updateMemory(`system:ai_session:${sessionId}:state`, {
            context_records: nextContextRecords,
        } as Partial<AISessionRuntime>);
    }

    private summarizeToolArtifact(payload: {
        status: 'ok' | 'error';
        action: 'execute';
        package_ref?: string;
        tool_slug?: string;
        result?: unknown;
        error_message?: string;
    }): string {
        if (payload.status === 'error') {
            return payload.error_message || 'Tool execution failed.';
        }

        const result = payload.result && typeof payload.result === 'object' && !Array.isArray(payload.result)
            ? payload.result as Record<string, unknown>
            : {};

        if (typeof result.summary === 'string' && result.summary.trim()) {
            return result.summary.trim();
        }

        if (typeof result.message === 'string' && result.message.trim()) {
            return result.message.trim();
        }

        if (typeof result.stdout === 'string' && result.stdout.trim()) {
            return result.stdout.trim().split('\n')[0] ?? 'Tool execution completed.';
        }

        if (typeof result.path === 'string' && typeof result.action === 'string') {
            return `${result.action} on ${result.path}`;
        }

        return 'Tool execution completed.';
    }

    /**
     * Retrieve a specific tool definition from the registry.
     * Wraps RegistryEngine.getDomainEntry with 'tools' domain preset.
     */
    getRegistry({ packageRef, slug }: { packageRef: string; slug: string }) {
        return RegistryEngine.getDomainEntry(packageRef, 'tools', slug);
    }

    /**
     * Validates raw parameters against a tool's Zod schema.
     */
    validate(packageRef: string, toolName: string, parameters: unknown) {
        const result = this.getRegistry({ packageRef, slug: toolName });
        
        if (!result || !result.entry) {
            throw new Error(`ToolEngine: Tool "${packageRef}/${toolName}" not found in Registry.`);
        }

        const toolDef = result.entry.implementation as ToolDefinition<any>;
        
        if (!toolDef || !toolDef.schema) {
               throw new Error(`ToolEngine: Invalid tool implementation for "${packageRef}/${toolName}". Missing schema.`);
        }

        const parseResult = toolDef.schema.safeParse(parameters);
        if (!parseResult.success) {
            throw new Error(`ToolEngine: Validation failed for "${packageRef}/${toolName}": ${parseResult.error.message}`);
        }

        return parseResult.data;
    }

    /**
     * Returns all registered tools across all packages with full metadata.
     */
    getAll(): ToolManifestEntry[] {
        const packages = RegistryEngine.getPackages();
        const tools: ToolManifestEntry[] = [];
        for (const pkg of packages) {
            const domain = pkg.domains.tools;
            if (!domain) continue;
            for (const [slug, entry] of Object.entries(domain)) {
                const e = entry as any;
                const meta = e?.metadata ?? {};
                const impl = e?.implementation as ToolDefinition<any> | undefined;
                tools.push({
                    slug,
                    name: meta.name ?? slug,
                    description: impl?.description ?? meta.description ?? '',
                    packageRef: pkg.manifest.package_name,
                    parameters: meta.parameters,
                });
            }
        }
        return tools;
    }

    /**
     * Returns all registered tools for AI inspection.
     * @deprecated use getAll() for full metadata
     */
    getManifest() {
        return this.getAll().map(t => ({ name: t.slug, packageName: t.packageRef }));
    }

    /**
     * Execute a registered tool as a tracked process.
     * Creates a ProcessEngine record, validates, runs the handler.
     * payload is the raw (unvalidated) input from the caller.
     */
    async execute(
        packageRef: string,
        toolSlug: string,
        payload: unknown,
        options?: { origin_window_uid?: string; origin_widget_uid?: string; parent_process_uid?: string }
    ): Promise<unknown> {
        const validatedArgs = this.validate(packageRef, toolSlug, payload);

        const result = RegistryEngine.getDomainEntry(packageRef, 'tools', toolSlug);
        if (!result?.entry) throw new Error(`ToolEngine: tool "${packageRef}/${toolSlug}" not found.`);

        const toolDef = result.entry.implementation as ToolDefinition<any>;

        const proc = options?.parent_process_uid
            ? KernelEngine.spawnSubprocess(options.parent_process_uid, `tool:${packageRef}:${toolSlug}`, {
                metadata: { packageRef, toolSlug },
                process_kind: 'tool_run',
                owner_engine: 'tool-engine',
            })
            : KernelEngine.spawnProcess(`tool:${packageRef}:${toolSlug}`, { packageRef, toolSlug }, {
                process_kind: 'tool_run',
                owner_engine: 'tool-engine',
            });
        try {
            const result = await toolDef.handler(validatedArgs, proc.process_uid);
            KernelEngine.updateProcessStatus(proc.process_uid, 'done');
            return result;
        } catch (err) {
            KernelEngine.updateProcessStatus(proc.process_uid, 'failed');
            throw err;
        }
    }

    registerEventRoutes() {
        if (this.isRouteBound) return;

        EventBus.registerProcessRoute('tool:list', async ({ payload, preallocated_memory, source }: CoreEngineHandlerArgs<Record<string, unknown>>) => {
            const raw = (payload ?? {}) as ToolActionPayload;
            const resultKey = this.resolveResultKey(raw, preallocated_memory);
            const sessionId = typeof preallocated_memory?.session_id === 'string' ? preallocated_memory.session_id : undefined;
            const sourceProcessUid = typeof source?.process_uid === 'string' ? source.process_uid : undefined;

            await this.runRouteProcess({
                routeType: 'tool_route:list',
                sourceProcessUid,
                metadata: {
                    session_id: sessionId,
                    result_memory_uid: resultKey,
                },
                payload: {
                    action: 'list',
                },
                run: async (process_uid) => {
                    this.publishToolActionStarted({
                        process_uid,
                        sessionId,
                        action: 'list',
                        payload: {
                            result_memory_uid: resultKey,
                        },
                    });

                    const tools = this.getAll();
                    if (resultKey) {
                        this.writeToolResultMemory({
                            processUid: process_uid,
                            resultMemoryUid: resultKey,
                            payload: this.buildToolMemoryEnvelope({
                                status: 'ok',
                                action: 'list',
                                resultMemoryUid: resultKey,
                                sessionId,
                                data: {
                                    tools,
                                    total: tools.length,
                                },
                            }),
                        });
                    }

                    this.publishToolActionResult({
                        process_uid,
                        sessionId,
                        eventName: PARSER_RUNTIME_EVENT.HANDLER_RESULT,
                        payload: {
                            action: 'list',
                            result_memory_uid: resultKey,
                            total: tools.length,
                            tools,
                        },
                    });

                    KernelEngine.updateProcessPayload(process_uid, {
                        status: 'done',
                        action: 'list',
                        total: tools.length,
                        updated_at: Date.now(),
                    });
                },
            });
        });

        EventBus.registerProcessRoute('tool:view_schema', async ({ payload, preallocated_memory, source }: CoreEngineHandlerArgs<Record<string, unknown>>) => {
            const raw = (payload ?? {}) as ToolActionPayload;
            const package_ref = typeof raw.package_ref === 'string' ? raw.package_ref : '';
            const tool_slug = typeof raw.tool_slug === 'string' ? raw.tool_slug : '';
            const sessionId = typeof preallocated_memory?.session_id === 'string' ? preallocated_memory.session_id : undefined;
            const resultKey = this.resolveResultKey(raw, preallocated_memory);
            const sourceProcessUid = typeof source?.process_uid === 'string' ? source.process_uid : undefined;

            await this.runRouteProcess({
                routeType: 'tool_route:view_schema',
                sourceProcessUid,
                metadata: {
                    session_id: sessionId,
                    package_ref,
                    tool_slug,
                    result_memory_uid: resultKey,
                },
                payload: {
                    action: 'view_schema',
                    package_ref,
                    tool_slug,
                },
                run: async (process_uid) => {
                    this.publishToolActionStarted({
                        process_uid,
                        sessionId,
                        action: 'view_schema',
                        payload: {
                            package_ref,
                            tool_slug,
                            result_memory_uid: resultKey,
                        },
                    });

                    if (!package_ref || !tool_slug) {
                        this.publishToolActionResult({
                            process_uid,
                            sessionId,
                            eventName: PARSER_RUNTIME_EVENT.HANDLER_ERROR,
                            payload: {
                                action: 'view_schema',
                                package_ref,
                                tool_slug,
                                error_message: 'Missing package_ref or tool_slug.',
                            },
                        });
                        KernelEngine.updateProcessPayload(process_uid, {
                            status: 'failed',
                            error_message: 'Missing package_ref or tool_slug.',
                            updated_at: Date.now(),
                        });
                        return;
                    }

                    const result = this.getRegistry({ packageRef: package_ref, slug: tool_slug });
                    const entry = result?.entry as any;
                    const toolSchema = entry?.metadata?.parameters ?? undefined;
                    const description = entry?.implementation?.description ?? entry?.metadata?.description ?? '';

                    if (resultKey) {
                        this.writeToolResultMemory({
                            processUid: process_uid,
                            resultMemoryUid: resultKey,
                            payload: this.buildToolMemoryEnvelope({
                                status: result?.entry ? 'ok' : 'error',
                                action: 'view_schema',
                                packageRef: package_ref,
                                toolSlug: tool_slug,
                                resultMemoryUid: resultKey,
                                sessionId,
                                data: {
                                    schema: toolSchema,
                                    description,
                                    error_message: result?.entry ? undefined : `Tool ${package_ref}/${tool_slug} not found.`,
                                },
                            }),
                        });
                    }

                    this.publishToolActionResult({
                        process_uid,
                        sessionId,
                        eventName: result?.entry ? PARSER_RUNTIME_EVENT.HANDLER_RESULT : PARSER_RUNTIME_EVENT.HANDLER_ERROR,
                        payload: {
                            action: 'view_schema',
                            package_ref,
                            tool_slug,
                            result_memory_uid: resultKey,
                            schema: toolSchema,
                            description,
                            error_message: result?.entry ? undefined : `Tool ${package_ref}/${tool_slug} not found.`,
                        },
                    });

                    KernelEngine.updateProcessPayload(process_uid, {
                        status: result?.entry ? 'done' : 'failed',
                        action: 'view_schema',
                        updated_at: Date.now(),
                    });
                },
            });
        });

        EventBus.registerProcessRoute('tool:execute', async ({ payload, preallocated_memory, source }: CoreEngineHandlerArgs<Record<string, unknown>>) => {
            const raw = (payload ?? {}) as ToolActionPayload;
            const package_ref = typeof raw.package_ref === 'string' ? raw.package_ref : '';
            const tool_slug = typeof raw.tool_slug === 'string' ? raw.tool_slug : '';
            const sessionId = typeof preallocated_memory?.session_id === 'string' ? preallocated_memory.session_id : undefined;
            const resultKey = this.resolveResultKey(raw, preallocated_memory);
            const sourceProcessUid = typeof source?.process_uid === 'string' ? source.process_uid : undefined;

            const nestedPayload =
                raw.payload && typeof raw.payload === 'object'
                    ? raw.payload
                    : raw.input && typeof raw.input === 'object'
                        ? raw.input
                        : undefined;

            const toolPayload = nestedPayload ?? Object.fromEntries(
                Object.entries(raw).filter(([k]) => !['package_ref', 'tool_slug', 'result_memory_uid', 'memory_uid', 'session_id', 'status', 'action', 'payload', 'input'].includes(k)),
            );

            await this.runRouteProcess({
                routeType: 'tool_route:execute',
                sourceProcessUid,
                metadata: {
                    session_id: sessionId,
                    package_ref,
                    tool_slug,
                    result_memory_uid: resultKey,
                },
                payload: {
                    action: 'execute',
                    package_ref,
                    tool_slug,
                },
                run: async (routeProcessUid) => {
                    this.publishToolActionStarted({
                        process_uid: routeProcessUid,
                        sessionId,
                        action: 'execute',
                        payload: {
                            package_ref,
                            tool_slug,
                            result_memory_uid: resultKey,
                        },
                    });

                    if (!package_ref || !tool_slug) {
                        this.publishToolActionResult({
                            process_uid: routeProcessUid,
                            sessionId,
                            eventName: PARSER_RUNTIME_EVENT.HANDLER_ERROR,
                            payload: {
                                action: 'execute',
                                package_ref,
                                tool_slug,
                                error_message: 'Missing package_ref or tool_slug.',
                            },
                        });
                        KernelEngine.updateProcessPayload(routeProcessUid, {
                            status: 'failed',
                            error_message: 'Missing package_ref or tool_slug.',
                            updated_at: Date.now(),
                        });
                        return;
                    }

                    try {
                        const result = await this.execute(package_ref, tool_slug, toolPayload, {
                            parent_process_uid: routeProcessUid,
                        });
                        if (resultKey) {
                            this.writeToolResultMemory({
                                processUid: routeProcessUid,
                                resultMemoryUid: resultKey,
                                payload: this.buildToolMemoryEnvelope({
                                    status: 'ok',
                                    action: 'execute',
                                    packageRef: package_ref,
                                    toolSlug: tool_slug,
                                    resultMemoryUid: resultKey,
                                    sessionId,
                                    data: {
                                        result,
                                    },
                                }),
                            });
                        }

                        this.appendSessionToolArtifacts({
                            sessionId,
                            packageRef: package_ref,
                            toolSlug: tool_slug,
                            action: 'execute',
                            status: 'ok',
                            resultMemoryUid: resultKey,
                            result,
                        });

                        this.publishToolActionResult({
                            process_uid: routeProcessUid,
                            sessionId,
                            eventName: PARSER_RUNTIME_EVENT.HANDLER_RESULT,
                            payload: {
                                action: 'execute',
                                package_ref,
                                tool_slug,
                                result_memory_uid: resultKey,
                                result,
                            },
                        });

                        KernelEngine.updateProcessPayload(routeProcessUid, {
                            status: 'done',
                            action: 'execute',
                            updated_at: Date.now(),
                        });
                    } catch (error) {
                        const error_message = error instanceof Error ? error.message : String(error);
                        if (resultKey) {
                            this.writeToolResultMemory({
                                processUid: routeProcessUid,
                                resultMemoryUid: resultKey,
                                payload: this.buildToolMemoryEnvelope({
                                    status: 'error',
                                    action: 'execute',
                                    packageRef: package_ref,
                                    toolSlug: tool_slug,
                                    resultMemoryUid: resultKey,
                                    sessionId,
                                    data: {
                                        error_message,
                                    },
                                }),
                            });
                        }

                        this.appendSessionToolArtifacts({
                            sessionId,
                            packageRef: package_ref,
                            toolSlug: tool_slug,
                            action: 'execute',
                            status: 'error',
                            resultMemoryUid: resultKey,
                            errorMessage: error_message,
                        });

                        this.publishToolActionResult({
                            process_uid: routeProcessUid,
                            sessionId,
                            eventName: PARSER_RUNTIME_EVENT.HANDLER_ERROR,
                            payload: {
                                action: 'execute',
                                package_ref,
                                tool_slug,
                                result_memory_uid: resultKey,
                                error_message,
                            },
                        });

                        KernelEngine.updateProcessPayload(routeProcessUid, {
                            status: 'failed',
                            action: 'execute',
                            error_message,
                            updated_at: Date.now(),
                        });
                    }
                },
            });
        });

        EventBus.registerProcessRoute('execute_tool', async ({ payload, preallocated_memory, source }: CoreEngineHandlerArgs<Record<string, unknown>>) => {
            const raw = (payload ?? {}) as {
                request_id?: string;
                package_ref?: string;
                tool_slug?: string;
                payload?: unknown;
                [k: string]: unknown;
            };

            const request_id = typeof raw.request_id === 'string' ? raw.request_id : undefined;
            const package_ref = typeof raw.package_ref === 'string' ? raw.package_ref : '';
            const tool_slug = typeof raw.tool_slug === 'string' ? raw.tool_slug : '';

            const toolPayload =
                raw.payload !== undefined
                    ? raw.payload
                    : Object.fromEntries(
                        Object.entries(raw).filter(([k]) => k !== 'package_ref' && k !== 'tool_slug'),
                    );

            if (!package_ref || !tool_slug) {
                console.warn('[execute_tool] Missing package_ref or tool_slug in payload.');
                return;
            }

            const sourceProcessUid = typeof source?.process_uid === 'string' ? source.process_uid : undefined;

            const resultKey =
                typeof preallocated_memory?.reply_to_ram_key === 'string'
                    ? preallocated_memory.reply_to_ram_key
                    : undefined;

            await this.runRouteProcess({
                routeType: 'tool_route:execute_tool',
                sourceProcessUid,
                metadata: {
                    package_ref,
                    tool_slug,
                    result_memory_uid: resultKey,
                },
                payload: {
                    action: 'execute_tool',
                },
                run: async (routeProcessUid) => {
                    try {
                        const result = await this.execute(package_ref, tool_slug, toolPayload, {
                            parent_process_uid: routeProcessUid,
                        });
                        if (resultKey) {
                            this.writeToolResultMemory({
                                processUid: routeProcessUid,
                                resultMemoryUid: resultKey,
                                payload: this.buildToolMemoryEnvelope({
                                    status: 'ok',
                                    action: 'execute',
                                    packageRef: package_ref,
                                    toolSlug: tool_slug,
                                    resultMemoryUid: resultKey,
                                    sessionId: typeof preallocated_memory?.session_id === 'string' ? preallocated_memory.session_id : undefined,
                                    data: {
                                        result,
                                    },
                                }),
                            });
                        }

                        this.appendSessionToolArtifacts({
                            sessionId: typeof preallocated_memory?.session_id === 'string' ? preallocated_memory.session_id : undefined,
                            requestId: request_id,
                            packageRef: package_ref,
                            toolSlug: tool_slug,
                            action: 'execute',
                            status: 'ok',
                            resultMemoryUid: resultKey,
                            result,
                        });
                    } catch (error) {
                        this.appendSessionToolArtifacts({
                            sessionId: typeof preallocated_memory?.session_id === 'string' ? preallocated_memory.session_id : undefined,
                            requestId: request_id,
                            packageRef: package_ref,
                            toolSlug: tool_slug,
                            action: 'execute',
                            status: 'error',
                            resultMemoryUid: resultKey,
                            errorMessage: error instanceof Error ? error.message : String(error),
                        });
                        if (resultKey) {
                            this.writeToolResultMemory({
                                processUid: routeProcessUid,
                                resultMemoryUid: resultKey,
                                payload: this.buildToolMemoryEnvelope({
                                    status: 'error',
                                    action: 'execute',
                                    packageRef: package_ref,
                                    toolSlug: tool_slug,
                                    resultMemoryUid: resultKey,
                                    sessionId: typeof preallocated_memory?.session_id === 'string' ? preallocated_memory.session_id : undefined,
                                    data: {
                                        error_message: error instanceof Error ? error.message : String(error),
                                    },
                                }),
                            });
                        }
                        throw error;
                    }
                },
            });
        });

        this.isRouteBound = true;
    }
}

export const ToolEngine = new ToolEngineSingleton();
