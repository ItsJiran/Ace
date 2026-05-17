import { createDeepAgent, StateBackend } from "deepagents";

import internalTools from "./agent-internal-tools";
import internalMiddlewares from "./agent-internal-middlewares";

import type { AgentConfig, AgentConfigurable, AgentRuntime } from "#/schemas/ai";

const GlobalAceAgent = createDeepAgent({
  /**
   * Sistem backend kita menggunakan pendekatan hybrid:   
   */
  model: 'default-model', 

  /**
   * Sistem backend kita menggunakan pendekatan hybrid:   
   */

  tools: internalTools,

  /**
   * Sistem backend kita menggunakan pendekatan hybrid:   
   */

  systemPrompt: ``,

  /**
   * Middleware
   */

  middleware: internalMiddlewares,
  
  /**
   * Backend for agent runtime storing in file mechanism..
   */

  backend: (runtime) => {
    return new StateBackend();
  }
});


// GlobalAceAgent.invoke( {
//   message
// }, {
//   confi
// } )