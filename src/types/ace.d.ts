// src/types/ace.d.ts
import React from 'react';
import ReactDOM from 'react-dom';
import { useAceMemory } from '../hooks/useAceMemory';
import { EventPattern } from '../schemas/events';

declare global {
    interface Window {
        ACE: {
            react: typeof React;
            reactDOM: typeof ReactDOM;
            config: {
                defineRegistry: (registryMap: Record<string, any>) => void;
                definePackage: (packageConfig: any) => void;
            };
            memory: {
                use: typeof useAceMemory;
                write: (key: string, value: any) => void;
                createId: (prefix: string) => string;
            };
            events: {
                emit: (event: EventPattern) => void;
            };
            registry: {
                add: (packageName: string, domain: string, items: any[]) => void;
            };
        };
    }
}

export {};