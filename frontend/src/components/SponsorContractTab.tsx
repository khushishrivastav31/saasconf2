import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../config/api';
import type {
  Sponsor,
  SponsorContract,
  SponsorContractVersion,
  ContractStatus,
  LocationContactPerson,
} from '../types';
import { parseApiError } from '../utils/apiError';
import RichTextEditor from './common/RichTextEditor';
import AlertDialog from './AlertDialog';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<ContractStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  signed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

function ContractStatusBadge({
  status,
  onChange,
}: {
  status: ContractStatus;
  onChange: (s: ContractStatus) => void;
}) {
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value as ContractStatus)}
      className={`text-xs font-medium rounded-full px-2.5 py-0.5 border-0 cursor-pointer ${STATUS_STYLES[status]}`}
    >
      <option value="draft">Draft</option>
      <option value="sent">Sent</option>
      <option value="signed">Signed</option>
    </select>
  );
}

// ---------------------------------------------------------------------------
// Send Contract Modal
// ---------------------------------------------------------------------------

function SendContractModal({
  open,
  onClose,
  onSendSuccess,
  sponsor,
  contract,
  conferenceId,
}: {
  open: boolean;
  onClose: () => void;
  onSendSuccess: (message: string) => void;
  sponsor: Sponsor;
  contract: SponsorContract;
  conferenceId: string;
}) {
  const queryClient = useQueryClient();
  const contacts: LocationContactPerson[] = sponsor.contact_persons || [];

  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const [extraEmail, setExtraEmail] = useState('');
  const [extraEmails, setExtraEmails] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [sendAsPdf, setSendAsPdf] = useState(contract.is_editable);

  // Fetch rendered template when modal opens
  const { data: preview, isLoading: isLoadingTemplate } = useQuery<{
    subject: string;
    body_html: string;
  }>({
    queryKey: ['sponsor-contract-send-preview', conferenceId, sponsor.id],
    queryFn: async () => {
      const res = await api.get(
        `/conferences/${conferenceId}/sponsors/${sponsor.id}/contract/send-preview`
      );
      return res.data;
    },
    enabled: open,
    staleTime: 0,
  });

  // Populate form fields when template loads
  useEffect(() => {
    if (preview && open) {
      setSubject(preview.subject);
      setBodyHtml(preview.body_html);
    }
  }, [preview, open]);

  const toggleContact = (idx: number) => {
    setSelectedContacts((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const addExtraEmail = () => {
    const trimmed = extraEmail.trim();
    if (trimmed && !extraEmails.includes(trimmed)) {
      setExtraEmails([...extraEmails, trimmed]);
      setExtraEmail('');
    }
  };

  const removeExtraEmail = (email: string) => {
    setExtraEmails((prev) => prev.filter((e) => e !== email));
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(
        `/conferences/${conferenceId}/sponsors/${sponsor.id}/contract/send`,
        {
          recipient_emails: extraEmails,
          subject,
          body_html: bodyHtml,
          include_contact_persons: selectedContacts,
          send_as_pdf: sendAsPdf,
        }
      );
      return res.data;
    },
    onSuccess: () => {
      // Build recipient list from current state before closing
      const recipientList: string[] = [];
      for (const idx of selectedContacts) {
        const cp = contacts[idx];
        if (cp) recipientList.push(cp.email || `${cp.first_name} ${cp.last_name}`);
      }
      recipientList.push(...extraEmails);

      queryClient.invalidateQueries({
        queryKey: ['sponsor-contract', conferenceId, sponsor.id],
      });
      onSendSuccess(`Contract sent to ${recipientList.join(', ')}`);
      onClose();
    },
  });

  const totalRecipients = selectedContacts.length + extraEmails.length;

  return (
    <Modal open={open} onClose={onClose} title="Send Contract" size="max-w-3xl">
      <div className="px-6 py-4 space-y-4">
        {/* Contacts */}
        {contacts.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Sponsor Contacts
            </label>
            <div className="space-y-1">
              {contacts.map((cp, idx) => (
                <label
                  key={idx}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    checked={selectedContacts.includes(idx)}
                    onChange={() => toggleContact(idx)}
                    className="h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded"
                  />
                  <span>
                    {cp.first_name} {cp.last_name}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">{cp.email}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Extra emails */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Additional Email Addresses
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={extraEmail}
              onChange={(e) => setExtraEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addExtraEmail();
                }
              }}
              placeholder="email@example.com"
              className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
            <button
              type="button"
              onClick={addExtraEmail}
              className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-100"
            >
              Add
            </button>
          </div>
          {extraEmails.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {extraEmails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeExtraEmail(email)}
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        {/* Email body (rendered template, editable) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email Body
          </label>
          {isLoadingTemplate ? (
            <div className="flex items-center justify-center py-8 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900">
              <svg
                className="animate-spin h-5 w-5 text-gray-400 mr-2"
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
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-sm text-gray-500 dark:text-gray-400">Loading template...</span>
            </div>
          ) : (
            <RichTextEditor value={bodyHtml} onChange={setBodyHtml} rows={14} />
          )}
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Pre-filled from the Sponsor Contract email template. Edit as needed before sending.
          </p>
        </div>

        {/* Send as PDF */}
        {contract.is_editable && (
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={sendAsPdf}
              onChange={(e) => setSendAsPdf(e.target.checked)}
              className="h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded"
            />
            Attach contract as PDF
          </label>
        )}

        {/* Error */}
        {sendMutation.isError && (
          <p className="text-sm text-red-600">
            {parseApiError(sendMutation.error, 'Failed to send. Please try again.')}
          </p>
        )}
      </div>

      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => sendMutation.mutate()}
          disabled={totalRecipients === 0 || sendMutation.isPending || !subject}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sendMutation.isPending
            ? 'Sending...'
            : `Send to ${totalRecipients} recipient${totalRecipients !== 1 ? 's' : ''}`}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Tab Component
// ---------------------------------------------------------------------------

export default function SponsorContractTab({
  sponsor,
  conferenceId,
}: {
  sponsor: Sponsor;
  conferenceId: string;
}) {
  const queryClient = useQueryClient();
  const [editedHtml, setEditedHtml] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const basePath = `/conferences/${conferenceId}/sponsors/${sponsor.id}/contract`;

  // Fetch contract
  const {
    data: contract,
    isLoading,
    error: fetchError,
  } = useQuery<SponsorContract>({
    queryKey: ['sponsor-contract', conferenceId, sponsor.id],
    queryFn: async () => {
      const res = await api.get(basePath);
      return res.data;
    },
    retry: (count, error) => {
      // Don't retry 404s (no contract yet)
      if (
        error &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 404
      )
        return false;
      return count < 2;
    },
  });

  // Fetch versions
  const { data: versions } = useQuery<SponsorContractVersion[]>({
    queryKey: ['sponsor-contract-versions', conferenceId, sponsor.id],
    queryFn: async () => {
      const res = await api.get(`${basePath}/versions`);
      return res.data;
    },
    enabled: !!contract,
  });

  // Reset edited HTML when contract changes
  const onContractLoad = useCallback(
    (c: SponsorContract | undefined) => {
      if (c && editedHtml === null) {
        // Don't reset if user is editing
      }
    },
    [editedHtml]
  );
  if (contract) onContractLoad(contract);

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: async (force: boolean) => {
      const res = await api.post(`${basePath}/generate`, null, {
        params: { force },
      });
      return res.data;
    },
    onSuccess: () => {
      setEditedHtml(null);
      queryClient.invalidateQueries({
        queryKey: ['sponsor-contract', conferenceId, sponsor.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['sponsor-contract-versions', conferenceId, sponsor.id],
      });
    },
  });

  // Save content mutation
  const saveMutation = useMutation({
    mutationFn: async (html: string) => {
      const res = await api.put(`${basePath}/content`, {
        html_content: html,
      });
      return res.data;
    },
    onMutate: () => setSaveStatus('saving'),
    onSuccess: () => {
      setSaveStatus('saved');
      setEditedHtml(null);
      queryClient.invalidateQueries({
        queryKey: ['sponsor-contract', conferenceId, sponsor.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['sponsor-contract-versions', conferenceId, sponsor.id],
      });
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: () => setSaveStatus('error'),
  });

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: async (status: ContractStatus) => {
      const res = await api.put(`${basePath}/status`, { status });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['sponsor-contract', conferenceId, sponsor.id],
      });
    },
  });

  // Download helpers
  const handleDownload = async () => {
    const res = await api.get(`${basePath}/download`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    const filename = contract?.filename || 'contract';
    a.download = contract?.is_editable ? `${filename}.docx` : filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    const res = await api.get(`${basePath}/pdf`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contract?.filename || 'contract'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleVersionDownload = async (version: SponsorContractVersion) => {
    const res = await api.get(`${basePath}/versions/${version.version}/download`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = version.html_content ? `${version.filename}.docx` : version.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = () => {
    if (editedHtml !== null) {
      saveMutation.mutate(editedHtml);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg
          className="animate-spin h-6 w-6 text-gray-400 dark:text-gray-500"
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
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // State A: No package assigned
  // -----------------------------------------------------------------------
  if (!sponsor.sponsor_package_id) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Assign a sponsor package with a contract template to generate a contract.
        </p>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // State B: No contract yet (404 or error)
  // -----------------------------------------------------------------------
  if (!contract || fetchError) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 mb-4">
          No contract has been generated yet for this sponsor.
        </p>
        <button
          type="button"
          onClick={() => generateMutation.mutate(false)}
          disabled={generateMutation.isPending}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {generateMutation.isPending ? (
            <>
              <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Generating...
            </>
          ) : (
            'Generate Contract'
          )}
        </button>
        {generateMutation.isError && (
          <p className="mt-2 text-sm text-red-600">
            {(generateMutation.error as { response?: { data?: { detail?: string } } })?.response
              ?.data?.detail ||
              'Failed to generate contract. Make sure the package has a contract template.'}
          </p>
        )}
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // State C: Contract exists
  // -----------------------------------------------------------------------
  const hasHtmlContent = !!contract.html_content;
  const isPackageMismatch = contract.source_package_id !== sponsor.sponsor_package_id;
  const currentHtml = editedHtml !== null ? editedHtml : contract.html_content || '';
  const hasUnsavedChanges = editedHtml !== null && editedHtml !== contract.html_content;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {contract.filename}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">v{contract.version}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            ({formatFileSize(contract.file_size)})
          </span>
          <ContractStatusBadge
            status={contract.status as ContractStatus}
            onChange={(s) => statusMutation.mutate(s)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Download
          </button>
          {hasHtmlContent && (
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Download PDF
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSendModal(true)}
            className="px-2.5 py-1 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => setShowRegenerateConfirm(true)}
            className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100"
          >
            Regenerate
          </button>
        </div>
      </div>

      {/* Package mismatch warning */}
      {isPackageMismatch && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-sm text-amber-700">
            This contract was generated from a different package. Click <strong>Regenerate</strong>{' '}
            to create a new contract from the current package template.
          </p>
        </div>
      )}

      {/* Content area */}
      {contract.is_editable && hasHtmlContent ? (
        <div>
          <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
            <RichTextEditor
              value={currentHtml}
              onChange={(html) => setEditedHtml(html)}
              rows={12}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {hasUnsavedChanges && (
                <span className="text-amber-600 font-medium">Unsaved changes</span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-green-600">Saved (new version created)</span>
              )}
              {saveStatus === 'error' && <span className="text-red-600">Save failed</span>}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasUnsavedChanges || saveStatus === 'saving'}
              className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveStatus === 'saving' ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-center">
          <svg
            className="mx-auto h-8 w-8 text-gray-400 dark:text-gray-500 mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
            />
          </svg>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This PDF contract cannot be edited in the browser. Use <strong>Download</strong> to view
            it.
          </p>
        </div>
      )}

      {/* Version history */}
      {versions && versions.length > 0 && (
        <div>
          <button
            type="button"
            className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
            onClick={(e) => {
              const el = (e.target as HTMLElement).nextElementSibling;
              if (el) el.classList.toggle('hidden');
            }}
          >
            Version History ({versions.length})
          </button>
          <div className="mt-2 hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-1.5 pr-4 font-medium text-gray-500 dark:text-gray-400">
                    Version
                  </th>
                  <th className="text-left py-1.5 pr-4 font-medium text-gray-500 dark:text-gray-400">
                    Date
                  </th>
                  <th className="text-left py-1.5 pr-4 font-medium text-gray-500 dark:text-gray-400">
                    Size
                  </th>
                  <th className="text-right py-1.5 font-medium text-gray-500 dark:text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 pr-4 text-gray-900 dark:text-gray-100">v{v.version}</td>
                    <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">
                      {new Date(v.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">
                      {formatFileSize(v.file_size)}
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleVersionDownload(v)}
                        className="text-primary-600 hover:text-primary-700 text-xs font-medium"
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Send history */}
      {contract.sent_to && contract.sent_to.length > 0 && (
        <div>
          <button
            type="button"
            className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
            onClick={(e) => {
              const el = (e.target as HTMLElement).nextElementSibling;
              if (el) el.classList.toggle('hidden');
            }}
          >
            Send History ({contract.sent_to.length})
          </button>
          <div className="mt-2 hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-1.5 pr-4 font-medium text-gray-500 dark:text-gray-400">
                    Email
                  </th>
                  <th className="text-left py-1.5 pr-4 font-medium text-gray-500 dark:text-gray-400">
                    Version
                  </th>
                  <th className="text-left py-1.5 font-medium text-gray-500 dark:text-gray-400">
                    Sent At
                  </th>
                </tr>
              </thead>
              <tbody>
                {contract.sent_to.map((entry, idx) => (
                  <tr key={idx} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 pr-4 text-gray-900 dark:text-gray-100">{entry.email}</td>
                    <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">
                      v{entry.version}
                    </td>
                    <td className="py-1.5 text-gray-500 dark:text-gray-400">
                      {new Date(entry.sent_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Send modal */}
      <SendContractModal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        onSendSuccess={(msg) => setSuccessMessage(msg)}
        sponsor={sponsor}
        contract={contract}
        conferenceId={conferenceId}
      />

      {/* Send success popup */}
      <AlertDialog
        open={!!successMessage}
        title="Contract Sent"
        message={successMessage || ''}
        variant="success"
        onClose={() => setSuccessMessage(null)}
      />

      {/* Regenerate confirmation */}
      <ConfirmDialog
        open={showRegenerateConfirm}
        title="Regenerate Contract"
        message="This will replace the current contract content with the package template. The current version will be saved in version history. Continue?"
        confirmLabel="Regenerate"
        onConfirm={() => {
          setShowRegenerateConfirm(false);
          generateMutation.mutate(true);
        }}
        onCancel={() => setShowRegenerateConfirm(false)}
      />
    </div>
  );
}
