import { createContext } from 'react';

/** Tabs call setIsDirty(true/false) to report unsaved changes. */
export const DirtyContext = createContext<(dirty: boolean) => void>(() => {});
