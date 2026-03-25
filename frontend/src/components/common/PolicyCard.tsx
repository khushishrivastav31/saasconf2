/**
 * Shared PolicyCard component for conference and training policy settings.
 *
 * Each policy can be toggled on/off, and configured as either an external URL
 * or inline rich text content.
 */
import { useState, useEffect, useCallback } from 'react';
import RichTextEditor from './RichTextEditor';
import { POLICY_LABELS, type PolicyEntry } from './policyConstants';

interface PolicyCardProps {
  policyKey: string;
  entry: PolicyEntry;
  onChange: (key: string, entry: PolicyEntry) => void;
  disabled: boolean;
}

export default function PolicyCard({ policyKey, entry, onChange, disabled }: PolicyCardProps) {
  const meta = POLICY_LABELS[policyKey];
  const [expanded, setExpanded] = useState(entry.enabled);

  useEffect(() => {
    if (entry.enabled) setExpanded(true);
  }, [entry.enabled]);

  const handleToggle = useCallback(() => {
    const newEnabled = !entry.enabled;
    onChange(policyKey, {
      ...entry,
      enabled: newEnabled,
      type: newEnabled && !entry.type ? 'url' : entry.type,
    });
    if (newEnabled) setExpanded(true);
  }, [entry, policyKey, onChange]);

  const handleTypeChange = useCallback(
    (type: 'url' | 'content') => {
      onChange(policyKey, { ...entry, type });
    },
    [entry, policyKey, onChange]
  );

  const handleUrlChange = useCallback(
    (url: string) => {
      onChange(policyKey, { ...entry, url });
    },
    [entry, policyKey, onChange]
  );

  const handleContentChange = useCallback(
    (content: string) => {
      onChange(policyKey, { ...entry, content });
    },
    [entry, policyKey, onChange]
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-left flex-1 min-w-0"
        >
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{meta.label}</h3>
            {!expanded && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {meta.description}
              </p>
            )}
          </div>
        </button>
        <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
          <input
            type="checkbox"
            checked={entry.enabled}
            onChange={handleToggle}
            disabled={disabled}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
          <span className="ml-2 text-xs text-gray-600 dark:text-gray-300">
            {entry.enabled ? 'Visible' : 'Hidden'}
          </span>
        </label>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 py-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">{meta.description}</p>

          {/* Type selector */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`${policyKey}-type`}
                checked={entry.type === 'url'}
                onChange={() => handleTypeChange('url')}
                disabled={disabled}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">External URL</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`${policyKey}-type`}
                checked={entry.type === 'content'}
                onChange={() => handleTypeChange('content')}
                disabled={disabled}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Inline Content</span>
            </label>
          </div>

          {/* URL input */}
          {entry.type === 'url' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                URL
              </label>
              <input
                type="url"
                value={entry.url || ''}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://example.com/privacy-policy"
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {/* Rich text editor */}
          {entry.type === 'content' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Content
              </label>
              <RichTextEditor
                value={entry.content || ''}
                onChange={handleContentChange}
                placeholder={`Enter your ${meta.label.toLowerCase()} here...`}
                rows={8}
                disabled={disabled}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
