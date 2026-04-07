/**
 * Language Switcher
 *
 * Toggle buttons for DE/EN (or any configured languages).
 */
import React from 'react';

interface LanguageSwitcherProps {
  lang: string;
  availableLanguages: string[];
  onChangeLang: (lang: string) => void;
}

const LANG_LABELS: Record<string, string> = {
  en: 'EN',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
};

const LanguageSwitcher = React.memo(function LanguageSwitcher({
  lang,
  availableLanguages,
  onChangeLang,
}: LanguageSwitcherProps) {
  if (availableLanguages.length <= 1) return null;

  return (
    <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
      {availableLanguages.map((code) => (
        <button
          key={code}
          onClick={() => onChangeLang(code)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            lang === code
              ? 'bg-primary-600 text-white'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          {LANG_LABELS[code] || code.toUpperCase()}
        </button>
      ))}
    </div>
  );
});

export default LanguageSwitcher;
