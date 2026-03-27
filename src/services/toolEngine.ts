import { RegistryEngine } from './registryEngine';
import { ProcessEngine } from './processEngine';
import { EventBus } from './eventEngine';
import { StorageEngine } from './storageEngine';
import type { ToolDefinition } from '#/schemas/tooling';
import { PARSER_RUNTIME_EVENT } from '#/schemas/parserEventNames';

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
            // Backward-compatible top-level fields.
            status,
            action,
            package_ref: packageRef,
            tool_slug: toolSlug,
            result_memory_uid: resultMemoryUid,
            finished_at: at,
            ...data,

            // Source-aware envelope (package + handler + payload only).
            payload: data,
            source: {
                package_ref: packageRef,
                handler_ref: `tool:${action}:${packageRef || 'unknown'}:${toolSlug || 'n/a'}`,
                block_tag: 'tool',
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
        sessionId?: string;
        eventName: HandlerLifecycleEventName;
        payload: Record<string, unknown>;
    }) {
        const { sessionId, eventName, payload } = input;
        if (!sessionId) return;

        EventBus.emit({
            event_type: 'interaction',
            action: 'parser_result',
            sub_action: 'session',
            payload: {
                session_id: sessionId,
                tag: 'tool',
                block_type: 'tool',
                at: Date.now(),
                event_name: eventName,
                ...payload,
            },
        });
    }

    private publishToolActionStarted(input: {
        sessionId?: string;
        action: 'list' | 'view_schema' | 'execute';
        payload: Record<string, unknown>;
    }) {
        this.publishToolActionResult({
            sessionId: input.sessionId,
            eventName: PARSER_RUNTIME_EVENT.HANDLER_STARTED,
            payload: {
                action: input.action,
                ...input.payload,
            },
        });
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
        _options?: { origin_window_uid?: string; origin_widget_uid?: string }
    ): Promise<unknown> {
        const validatedArgs = this.validate(packageRef, toolSlug, payload);

        const result = RegistryEngine.getDomainEntry(packageRef, 'tools', toolSlug);
        if (!result?.entry) throw new Error(`ToolEngine: tool "${packageRef}/${toolSlug}" not found.`);

        const toolDef = result.entry.implementation as ToolDefinition<any>;

        return ProcessEngine.track(
            `tool:${packageRef}:${toolSlug}`,
            { packageRef, toolSlug, payload },
            async (process_uid) => {
                return toolDef.handler(validatedArgs, process_uid);
            },
        );
    }

    registerEventRoutes() {
        if (this.isRouteBound) return;

        EventBus.registerProcessRoute('tool:list', ({ payload, preallocated_memory }: { payload: Record<string, unknown>; preallocated_memory?: Record<string, unknown> }) => {
            const raw = (payload ?? {}) as ToolActionPayload;
            const resultKey = this.resolveResultKey(raw, preallocated_memory);
            const sessionId = typeof preallocated_memory?.session_id === 'string' ? preallocated_memory.session_id : undefined;
            this.publishToolActionStarted({
                sessionId,
                action: 'list',
                payload: {
                    result_memory_uid: resultKey,
                },
            });
            const tools = this.getAll();

            if (resultKey) {
                StorageEngine.dispatchRAMAction({
                    action: 'create_memory',
                    memory_uid: resultKey,
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
                    classifications: ['system:dev', 'system:tool_runner'],
                });
            }

            this.publishToolActionResult({
                sessionId,
                eventName: PARSER_RUNTIME_EVENT.HANDLER_RESULT,
                payload: {
                    action: 'list',
                    result_memory_uid: resultKey,
                    total: tools.length,
                    tools,
                },
            });
        });

        EventBus.registerProcessRoute('tool:view_schema', ({ payload, preallocated_memory }: { payload: Record<string, unknown>; preallocated_memory?: Record<string, unknown> }) => {
            const raw = (payload ?? {}) as ToolActionPayload;
            const package_ref = typeof raw.package_ref === 'string' ? raw.package_ref : '';
            const tool_slug = typeof raw.tool_slug === 'string' ? raw.tool_slug : '';
            const sessionId = typeof preallocated_memory?.session_id === 'string' ? preallocated_memory.session_id : undefined;
            const resultKey = this.resolveResultKey(raw, preallocated_memory);
            this.publishToolActionStarted({
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
                    sessionId,
                    eventName: PARSER_RUNTIME_EVENT.HANDLER_ERROR,
                    payload: {
                        action: 'view_schema',
                        package_ref,
                        tool_slug,
                        error_message: 'Missing package_ref or tool_slug.',
                    },
                });
                return;
            }

            const result = this.getRegistry({ packageRef: package_ref, slug: tool_slug });
            const entry = result?.entry as any;
            const toolSchema = entry?.metadata?.parameters ?? undefined;
            const description = entry?.implementation?.description ?? entry?.metadata?.description ?? '';

            if (resultKey) {
                StorageEngine.dispatchRAMAction({
                    action: 'create_memory',
                    memory_uid: resultKey,
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
                    classifications: ['system:dev', 'system:tool_runner'],
                });
            }

            this.publishToolActionResult({
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
        });

        EventBus.registerProcessRoute('tool:execute', async ({ payload, preallocated_memory }: { payload: Record<string, unknown>; preallocated_memory?: Record<string, unknown> }) => {
            const raw = (payload ?? {}) as ToolActionPayload;
            const package_ref = typeof raw.package_ref === 'string' ? raw.package_ref : '';
            const tool_slug = typeof raw.tool_slug === 'string' ? raw.tool_slug : '';
            const sessionId = typeof preallocated_memory?.session_id === 'string' ? preallocated_memory.session_id : undefined;
            const resultKey = this.resolveResultKey(raw, preallocated_memory);
            this.publishToolActionStarted({
                sessionId,
                action: 'execute',
                payload: {
                    package_ref,
                    tool_slug,
                    result_memory_uid: resultKey,
                },
            });

            const nestedPayload =
                raw.payload && typeof raw.payload === 'object'
                    ? raw.payload
                    : raw.input && typeof raw.input === 'object'
                        ? raw.input
                        : undefined;

            const toolPayload = nestedPayload ?? Object.fromEntries(
                Object.entries(raw).filter(([k]) => !['package_ref', 'tool_slug', 'result_memory_uid', 'memory_uid', 'session_id', 'status', 'action', 'payload', 'input'].includes(k)),
            );

            if (!package_ref || !tool_slug) {
                this.publishToolActionResult({
                    sessionId,
                    eventName: PARSER_RUNTIME_EVENT.HANDLER_ERROR,
                    payload: {
                        action: 'execute',
                        package_ref,
                        tool_slug,
                        error_message: 'Missing package_ref or tool_slug.',
                    },
                });
                return;
            }

            try {
                const result = await this.execute(package_ref, tool_slug, toolPayload);
                if (resultKey) {
                    StorageEngine.dispatchRAMAction({
                        action: 'create_memory',
                        memory_uid: resultKey,
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
                        classifications: ['system:dev', 'system:tool_runner'],
                    });
                }

                this.publishToolActionResult({
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
            } catch (error) {
                const error_message = error instanceof Error ? error.message : String(error);
                if (resultKey) {
                    StorageEngine.dispatchRAMAction({
                        action: 'create_memory',
                        memory_uid: resultKey,
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
                        classifications: ['system:dev', 'system:tool_runner'],
                    });
                }

                this.publishToolActionResult({
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
            }
        });

        EventBus.registerProcessRoute('execute_tool', async ({ payload, preallocated_memory }: { payload: Record<string, unknown>; preallocated_memory?: Record<string, unknown> }) => {
            const raw = (payload ?? {}) as {
                package_ref?: string;
                tool_slug?: string;
                payload?: unknown;
                [k: string]: unknown;
            };

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

            const resultKey =
                typeof preallocated_memory?.reply_to_ram_key === 'string'
                    ? preallocated_memory.reply_to_ram_key
                    : undefined;

            try {
                const result = await this.execute(package_ref, tool_slug, toolPayload);
                if (resultKey) {
                    StorageEngine.dispatchRAMAction({
                        action: 'create_memory',
                        memory_uid: resultKey,
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
                        classifications: ['system:dev', 'system:tool_runner'],
                    });
                }
            } catch (error) {
                if (resultKey) {
                    StorageEngine.dispatchRAMAction({
                        action: 'create_memory',
                        memory_uid: resultKey,
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
                        classifications: ['system:dev', 'system:tool_runner'],
                    });
                }
                throw error;
            }
        });

        this.isRouteBound = true;
    }
}

export const ToolEngine = new ToolEngineSingleton();
