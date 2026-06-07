import { SlidersHorizontal, Keyboard, Bot } from 'lucide-react';

import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';

export type SettingsSectionId = 'general' | 'keybinds' | 'ai';

type SettingsSidebarItem = {
    id: SettingsSectionId;
    label: string;
    icon: typeof SlidersHorizontal;
};

const SIDEBAR_ITEMS: SettingsSidebarItem[] = [
    { id: 'general', label: 'General', icon: SlidersHorizontal },
    { id: 'keybinds', label: 'Keybinds', icon: Keyboard },
    { id: 'ai', label: 'AI', icon: Bot },
];

type SettingsSidebarProps = {
    activeSection: SettingsSectionId;
    onSelectSection: (id: SettingsSectionId) => void;
};

export function SettingsSidebar({ activeSection, onSelectSection }: SettingsSidebarProps) {
    const { targets } = useAceTheme();

    return (
        <nav className="flex shrink-0 flex-col gap-4 p-0 min-w-[180px]">
            {/* <div className="px-3 py-2 text-xs uppercase tracking-[0.24em] text-zinc-500">
                Sections
            </div> */}
            {SIDEBAR_ITEMS.map((item) => {
                const isActive = activeSection === item.id;
                const Icon = item.icon;

                return (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectSection(item.id)}
                        className={[
                            'flex gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                            isActive
                                ? [targets.container.third, ' text-zinc-100 font-medium'].join(' ')
                                : [
                                      targets.container.third,
                                      'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
                                  ].join(' '),
                        ].join(' ')}
                    >
                        <Icon size={16} />
                        <span>{item.label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
