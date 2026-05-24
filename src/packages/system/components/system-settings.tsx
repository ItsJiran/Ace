import { useMemo } from 'react';
import { z } from 'zod';
import { Settings2, SlidersHorizontal, Keyboard, Bot } from 'lucide-react';

import { RenderCounterBadge } from '#/app-desktop/components/dev/render-counter-badge';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import {
	ConfigAI_V0_0_0_Type,
	ConfigGeneral_V0_0_0_Type,
	ConfigKeybind_V0_0_0_Type,
	DefaultConfigAI,
	DefaultConfigGeneral,
	DefaultConfigKeybinds,
} from '#/shared/constants/config';
import { defineComponent } from '#/lib/define-registry';

type SectionDefinitionType = {
	storageKey: 'general' | 'keybinds' | 'ai';
	title: string;
	description: string;
	icon: typeof Settings2;
	memoryUid: string;
	schema: Record<string, z.ZodTypeAny>;
	config: Record<string, unknown> | undefined;
};

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

function ConfigField({
	storageKey,
	configKey,
	schema,
	value,
}: {
	storageKey: SectionDefinitionType['storageKey'];
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

function ConfigSection({ section }: { section: SectionDefinitionType }) {
	const { targets } = useAceTheme();
	const Icon = section.icon;
	const entries = useMemo(() => Object.entries(section.schema), [section.schema]);

	return (
		<section className={[targets.shell.first, 'rounded-2xl p-4 flex flex-col gap-4'].join(' ')}>
			<div className="flex items-start gap-3">
				<div className={[targets.btn.secondary, 'rounded-2xl p-3'].join(' ')}>
					<Icon size={18} />
				</div>
				<div>
					<div className="text-lg font-semibold">{section.title}</div>
					<div className="mt-1 text-sm leading-6">{section.description}</div>
				</div>
			</div>

			<div className="grid gap-3">
				{entries.map(([configKey, schema]) => (
					<ConfigField
						key={configKey}
						storageKey={section.storageKey}
						configKey={configKey}
						schema={schema}
						value={section.config?.[configKey]}
					/>
				))}
			</div>
		</section>
	);
}

function SystemSettings() {
	const { targets } = useAceTheme();
	const generalConfig = useAceMemory<ConfigGeneral_V0_0_0_Type>(DefaultConfigGeneral.memory_uid);
	const keybindConfig = useAceMemory<ConfigKeybind_V0_0_0_Type>(DefaultConfigKeybinds.memory_uid);
	const aiConfig = useAceMemory<ConfigAI_V0_0_0_Type>(DefaultConfigAI.memory_uid);

	const sections: SectionDefinitionType[] = [
		{
			storageKey: 'general',
			title: 'General',
			description: 'Overlay, theme, opacity, and runtime shell behavior.',
			icon: SlidersHorizontal,
			memoryUid: DefaultConfigGeneral.memory_uid,
			schema: DefaultConfigGeneral.config,
			config: generalConfig,
		},
		{
			storageKey: 'keybinds',
			title: 'Keybinds',
			description: 'Persisted keyboard shortcuts used by the desktop runtime.',
			icon: Keyboard,
			memoryUid: DefaultConfigKeybinds.memory_uid,
			schema: DefaultConfigKeybinds.config,
			config: keybindConfig,
		},
		{
			storageKey: 'ai',
			title: 'AI',
			description: 'Default provider, default model, and cached provider model inventories.',
			icon: Bot,
			memoryUid: DefaultConfigAI.memory_uid,
			schema: DefaultConfigAI.config,
			config: aiConfig,
		},
	];

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 p-4 text-zinc-100">
			<RenderCounterBadge componentName="system-settings" />

			<section className={[targets.shell.first, 'rounded-2xl p-5 flex items-start justify-between gap-4'].join(' ')}>
				<div>
					<div className="text-xs uppercase tracking-[0.24em] text-zinc-500">System Settings</div>
					<div className="mt-2 text-2xl font-semibold">Configuration Workspace</div>
					<div className="mt-2 max-w-2xl text-sm leading-6">
						Edit the live schema-backed configuration stored by ConfigEngine. The RAM state now mirrors the schema shape directly, so this panel edits the real config object instead of a derived item list.
					</div>
				</div>
				<div className={[targets.btn.secondary, 'rounded-2xl bg-white/10 p-3 text-zinc-100'].join(' ')}>
					<Settings2 size={22} />
				</div>
			</section>

			<div className="grid min-h-0 flex-1 gap-4 overflow-auto pr-1">
				{sections.map((section) => (
					<ConfigSection key={section.memoryUid} section={section} />
				))}
			</div>
		</div>
	);
}

export default defineComponent(SystemSettings, {
	name: 'system_settings',
	slug: 'system-settings',
	react_behavior: 'system_settings',
});
