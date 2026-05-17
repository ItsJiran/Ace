import type { AIProvider } from "#/schemas/ai-gateway";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { Runtime, StateGraph } from "@langchain/langgraph";

export interface AgentConfigurable {
  thread_id: string;
  checkpoint_id?: string;
  model?: string;
  provider?: AIProvider;
  allowedTool: string[];
  [key: string]: unknown;
}

export interface AgentConfig  extends RunnableConfig{
  configurable: AgentConfigurable;
}

export interface AgentRuntime extends Runtime {
  configurable: AgentConfigurable; // Override properti configurable dengan milik kita
}