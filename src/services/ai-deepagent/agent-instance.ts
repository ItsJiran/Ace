import { CompositeBackend, createDeepAgent, StateBackend, FilesystemBackend, StoreBackend } from "deepagents";

import AgentTools from "./agent-tools";
import AgentMiddlewares from "./agent-middlewares";
import AgentCheckpointer from "./agent-checkpointer";

const GlobalAceAgent = createDeepAgent({
  /**
   * Default Model
   */
  model: 'default-model', 
  
  /**
   * Prompts
   */

  systemPrompt: `You are an assistant integrated in Ace, a collaborative coding environment. Your task is to assist users with their coding needs, 
  providing accurate and helpful responses based on the context of the conversation and the code they are working on. 
  Always consider the user's intent and the current state of their project when formulating your responses.`,

  /**
   * Tools
   */

  tools: AgentTools,

  /**
   * Middlewares
   */

  middleware: AgentMiddlewares,
  
  /**
   * Backend for agent runtime storing in file mechanism..
   */

  backend: ,

  /**
   * Checkpointer for agent runtime.
   */

  checkpointer: new AgentCheckpointer(),
});

export default class SingletonAgentBackend {

}