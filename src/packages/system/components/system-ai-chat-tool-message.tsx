import { Check, Wrench, X } from 'lucide-react';
import { ToolMessage } from '@langchain/core/messages';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { ToolPayloadRenderer } from './tools/tool-payload-renderer';

export function SystemAIChatToolMessage({ message }: { message: ToolMessage }) {
    const { targets } = useAceTheme();
    const toolRecord = message as unknown as Record<string, unknown>;
    const toolName =
        typeof toolRecord.name === 'string'
            ? toolRecord.name
            : typeof toolRecord.tool_name === 'string'
              ? toolRecord.tool_name
              : 'tool';
    const toolCallId = typeof toolRecord.tool_call_id === 'string' ? toolRecord.tool_call_id : null;
    const status = typeof toolRecord.status === 'string' ? toolRecord.status : null;
    const artifact = toolRecord.artifact;

    return (
        <div className="flex w-full flex-col gap-3 text-zinc-500">
            <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={[targets.container.first, 'inline-flex items-center gap-2 rounded-2xl py-2 text-xs px-3'].join(' ')}>
                    <Wrench size={13} />
                    {toolName}
                </span>
                {toolCallId ? (
                    <span className={[targets.container.first, 'rounded-2xl py-2 text-xs px-3'].join(' ')}>
                        call: {toolCallId}
                    </span>
                ) : null}
                {status ? (
                    <>
                        {(() => {
                            switch (status) {
                                case 'success':
                                    return (
                                        <span className={[targets.container.sixth, 'rounded-2xl py-2 text-xs flex px-2'].join(' ')}>
                                            <Check size={13} />
                                        </span>
                                    );
                            case 'failed':
                            case 'error':
									return (
										<span className={[targets.container.fifth, 'rounded-2xl py-2 text-xs flex px-2'].join(' ')}>
											<X size={13} />
										</span>
									);
                                default:
                                    return (
                                        <span className={[targets.container.first, 'rounded-2xl py-2 text-xs px-3'].join(' ')}>
                                            {status}
                                        </span>
                                    );
                            }
                        })()}
                    </>
                ) : null}
            </div>

            <ToolPayloadRenderer
                toolName={toolName}
                content={message.content}
                artifact={artifact}
                record={toolRecord}
            />
        </div>
    );
}
