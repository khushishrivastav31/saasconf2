/**
 * Portal Language State
 *
 * Manages the current portal language with localStorage persistence.
 */
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'training-portal-lang';

export function usePortalLanguage(defaultLang = 'en') {
  const [lang, setLangState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || defaultLang;
    } catch {
      return defaultLang;
    }
  });

  const setLang = useCallback((newLang: string) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch {
      // localStorage not available
    }
  }, []);

  return { lang, setLang };
}
