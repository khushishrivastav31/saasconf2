import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '../../components/Modal';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import { parseApiError } from '../../utils/apiError';
import { useToast } from '../../components/Toast';
import type { PrivacyRequest, PrivacyRequestType } from './types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS = 25;

export default function NewPrivacyRequestModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (request: PrivacyRequest) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [requestType, setRequestType] = useState<PrivacyRequestType>('export');
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const reset = () => {
    setRequestType('export');
    setEmailInput('');
    setEmails([]);
    setNotes('');
    setEmailError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const tryAddEmail = () => {
    const candidate = emailInput.trim().toLowerCase();
    if (!candidate) return;
    if (!EMAIL_REGEX.test(candidate)) {
      setEmailError('Invalid email address');
      return;
    }
    if (emails.includes(candidate)) {
      setEmailError('Already added');
      return;
    }
    if (emails.length >= MAX_EMAILS) {
      setEmailError(`Maximum ${MAX_EMAILS} emails per request`);
      return;
    }
    setEmails([...emails, candidate]);
    setEmailInput('');
    setEmailError(null);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      tryAddEmail();
    }
  };

  const removeEmail = (email: string) => {
    setEmails(emails.filter((e) => e !== email));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<PrivacyRequest>('/privacy-requests', {
        request_type: requestType,
        subject_emails: emails,
        notes: notes.trim() || null,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.privacyRequests.all });
      showToast('Privacy request created', 'success');
      onCreated(data);
      reset();
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const canSubmit = emails.length > 0 && !createMutation.isPending;

  return (
    <Modal open={open} onClose={handleClose} title="New privacy request">
      <div className="px-6 py-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Request type
          </label>
          <div className="flex gap-4">
            {(['export', 'erasure'] as PrivacyRequestType[]).map((t) => (
              <label key={t} className="inline-flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="request-type"
                  value={t}
                  checked={requestType === t}
                  onChange={() => setRequestType(t)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-900 dark:text-gray-100 capitalize">
                  {t === 'export' ? 'Access / export (Art. 15)' : 'Erasure (Art. 17)'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="privacy-email-input"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Subject emails ({emails.length}/{MAX_EMAILS})
          </label>
          <div className="flex flex-wrap gap-1 mb-2">
            {emails.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 text-xs rounded"
              >
                {email}
                <button
                  type="button"
                  onClick={() => removeEmail(email)}
                  className="ml-1 text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100"
                  aria-label={`Remove ${email}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            id="privacy-email-input"
            type="email"
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              setEmailError(null);
            }}
            onKeyDown={handleKey}
            onBlur={tryAddEmail}
            placeholder="Type an email and press Enter or comma"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
          />
          {emailError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{emailError}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="privacy-notes"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Notes (optional)
          </label>
          <textarea
            id="privacy-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
            placeholder="Ticket reference, how the subject contacted us, etc."
          />
        </div>
      </div>
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleClose}
          className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => createMutation.mutate()}
          className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Creating…' : 'Create request'}
        </button>
      </div>
    </Modal>
  );
}
