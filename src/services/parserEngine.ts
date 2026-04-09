// /**
//  * ParserEngine
//  *
//  * Top-level singleton orchestrating parser runtime responsibilities.
//  * Logic is delegated to focused subservices under `services/parserEngine/`:
//  * - ParserSessionStateService
//  * - ParserBlockDispatchService
//  * - ParserEventRouteService
//  */

// import { RegistryEngine } from '#/services/registryEngine';
// import { EventBus } from '#/services/eventEngine';
// import type { ParserBlockRuntime } from '#/schemas/parser';
// import { ParserBlockDispatchService } from './parserEngine/blockDispatchService';
// import { ParserEventRouteService } from './parserEngine/eventRouteService';
// import { ParserSessionStateService } from './parserEngine/sessionStateService';
// import type { DispatchBlockInput, EmitSessionResultInput, ParserTokenTraceRecord } from './parserEngine/types';

// class ParserEngineSingleton {
//     private readonly sessionState = new ParserSessionStateService();
//     private readonly blockDispatch = new ParserBlockDispatchService({
//         getParserBlock: (tagName) => this.getParserBlock(tagName),
//         emitSessionResult: (input) => this.emitSessionResult(input),
//         nextBlockId: (sessionId) => this.sessionState.nextBlockId(sessionId),
//     });
//     private readonly eventRoutes = new ParserEventRouteService({
//         onSessionResult: (record) => this.sessionState.queueSessionResult(record),
//         onSessionStopSignal: (signal) => this.sessionState.queueSessionStopSignal(signal),
//         onSessionClose: (sessionId) => this.sessionState.cleanupSession(sessionId),
//     });

//     private emitSessionResult(input: EmitSessionResultInput): void {
//         const { sessionId, processUid, parsedTag, payload } = input;
//         if (!sessionId) return;

//         EventBus.emit({
//             event_type: 'interaction',
//             action: 'parser_result',
//             sub_action: 'session',
//             process_uid: processUid,
//             payload: {
//                 session_id: sessionId,
//                 parsed_tag: parsedTag,
//                 at: Date.now(),
//                 ...payload,
//             },
//         });
//     }

//     getParserBlock(tagName: string): ParserBlockRuntime | null {
//         return RegistryEngine.getParserBlock(tagName);
//     }

//     listParserBlocks(): ParserBlockRuntime[] {
//         return RegistryEngine.listParserBlocks();
//     }

//     buildParserBlockProtocolLines(): string {
//         return RegistryEngine.buildParserBlockProtocolLines();
//     }

//     dispatchParsedBlock(input: DispatchBlockInput): boolean {
//         return this.blockDispatch.dispatchParsedBlock(input);
//     }

//     registerEventRoutes(): void {
//         this.eventRoutes.registerEventRoutes();
//     }

//     drainSessionResults(sessionId: string) {
//         return this.sessionState.drainSessionResults(sessionId);
//     }

//     drainSessionStopSignals(sessionId: string) {
//         return this.sessionState.drainSessionStopSignals(sessionId);
//     }

//     recordTokenTrace(trace: ParserTokenTraceRecord): void {
//         this.sessionState.recordTokenTrace(trace);
//     }

//     drainTokenTraces(sessionId: string): ParserTokenTraceRecord[] {
//         return this.sessionState.drainTokenTraces(sessionId);
//     }
// }

// export type ParserEngine = ParserEngineSingleton;
// export type { DispatchBlockInput, ParserTokenTraceRecord } from './parserEngine/types';

// export const ParserEngine = new ParserEngineSingleton();
