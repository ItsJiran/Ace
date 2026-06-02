import type { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';

export const AceAgentState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (current, update) => {
            const merged = current.concat(update);
            return merged;
        },
        default: () => [],
    }),

    /**
     * tasks : [
     * 	  {
	 * 	    'id' : 'unique_task_id',
	 *      'type' : 'task',
     *      'summary' : 'Some task summary'
     * 		'type_node' : 'orchestrator' | 'executor' | 'retriever' | 'critics',
	 *      'payload' : { ... }, // the content depends on the type of the task, e.g. for 'executor', it could be { tool_name : 'some_tool', tool_input : { ... } }
     * 	    'status' : 'pending' | 'in_progress' | 'completed' | 'failed',
     *    }
     * ]
     */

    /**
     * context : {
     * 	  'files' : [ { path : 'path/to/file', size : 12345, line_count : 100, last_modified : '2024-06-01T12:34:56Z', storage_uid : 'some_uid' | undefined } ],
     *    'informations' : [ { title : 'some info title', content : 'some info content' } ],
	 *    'tools' : [ { name : 'tool name', description : 'tool description', input_schema : { type : 'object', properties : { ... } }, result_schema : { type : 'object', properties : { ... }, result_storage_uid : 'some_storage' } } ],
	 *    'recent_node_results' : [ { node_id : 'some_node_id', result_summary : 'summary of the node execution result' } ]
     * }
     */
});
