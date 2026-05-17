import type { AIProvider } from "#/schemas/ai-gateway";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { Checkpoint, CheckpointTuple } from "@langchain/langgraph";

export interface AgentCheckpoint extends Checkpoint {

}

export interface AgentCheckpointTuple extends CheckpointTuple {
  
}


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