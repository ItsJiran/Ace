import { useMemo } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { ConfigField } from './config-field';
import { DefaultConfigGeneral } from '#/shared/constants/config';
import type { InferConfigData } from '#/shared/schemas/config';

type GeneralSectionProps = {
	config: InferConfigData<typeof DefaultConfigGeneral> | undefined;
	schema: Record<string, import('zod').ZodTypeAny>;
};

export function SystemSettingsGeneralSection({ config, schema }: GeneralSectionProps) {
	const { targets } = useAceTheme();
	const entries = useMemo(() => Object.entries(schema), [schema]);

	return (
		<section className={[targets.shell.first, 'rounded-2xl p-4 flex flex-col gap-4 border-none'].join(' ')}>
			<div className="flex items-start gap-3">
				<div className={[targets.btn.secondary, 'rounded-2xl p-3'].join(' ')}>
					<SlidersHorizontal size={18} />
				</div>
				<div>
					<div className="text-lg font-semibold">General</div>
					<div className="mt-1 text-sm leading-6">
						Overlay, theme, opacity, and runtime shell behavior.
					</div>
				</div>
			</div>

			<div className="grid gap-3">
				{entries.map(([configKey, fieldSchema]) => (
					<ConfigField
						key={configKey}
						storageKey="general"
						configKey={configKey}
						schema={fieldSchema}
						value={config?.[configKey]}
					/>
				))}
			</div>
		</section>
	);
}
