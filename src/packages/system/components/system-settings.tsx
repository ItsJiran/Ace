import { useState } from 'react';
import { Settings2 } from 'lucide-react';

import { RenderCounterBadge } from '#/app-desktop/components/dev/render-counter-badge';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import {
	DefaultConfigAI,
	DefaultConfigGeneral,
	DefaultConfigKeybinds,
} from '#/shared/constants/config';
import type { InferConfigData } from '#/shared/schemas/config';
import { defineComponent } from '#/lib/define-registry';

import { SystemSettingsGeneralSection } from './system-settings-general-section';
import { SystemSettingsKeybindsSection } from './system-settings-keybinds-section';
import { SystemSettingsAISection } from './system-settings-ai-section';
import { SettingsSidebar, type SettingsSectionId } from './system-settings-sidebar';

function SystemSettings() {
	const { targets } = useAceTheme();
	const [activeSection, setActiveSection] = useState<SettingsSectionId>('general');

	const generalConfig = useAceMemory<InferConfigData<typeof DefaultConfigGeneral>>(DefaultConfigGeneral.memory_uid);
	const keybindConfig = useAceMemory<InferConfigData<typeof DefaultConfigKeybinds>>(DefaultConfigKeybinds.memory_uid);
	const aiConfig = useAceMemory<InferConfigData<typeof DefaultConfigAI>>(DefaultConfigAI.memory_uid);

	return (
		<div className="flex h-full min-h-0 flex-col text-zinc-100 border-none">
			<RenderCounterBadge componentName="system-settings" />

			{/* Header */}
			<section className={[targets.shell.first, 'shrink-0 rounded-2xl  p-5 flex items-start justify-between gap-4  border-none'].join(' ')}>
				<div>
					<div className="text-xs uppercase tracking-[0.24em] text-zinc-500">System Settings</div>
					<div className="mt-2 text-2xl font-semibold">Configuration Workspace</div>
					<div className="mt-2 max-w-2xl text-sm leading-6">
						Edit the live schema-backed configuration stored by ConfigEngine. The RAM state now mirrors the schema shape directly, so this panel edits the real config object instead of a derived item list.
					</div>
				</div>
				<div className={[targets.btn.secondary, 'rounded-2xl bg-white/10 p-3 text-zinc-100 border-none'].join(' ')}>
					<Settings2 size={22} />
				</div>
			</section>

			{/* Body: Sidebar + Content */}
			<div className={`${targets.shell.first} flex min-h-0 flex-1 p-4 pt-3 gap-4 border-none`}>
				<SettingsSidebar activeSection={activeSection} onSelectSection={setActiveSection} />

				<div className="min-h-0 flex-1 overflow-auto pr-1">
					{activeSection === 'general' && (
						<SystemSettingsGeneralSection
							config={generalConfig}
							schema={DefaultConfigGeneral.config}
						/>
					)}
					{activeSection === 'keybinds' && (
						<SystemSettingsKeybindsSection
							config={keybindConfig}
							schema={DefaultConfigKeybinds.config}
						/>
					)}
					{activeSection === 'ai' && (
						<SystemSettingsAISection
							config={aiConfig}
							schema={DefaultConfigAI.config}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

export default defineComponent(SystemSettings, {
	name: 'system_settings',
	slug: 'system-settings',
	react_behavior: 'system_settings',
});
