/**
 * Policies Settings Tab
 *
 * Manages conference legal/compliance policies:
 * - Privacy Policy, Cookies Policy, Imprint, Terms & Conditions, Code of Conduct
 * Each can be an external URL or inline rich text content.
 */
import { useState, useEffect, useCallback, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import type { Conference } from '../../../../types';
import { DirtyContext } from '../../DirtyContext';

interface PolicyEntry {
  type: 'url' | 'content' | null;
  url: string | null;
  content: string | null;
  enabled: boolean;
}

interface PoliciesSettings {
  privacy_policy: PolicyEntry;
  cookies_policy: PolicyEntry;
  imprint: PolicyEntry;
  terms_and_conditions: PolicyEntry;
  code_of_conduct: PolicyEntry;
}

interface PoliciesTabProps {
  conference: Conference;
  isAdmin: boolean;
}

const POLICY_LABELS: Record<string, { label: string; description: string }> = {
  privacy_policy: {
    label: 'Privacy Policy',
    description: 'Data protection and privacy information for attendees.',
  },
  cookies_policy: {
    label: 'Cookies Policy',
    description: 'Information about cookie usage on the registration portal.',
  },
  imprint: {
    label: 'Imprint',
    description: 'Legal notice with company/organization details (required in some jurisdictions).',
  },
  terms_and_conditions: {
    label: 'Terms and Conditions',
    description:
      'Registration terms that attendees must accept. When enabled, a consent checkbox is shown during registration.',
  },
  code_of_conduct: {
    label: 'Code of Conduct',
    description: 'Expected behavior standards for conference participants.',
  },
};

const POLICY_ORDER = [
  'privacy_policy',
  'cookies_policy',
  'imprint',
  'terms_and_conditions',
  'code_of_conduct',
] as const;

const DEFAULT_ENTRY: PolicyEntry = { type: null, url: null, content: null, enabled: false };

function PolicyCard({
  policyKey,
  entry,
  onChange,
  disabled,
}: {
  policyKey: string;
  entry: PolicyEntry;
  onChange: (key: string, entry: PolicyEntry) => void;
  disabled: boolean;
}) {
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
        <label className="relative inline-flex items-center cursor-pointer ml-3 flex-shrink-0">
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

export default function PoliciesTab({ conference, isAdmin }: PoliciesTabProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Fetch policies
  const { data: policies, isLoading } = useQuery<PoliciesSettings>({
    queryKey: [...queryKeys.conferences.detail(conference.id), 'policies'],
    queryFn: async () => {
      const res = await api.get(`/conferences/${conference.id}/settings/policies`);
      return res.data;
    },
  });

  // Local state for editing
  const [localPolicies, setLocalPolicies] = useState<Record<string, PolicyEntry>>({});
  const [isDirty, setIsDirty] = useState(false);

  const reportDirty = useContext(DirtyContext);
  useEffect(() => {
    reportDirty(isDirty);
    return () => reportDirty(false);
  }, [isDirty, reportDirty]);

  useEffect(() => {
    if (policies) {
      const entries: Record<string, PolicyEntry> = {};
      for (const key of POLICY_ORDER) {
        entries[key] = (policies as unknown as Record<string, PolicyEntry>)[key] || {
          ...DEFAULT_ENTRY,
        };
      }
      setLocalPolicies(entries);
      setIsDirty(false);
    }
  }, [policies]);

  const handleChange = useCallback((key: string, entry: PolicyEntry) => {
    setLocalPolicies((prev) => ({ ...prev, [key]: entry }));
    setIsDirty(true);
  }, []);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, PolicyEntry>) => {
      const res = await api.put(`/conferences/${conference.id}/settings/policies`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.conferences.detail(conference.id), 'policies'],
      });
      showToast('Policies saved successfully', 'success');
      setIsDirty(false);
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
    },
  });

  const handleSave = () => {
    saveMutation.mutate(localPolicies);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Policies</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Configure legal and compliance policies displayed on the registration portal.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty || saveMutation.isPending || !isAdmin}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Policy cards */}
      {POLICY_ORDER.map((key) => (
        <PolicyCard
          key={key}
          policyKey={key}
          entry={localPolicies[key] || DEFAULT_ENTRY}
          onChange={handleChange}
          disabled={!isAdmin}
        />
      ))}

      {/* Info box */}
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-3">
          <svg
            className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">How policies are displayed</p>
            <ul className="list-disc list-inside space-y-1 text-blue-600 dark:text-blue-400">
              <li>Enabled policies appear as links in the registration portal footer.</li>
              <li>External URL policies open in a new browser tab.</li>
              <li>Inline content policies open in a modal dialog.</li>
              <li>
                When Terms and Conditions are enabled, a consent checkbox is required during
                registration.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
