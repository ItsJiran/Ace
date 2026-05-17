
import { AgentConfigurable } from "#/schemas/ai";

// This is the initial state of the agent when it is created. It can be 
// updated and modified as the agent interacts with the environment and performs its tasks. 
// The thread_id can be used to track the agent's execution and associate it with specific tasks or interactions.
export default () : AgentRuntime => {
    return {
        thread_id : crypto.randomUUID(),        
    }
}