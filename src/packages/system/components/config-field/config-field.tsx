import { z } from 'zod';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';

export type SectionStorageKey = 'general' | 'keybinds' | 'ai';

function parseInputValue(rawValue: string, currentValue: unknown): unknown {
	if (typeof currentValue === 'number') {
		return Number(rawValue);
	}

	if (Array.isArray(currentValue)) {
		return rawValue
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
	}

	if (currentValue && typeof currentValue === 'object') {
		try {
			return JSON.parse(rawValue);
		} catch {
			return currentValue;
		}
	}

	return rawValue;
}

function resolveTextValue(value: unknown) {
	if (Array.isArray(value)) {
		return value.join(', ');
	}

	if (value && typeof value === 'object') {
		return JSON.stringify(value, null, 2);
	}

	return value == null ? '' : String(value);
}

export function ConfigField({
	storageKey,
	configKey,
	schema,
	value,
}: {
	storageKey: SectionStorageKey;
	configKey: string;
	schema: z.ZodTypeAny;
	value: unknown;
}) {
	const { targets } = useAceTheme();
	const schemaDescription = schema.description;
	const enumOptions = schema instanceof z.ZodEnum ? schema.options : null;

	if (typeof value === 'boolean') {
		return (
			<label className={[targets.container.third, 'flex items-start justify-between gap-4 rounded-2xl px-4 py-3'].join(' ')}>
				<div>
					<div className="text-sm font-medium text-zinc-100">{configKey}</div>
					{schemaDescription ? (
						<div className="mt-1 text-xs leading-5">{schemaDescription}</div>
					) : null}
				</div>
				<input
					type="checkbox"
					checked={value}
					onChange={(event) => {
						void window.ACE.config.updateConfigItem(storageKey, configKey, event.target.checked);
					}}
					className="mt-1 h-4 w-4 rounded border-white/20 bg-black/30"
				/>
			</label>
		);
	}

	if (enumOptions) {
		return (
			<label className={[targets.container.third, 'flex flex-col gap-2 rounded-2xl px-4 py-3'].join(' ')}>
				<div className="text-sm font-medium text-zinc-100">{configKey}</div>
				{schemaDescription ? (
					<div className="text-xs leading-5">{schemaDescription}</div>
				) : null}
				<select
					value={String(value ?? '')}
					onChange={(event) => {
						void window.ACE.config.updateConfigItem(storageKey, configKey, event.target.value);
					}}
					className={[targets.input.first, 'rounded-xl px-3 py-2 text-sm text-zinc-100'].join(' ')}
				>
					{enumOptions.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
			</label>
		);
	}

	const isLongText = Array.isArray(value) || (value && typeof value === 'object');

	return (
		<label className={[targets.container.third, 'flex flex-col gap-2 rounded-2xl px-4 py-3'].join(' ')}>
			<div className="text-sm font-medium text-zinc-100">{configKey}</div>
			{schemaDescription ? (
				<div className="text-xs leading-5">{schemaDescription}</div>
			) : null}
			{isLongText ? (
				<textarea
					defaultValue={resolveTextValue(value)}
					rows={Array.isArray(value) ? 2 : 6}
					onBlur={(event) => {
						void window.ACE.config.updateConfigItem(
							storageKey,
							configKey,
							parseInputValue(event.target.value, value),
						);
					}}
					className={[targets.input.first, 'min-h-[72px] resize-y rounded-2xl px-3 py-2 text-sm text-zinc-100'].join(' ')}
				/>
			) : (
				<input
					type={typeof value === 'number' ? 'number' : 'text'}
					defaultValue={resolveTextValue(value)}
					onBlur={(event) => {
						void window.ACE.config.updateConfigItem(
							storageKey,
							configKey,
							parseInputValue(event.target.value, value),
						);
					}}
					className={[targets.input.first, 'rounded-xl px-3 py-2 text-sm text-zinc-100'].join(' ')}
				/>
			)}
		</label>
	);
}
