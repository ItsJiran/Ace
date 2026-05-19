// src/hooks/use-ace-task.ts
import { useEffect, useRef } from 'react';

export interface UseAceTaskConfig {
    id: string; // Unique task identifier
    type: 'cron' | 'interval';
    schedule: string; // "*/15 * * * *" or "1000" (ms) for interval
    task: () => void | Promise<void>;
}

export const useAceTask = (config: UseAceTaskConfig) => {
    const taskRef = useRef(config.task);
    
    // Always keep the task updated
    useEffect(() => {
        taskRef.current = config.task;
    }, [config.task]);

    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        const runTask = async () => {
            try {
                await taskRef.current();
            } catch (err) {
                console.error(`[AceTask Error:${config.id}]`, err);
            }
        };

        if (config.type === 'interval') {
             const ms = parseInt(config.schedule, 10);
             if (!isNaN(ms) && ms > 0) {
                 intervalId = setInterval(runTask, ms);
                 // console.log(`[AceTask Init:${config.id}] Interval: ${ms}ms`);
             }
        } else if (config.type === 'cron') {
            // Very simplified cron implementation for now (interval fallback)
            // Ideally we'd parse cron strings propertly. For MVP, assume it's just 'run periodically'
            // For now, let's treat it as interval of 60s as a placeholder
            // TODO: Integrate actual Cron parser
             intervalId = setInterval(runTask, 60000); 
             // console.log(`[AceTask Init:${config.id}] Cron Stub (60s)`);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
            // console.log(`[AceTask Stop:${config.id}]`);
        };
    }, [config.id, config.type, config.schedule]);
};
