/**
 * Policies Settings Tab (Conference)
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
import PolicyCard from '../../../../components/common/PolicyCard';
import {
  type PolicyEntry,
  DEFAULT_ENTRY,
  POLICY_ORDER,
} from '../../../../components/common/policyConstants';
import type { Conference } from '../../../../types';
import { DirtyContext } from '../../DirtyContext';

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
            className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5"
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
