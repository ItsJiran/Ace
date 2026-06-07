import { useMemo } from 'react';
import { Keyboard } from 'lucide-react';

import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { ConfigField } from './config-field';
import { DefaultConfigKeybinds } from '#/shared/constants/config';
import type { InferConfigData } from '#/shared/schemas/config';

type KeybindsSectionProps = {
	config: InferConfigData<typeof DefaultConfigKeybinds> | undefined;
	schema: Record<string, import('zod').ZodTypeAny>;
};

export function SystemSettingsKeybindsSection({ config, schema }: KeybindsSectionProps) {
	const { targets } = useAceTheme();
	const entries = useMemo(() => Object.entries(schema), [schema]);

	return (
		<section className={[targets.shell.first, 'rounded-2xl p-4 flex flex-col gap-4 border-none'].join(' ')}>
			<div className="flex items-start gap-3">
				<div className={[targets.btn.secondary, 'rounded-2xl p-3'].join(' ')}>
					<Keyboard size={18} />
				</div>
				<div>
					<div className="text-lg font-semibold">Keybinds</div>
					<div className="mt-1 text-sm leading-6">
						Persisted keyboard shortcuts used by the desktop runtime.
					</div>
				</div>
			</div>

			<div className="grid gap-3">
				{entries.map(([configKey, fieldSchema]) => (
					<ConfigField
						key={configKey}
						storageKey="keybinds"
						configKey={configKey}
						schema={fieldSchema}
						value={config?.[configKey]}
					/>
				))}
			</div>
		</section>
	);
}
