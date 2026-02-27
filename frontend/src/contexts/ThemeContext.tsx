import { createContext, useCallback, useEffect, useState } from 'react';

type ThemePreference = 'light' | 'dark' | null;
type EffectiveTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: EffectiveTheme;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
  syncFromServer: (pref: ThemePreference) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext<ThemeContextType | null>(null);

function getSystemTheme(): EffectiveTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(pref: ThemePreference): EffectiveTheme {
  return pref ?? getSystemTheme();
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem('theme-preference');
    if (saved === 'light' || saved === 'dark') return saved;
    return null;
  });

  // Track system theme changes for re-render when preference is null
  const [, setSystemTheme] = useState<EffectiveTheme>(getSystemTheme);

  const theme = resolveTheme(preference);

  // Apply .dark class to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Listen for OS theme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setSystemTheme(getSystemTheme());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const persistToStorage = useCallback((pref: ThemePreference) => {
    if (pref === null) {
      localStorage.removeItem('theme-preference');
    } else {
      localStorage.setItem('theme-preference', pref);
    }
  }, []);

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      setPreferenceState(pref);
      persistToStorage(pref);
    },
    [persistToStorage]
  );

  const toggleTheme = useCallback(() => {
    const newTheme: EffectiveTheme = theme === 'dark' ? 'light' : 'dark';
    setPreference(newTheme);
  }, [theme, setPreference]);

  const syncFromServer = useCallback(
    (pref: ThemePreference) => {
      setPreferenceState(pref);
      persistToStorage(pref);
    },
    [persistToStorage]
  );

  return (
    <ThemeContext.Provider
      value={{ theme, preference, setPreference, toggleTheme, syncFromServer }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
