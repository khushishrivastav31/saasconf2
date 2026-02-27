import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../../../config/api';
import Modal from '../../../components/Modal';
import { parseApiError } from '../../../utils/apiError';

interface SendNewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  conferenceId: string;
  articleId: string;
  articleTitle: string;
}

const PAPER_STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_evaluation', label: 'In Evaluation' },
  { value: 'final_consideration', label: 'Final Consideration' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
] as const;

export default function SendNewsModal({
  isOpen,
  onClose,
  conferenceId,
  articleId,
  articleTitle,
}: SendNewsModalProps) {
  const [allApplicants, setAllApplicants] = useState(true);
  const [paperStatus, setPaperStatus] = useState('');
  const [committeeRole, setCommitteeRole] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const resetForm = () => {
    setAllApplicants(true);
    setPaperStatus('');
    setCommitteeRole('');
    setSuccessMessage('');
    setShowConfirm(false);
  };

  const handleClose = () => {
    resetForm();
    sendMutation.reset();
    onClose();
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/conferences/${conferenceId}/news/${articleId}/send`, {
        all_applicants: allApplicants,
        paper_status: paperStatus || null,
        committee_role: committeeRole || null,
      });
      return response.data as { emails_sent: number };
    },
    onSuccess: (data) => {
      setShowConfirm(false);
      setSuccessMessage(`Email sent to ${data.emails_sent} recipients`);
      setTimeout(() => {
        handleClose();
      }, 2000);
    },
  });

  const handleSendClick = () => {
    setShowConfirm(true);
  };

  const handleConfirmSend = () => {
    setSuccessMessage('');
    sendMutation.reset();
    sendMutation.mutate();
  };

  const recipientDescription = allApplicants
    ? 'all applicants'
    : paperStatus
      ? `applicants with paper status "${PAPER_STATUS_OPTIONS.find((o) => o.value === paperStatus)?.label ?? paperStatus}"${committeeRole ? ` and committee role "${committeeRole}"` : ''}`
      : committeeRole
        ? `committee members with role "${committeeRole}"`
        : 'all applicants';

  return (
    <Modal open={isOpen} onClose={handleClose} title="Send News Article" size="max-w-lg">
      <div className="px-6 py-4 space-y-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Sending article:</p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
            {articleTitle}
          </p>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allApplicants}
              onChange={(e) => {
                setAllApplicants(e.target.checked);
                if (e.target.checked) {
                  setPaperStatus('');
                }
              }}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              All applicants
            </span>
          </label>

          <div>
            <label
              htmlFor="send-news-paper-status"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Filter by paper status
            </label>
            <select
              id="send-news-paper-status"
              value={paperStatus}
              onChange={(e) => setPaperStatus(e.target.value)}
              disabled={allApplicants}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">All statuses</option>
              {PAPER_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="send-news-committee-role"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Filter by committee role{' '}
              <span className="text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <input
              id="send-news-committee-role"
              type="text"
              value={committeeRole}
              onChange={(e) => setCommitteeRole(e.target.value)}
              placeholder="e.g. Reviewer, Chair"
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>

        {/* Confirmation warning */}
        {showConfirm && !successMessage && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-4">
            <div className="flex gap-3">
              <svg
                className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Are you sure you want to send this email?
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  This will send &quot;{articleTitle}&quot; to{' '}
                  <strong>{recipientDescription}</strong>. This action cannot be undone.
                </p>
              </div>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="rounded-md bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 p-3">
            <p className="text-sm text-green-800 dark:text-green-300">{successMessage}</p>
          </div>
        )}

        {sendMutation.isError && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3">
            <p className="text-sm text-red-800 dark:text-red-300">
              {parseApiError(sendMutation.error, 'Failed to send emails')}
            </p>
          </div>
        )}
      </div>

      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
        <button
          type="button"
          onClick={showConfirm ? () => setShowConfirm(false) : handleClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          {showConfirm ? 'Back' : 'Cancel'}
        </button>
        {showConfirm ? (
          <button
            type="button"
            onClick={handleConfirmSend}
            disabled={sendMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 border border-transparent rounded-md shadow-sm hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendMutation.isPending ? 'Sending...' : 'Yes, Send Emails'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSendClick}
            disabled={sendMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        )}
      </div>
    </Modal>
  );
}
