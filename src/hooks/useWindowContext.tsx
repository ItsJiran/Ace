import React, { createContext, useContext, type ReactNode } from 'react';

interface WindowContextValue {
    window_uid: string;
    process_uid: string;
}

const WindowContext = createContext<WindowContextValue | undefined>(undefined);

interface WindowContextProviderProps {
    children: ReactNode;
    window_uid: string;
    process_uid: string;
}

export function WindowContextProvider({ children, window_uid, process_uid }: WindowContextProviderProps) {
    return (
        <WindowContext.Provider value={{ window_uid, process_uid }}>
            {children}
        </WindowContext.Provider>
    );
}

export function useWindowContext(): WindowContextValue | undefined {
    return useContext(WindowContext);
}
