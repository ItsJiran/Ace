import type { ToolCallBase } from '../../schemas/tooling';

// Define the exact bash command tool the backend Chef will execute
export interface ProcessLookupTool extends ToolCallBase {
    tool_name: 'get_os_process_list';
    parameters: {
        sort_by?: 'cpu' | 'ram';
        limit?: number;
    };
}
