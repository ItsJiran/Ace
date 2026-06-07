import { useMemo } from 'react';
import { Bot } from 'lucide-react';

import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { ConfigFieldAI } from './config-field';
import { DefaultConfigAI } from '#/shared/constants/config';
import type { InferConfigData } from '#/shared/schemas/config';

type AISectionProps = {
	config: InferConfigData<typeof DefaultConfigAI> | undefined;
	schema: Record<string, import('zod').ZodTypeAny>;
};

export function SystemSettingsAISection({ config, schema }: AISectionProps) {
	const { targets } = useAceTheme();

	return (
		<section className={[targets.shell.first, 'rounded-2xl p-4 flex flex-col gap-4 border-none'].join(' ')}>
			<div className="flex items-start gap-3">
				<div className={[targets.btn.secondary, 'rounded-2xl p-3'].join(' ')}>
					<Bot size={18} />
				</div>
				<div>
					<div className="text-lg font-semibold">AI</div>
					<div className="mt-1 text-sm leading-6">
						Manage AI providers, default model, and gateway configurations.
					</div>
				</div>
			</div>

			<ConfigFieldAI config={config} />
		</section>
	);
}
