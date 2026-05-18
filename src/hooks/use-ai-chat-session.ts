// import { useState } from 'react';
// import { useAceMemory } from '#/hooks/use-ace-memory';
// import { AIGatewayEngine } from '#/engines/ai-gateway-engine';
// import type { AISession, SDKProvider } from '#/schemas/ai';
// import { KernelEngine } from '#/engines/kernel-engine';



// export function useAIChatSession(session_uid?: string) {
//     const [sessionUid, setSessionUid] = useState<string | null>(session_uid ?? null);

//     // 2. ALWAYS call hooks, even if the UID is null (use a ternary for the key)
//     // This prevents "Rendered more/fewer hooks than expected" errors.
//     const memoryKey = `system:ai_session:${sessionUid}:state`;
//     const session = useAceMemory<AISession>(memoryKey);

//     const sendPrompt = async (prompt: string, selectedProvider: SDKProvider, selectedModel: string) => {
//         const normalizedPrompt = prompt.trim();
//         if(!normalizedPrompt) return;

//         // If no session exists, create one before sending the prompt. 
//         // This ensures that we always have a valid session to work with.
//         if(!sessionUid) {
//             // Create a new session if one doesn't exist
//             const newSession = AIGatewayEngine.createSession(selectedProvider, selectedModel);
//             setSessionUid(newSession.session_uid);
//             console.log('Created new session with UID:', newSession.session_uid);

//             // Update the session config in memory if the 
//             // user changed SDK/Model in the UI
//             KernelEngine.updateMemory(
//                 `system:ai_session:${newSession.session_uid}:state`, 
//                 {
//                     sdk: selectedProvider, 
//                     model: selectedModel 
//                 }
//             );

//             return AIGatewayEngine.sendToSession(newSession.session_uid, normalizedPrompt);
//         } else {
//             // Update the session config in memory if the 
//             // user changed SDK/Model in the UI
//             KernelEngine.updateMemory(
//                 `system:ai_session:${sessionUid}:state`, 
//                 {
//                     sdk: selectedProvider, 
//                     model: selectedModel 
//                 }
//             );

//             return AIGatewayEngine.sendToSession(sessionUid, normalizedPrompt);
//         }
//     };

//     const interruptSession = () => {
//         if (!sessionUid) return;
//         AIGatewayEngine.interruptSession(sessionUid);
//     };

//     return {
//         session, // This will be undefined until sessionUid is set and memory is fetched
//         sessionUid,
//         sendPrompt,
//         interruptSession,
//     };
// }
