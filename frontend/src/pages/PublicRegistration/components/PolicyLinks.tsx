/**
 * PolicyLinks — displays enabled policies as footer links in the registration portal.
 *
 * - URL policies open in a new tab.
 * - Content policies open in a modal dialog.
 */
import { useState, useCallback } from 'react';
import type { PolicyEntry } from '../../../types/publicRegistration';
import PolicyModal from './PolicyModal';

const POLICY_LABELS: Record<string, string> = {
  privacy_policy: 'Privacy Policy',
  cookies_policy: 'Cookies Policy',
  imprint: 'Imprint',
  terms_and_conditions: 'Terms & Conditions',
  code_of_conduct: 'Code of Conduct',
};

const POLICY_DISPLAY_ORDER = [
  'privacy_policy',
  'cookies_policy',
  'imprint',
  'terms_and_conditions',
  'code_of_conduct',
];

interface PolicyLinksProps {
  policies: Record<string, PolicyEntry> | null | undefined;
  className?: string;
}

export default function PolicyLinks({ policies, className = '' }: PolicyLinksProps) {
  const [modalPolicy, setModalPolicy] = useState<{ title: string; content: string } | null>(null);

  const handleContentClick = useCallback((key: string, content: string) => {
    setModalPolicy({ title: POLICY_LABELS[key] || key, content });
  }, []);

  if (!policies) return null;

  const enabledPolicies = POLICY_DISPLAY_ORDER.filter((key) => policies[key]);

  if (enabledPolicies.length === 0) return null;

  return (
    <>
      <div
        className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-500 ${className}`}
      >
        {enabledPolicies.map((key) => {
          const entry = policies[key];
          const label = POLICY_LABELS[key] || key;

          if (entry.type === 'url' && entry.url) {
            return (
              <a
                key={key}
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-700 hover:underline transition-colors"
              >
                {label}
              </a>
            );
          }

          if (entry.type === 'content' && entry.content) {
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleContentClick(key, entry.content!)}
                className="hover:text-gray-700 hover:underline transition-colors cursor-pointer"
              >
                {label}
              </button>
            );
          }

          return null;
        })}
      </div>

      {modalPolicy && (
        <PolicyModal
          title={modalPolicy.title}
          content={modalPolicy.content}
          onClose={() => setModalPolicy(null)}
        />
      )}
    </>
  );
}
