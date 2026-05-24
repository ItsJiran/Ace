import { DefaultConfigGeneral } from '#/shared/constants/config';

import { useAceMemory } from './use-ace-memory';

export type AceThemePreference = 'light' | 'dark' | 'system';
export type AceThemeTargets = {
	shell: {
		first: string;
	};
	container: {
		first: string;
		second: string;
		third: string;
		fourth: string;
		fifth: string;
		sixth: string;
	};
	btn: {
		first: string;
		secondary: string;
		fourth: string;
		sixth: string;
	};
	input: {
		first: string;
	};
};

const ACE_THEME_TARGETS: AceThemeTargets = {
	shell: {
		first: 'ace-shell-first',
	},
	container: {
		first: 'ace-container-first',
		second: 'ace-container-second',
		third: 'ace-container-third',
		fourth: 'ace-container-fourth',
		fifth: 'ace-container-fifth',
		sixth: 'ace-container-sixth',
	},
	btn: {
		first: 'ace-btn-first',
		secondary: 'ace-btn-secondary',
		fourth: 'ace-btn-fourth',
		sixth: 'ace-btn-sixth',
	},
	input: {
		first: 'ace-input-first',
	},
};

function resolveThemePreference(value: unknown): AceThemePreference {
	if (value === 'light' || value === 'dark' || value === 'system') {
		return value;
	}

	return 'system';
}
export function useAceTheme() {
	const generalConfig = useAceMemory<Record<string, unknown>>(DefaultConfigGeneral.memory_uid) ?? {};
	const currentTheme = resolveThemePreference(generalConfig['core.theme']);

	return {
		currentTheme,
		targets: ACE_THEME_TARGETS,
	};
}

export default useAceTheme;