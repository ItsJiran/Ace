
export const AIProviders =  {
    OPENAI: 'openai',
    ANTHROPIC: 'anthropic',
    GOOGLE: 'google',
} as const;

export const AIProviderEnvKeys: Record<typeof AIProviders[keyof typeof AIProviders], string[]> = {
    [AIProviders.OPENAI]: ['OPENAI_API_KEY', 'OPENAI_KEY'],
    [AIProviders.ANTHROPIC]: ['ANTHROPIC_API_KEY', 'ANTHROPIC_KEY'],
    [AIProviders.GOOGLE]: ['GOOGLE_API_KEY', 'GOOGLE_KEY'],
} as const;

