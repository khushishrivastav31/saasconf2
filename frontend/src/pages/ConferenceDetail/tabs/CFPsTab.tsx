import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useSaveStatus } from '../../../hooks/useSaveStatus';
import type { Conference, CallForPapers, CFPCreate, PaginatedResponse } from '../../../types';
import { parseApiError } from '../../../utils/apiError';
import RichTextEditor from '../../../components/common/RichTextEditor';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';

type RichTextTab =
  | 'code_of_conduct'
  | 'incentives_conditions'
  | 'tips_for_submission'
  | 'guidelines_for_submissions'
  | 'faqs';

const RICH_TEXT_TABS: { key: RichTextTab; label: string }[] = [
  { key: 'code_of_conduct', label: 'Code of Conduct' },
  { key: 'incentives_conditions', label: 'Incentives & Conditions' },
  { key: 'tips_for_submission', label: 'Tips for a Strong Submission' },
  { key: 'guidelines_for_submissions', label: 'Guidelines for Submissions' },
  { key: 'faqs', label: 'FAQs' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'review', label: 'Review' },
  { value: 'completed', label: 'Completed' },
];

function toLocalDatetime(isoStr: string | null): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  } catch {
    return '';
  }
}

interface CFPFormState {
  title: string;
  description: string;
  status: string;
  open_date: string;
  close_date: string;
  notification_date: string;
  program_announcement_date: string;
  max_submissions_per_speaker: string;
  required_speaker_fields: string[];
  is_anonymous_review: boolean;
  reviewers_per_paper: string;
  code_of_conduct: string;
  incentives_conditions: string;
  tips_for_submission: string;
  guidelines_for_submissions: string;
  faqs: string;
}

function cfpToForm(cfp: CallForPapers): CFPFormState {
  return {
    title: cfp.title,
    description: cfp.description || '',
    status: cfp.status,
    open_date: toLocalDatetime(cfp.open_date),
    close_date: toLocalDatetime(cfp.close_date),
    notification_date: toLocalDatetime(cfp.notification_date),
    program_announcement_date: toLocalDatetime(cfp.program_announcement_date),
    max_submissions_per_speaker:
      cfp.max_submissions_per_speaker != null ? String(cfp.max_submissions_per_speaker) : '',
    required_speaker_fields: cfp.required_speaker_fields || [],
    is_anonymous_review: cfp.is_anonymous_review,
    reviewers_per_paper: cfp.reviewers_per_paper != null ? String(cfp.reviewers_per_paper) : '3',
    code_of_conduct: cfp.code_of_conduct || '',
    incentives_conditions: cfp.incentives_conditions || '',
    tips_for_submission: cfp.tips_for_submission || '',
    guidelines_for_submissions: cfp.guidelines_for_submissions || '',
    faqs: cfp.faqs || '',
  };
}

function emptyForm(): CFPFormState {
  return {
    title: '',
    description: '',
    status: 'draft',
    open_date: '',
    close_date: '',
    notification_date: '',
    program_announcement_date: '',
    max_submissions_per_speaker: '',
    required_speaker_fields: [],
    is_anonymous_review: false,
    reviewers_per_paper: '3',
    code_of_conduct: '',
    incentives_conditions: '',
    tips_for_submission: '',
    guidelines_for_submissions: '',
    faqs: '',
  };
}

export default function ConferenceCFPsTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CFPFormState>(emptyForm());
  const [activeRichTab, setActiveRichTab] = useState<RichTextTab>('code_of_conduct');
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();

  const { data, isLoading } = useQuery({
    queryKey: ['conference-cfps', conference.id],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CallForPapers>>(
        `/conferences/${conference.id}/cfps`
      );
      return response.data;
    },
  });

  const cfp = data?.items?.[0] || null;

  // Sync form state when cfp data loads
  useEffect(() => {
    if (cfp) {
      setForm(cfpToForm(cfp));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfp?.id, cfp?.updated_at]);

  const createMutation = useMutation({
    mutationFn: async (payload: CFPCreate) => {
      await api.post('/cfp', payload);
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({
        queryKey: ['conference-cfps', conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ['all-cfps'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create CFP'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      await api.put(`/cfp/${cfp!.id}`, payload);
    },
    onSuccess: () => {
      setError(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      setSaved();
      queryClient.invalidateQueries({
        queryKey: ['conference-cfps', conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ['all-cfps'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to save CFP'));
      setSaveError();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/conferences/${conference.id}/cfps/${cfp!.id}`);
      await api.delete(`/cfp/${cfp!.id}`);
    },
    onSuccess: () => {
      setError(null);
      setShowDeleteConfirm(false);
      setForm(emptyForm());
      queryClient.invalidateQueries({
        queryKey: ['conference-cfps', conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ['all-cfps'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to delete CFP'));
      setShowDeleteConfirm(false);
    },
  });

  const handleCreate = () => {
    createMutation.mutate({
      title: 'Call for Papers',
      conference_id: conference.id,
    });
  };

  const handleSave = () => {
    if (!cfp) return;
    setSaving();
    const payload: Record<string, unknown> = {
      title: form.title,
      description: form.description || null,
      status: form.status,
      open_date: form.open_date || null,
      close_date: form.close_date || null,
      notification_date: form.notification_date || null,
      program_announcement_date: form.program_announcement_date || null,
      max_submissions_per_speaker: form.max_submissions_per_speaker
        ? Number(form.max_submissions_per_speaker)
        : null,
      required_speaker_fields: form.required_speaker_fields,
      is_anonymous_review: form.is_anonymous_review,
      reviewers_per_paper: form.reviewers_per_paper ? Number(form.reviewers_per_paper) : 3,
      code_of_conduct: form.code_of_conduct || null,
      incentives_conditions: form.incentives_conditions || null,
      tips_for_submission: form.tips_for_submission || null,
      guidelines_for_submissions: form.guidelines_for_submissions || null,
      faqs: form.faqs || null,
    };
    updateMutation.mutate(payload);
  };

  const updateField = <K extends keyof CFPFormState>(key: K, value: CFPFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // --- Loading state ---
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // --- Empty state ---
  if (!cfp) {
    return (
      <div>
        <ErrorBanner message={error} />
        <div className="text-center py-16 bg-gray-50 rounded-lg border border-gray-200">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          <h3 className="mt-3 text-sm font-medium text-gray-900">No Call for Papers</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create a Call for Papers to start collecting session proposals.
          </p>
          {isAdmin && (
            <div className="mt-6">
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Call for Papers'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Detail view ---
  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />

      {/* Title + Status row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => updateField('title', e.target.value)}
            className="block w-full h-10 border border-gray-300 rounded-md shadow-sm px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={form.status}
            onChange={(e) => updateField('status', e.target.value)}
            className="block w-full h-10 border border-gray-300 rounded-md shadow-sm px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Public CFP Link */}
      {conference.tenant_slug && conference.abbreviation && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Public CFP Link</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/${conference.tenant_slug}/portal/${conference.abbreviation}`}
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm bg-gray-50 text-gray-600"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/${conference.tenant_slug}/portal/${conference.abbreviation}`
                );
              }}
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              title="Copy to clipboard"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>
            <a
              href={`${window.location.origin}/${conference.tenant_slug}/portal/${conference.abbreviation}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              title="Open in new tab"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>
        </div>
      )}

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <RichTextEditor
          value={form.description}
          onChange={(html) => updateField('description', html)}
          rows={3}
        />
      </div>

      {/* Dates section */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Dates</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Open Date</label>
            <input
              type="datetime-local"
              value={form.open_date}
              onChange={(e) => {
                const newOpen = e.target.value;
                updateField('open_date', newOpen);
                if (form.close_date && newOpen && form.close_date < newOpen) {
                  updateField('close_date', newOpen);
                }
              }}
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Close Date</label>
            <input
              type="datetime-local"
              value={form.close_date}
              min={form.open_date}
              onChange={(e) => updateField('close_date', e.target.value)}
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Notification Date
            </label>
            <input
              type="datetime-local"
              value={form.notification_date}
              onChange={(e) => updateField('notification_date', e.target.value)}
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Program Announcement
            </label>
            <input
              type="datetime-local"
              value={form.program_announcement_date}
              onChange={(e) => updateField('program_announcement_date', e.target.value)}
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Settings row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Max Submissions per Speaker
          </label>
          <input
            type="number"
            min="1"
            placeholder="Unlimited"
            value={form.max_submissions_per_speaker}
            onChange={(e) => updateField('max_submissions_per_speaker', e.target.value)}
            className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Required Speaker Profile Fields */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Required Speaker Profile Fields</h3>
        <div className="flex flex-wrap gap-4">
          {[
            { key: 'bio', label: 'Short Bio' },
            { key: 'picture', label: 'Picture' },
            { key: 'video', label: 'Video' },
            { key: 'phone', label: 'Phone' },
            { key: 'title', label: 'Title / Position' },
            { key: 'company', label: 'Company / Organization' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.required_speaker_fields.includes(key)}
                onChange={(e) => {
                  const fields = e.target.checked
                    ? [...form.required_speaker_fields, key]
                    : form.required_speaker_fields.filter((f) => f !== key);
                  updateField('required_speaker_fields', fields);
                }}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Review Settings */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Review Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Reviewers per Paper
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={form.reviewers_per_paper}
              onChange={(e) => updateField('reviewers_per_paper', e.target.value)}
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.is_anonymous_review}
                onChange={(e) => updateField('is_anonymous_review', e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Anonymous Review
            </label>
          </div>
        </div>
      </div>

      {/* Rich text tabs */}
      <div>
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6 overflow-x-auto">
            {RICH_TEXT_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveRichTab(tab.key)}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeRichTab === tab.key
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-4">
          <RichTextEditor
            key={activeRichTab}
            value={form[activeRichTab]}
            onChange={(html) => updateField(activeRichTab, html)}
            rows={8}
          />
        </div>
      </div>

      {/* Action buttons */}
      {isAdmin && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center px-3 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
          >
            Delete CFP
          </button>
          <div className="flex items-center gap-3">
            {saveSuccess && <span className="text-sm text-green-600">Saved successfully</span>}
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white transition-colors duration-200 disabled:opacity-50 ${
                saveStatus === 'saved'
                  ? 'bg-green-600 hover:bg-green-700'
                  : saveStatus === 'error'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-primary-600 hover:bg-primary-700'
              }`}
            >
              {saveStatus === 'saving' ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Saving...
                </>
              ) : saveStatus === 'saved' ? (
                <>
                  <svg
                    className="-ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Saved
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Call for Papers"
        message="Are you sure you want to delete this Call for Papers? This will also remove all associated submissions. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
