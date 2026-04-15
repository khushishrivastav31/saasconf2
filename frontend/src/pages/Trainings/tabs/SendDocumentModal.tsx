/**
 * SendDocumentModal — Email sending modal for offer documents.
 * Extracted from OfferDocumentsSection.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';
import { parseApiError } from '../../../utils/apiError';
import { validateEmail } from '../../../utils/validators';
import { queryKeys } from '../../../config/queryKeys';
import RichTextEditor from '../../../components/common/RichTextEditor';
import type { OfferDocument } from '../../../types/training';

const SendModal = React.memo(function SendModal({
  doc,
  offerId,
  offerNumber,
  customerName,
  contactPersons,
  onClose,
}: {
  doc: OfferDocument;
  offerId: string;
  offerNumber: string;
  customerName: string;
  contactPersons: Array<{ first_name: string; last_name: string; email: string; phone?: string }>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const [extraEmail, setExtraEmail] = useState('');
  const [extraEmails, setExtraEmails] = useState<string[]>([]);
  const [subject, setSubject] = useState(`Offer ${offerNumber} - ${customerName}`);
  const [bodyHtml, setBodyHtml] = useState('');
  const [sendAsPdf, setSendAsPdf] = useState(doc.is_editable);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleAddEmail = useCallback(() => {
    const trimmed = extraEmail.trim();
    if (!trimmed) return;
    const err = validateEmail(trimmed);
    if (err) {
      setEmailError(err);
      return;
    }
    if (extraEmails.includes(trimmed)) {
      setEmailError('Already added');
      return;
    }
    setExtraEmails((prev) => [...prev, trimmed]);
    setExtraEmail('');
    setEmailError(null);
  }, [extraEmail, extraEmails]);

  const handleRemoveEmail = useCallback((email: string) => {
    setExtraEmails((prev) => prev.filter((e) => e !== email));
  }, []);

  const toggleContact = useCallback((idx: number) => {
    setSelectedContacts((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  }, []);

  const recipientEmails = useMemo(() => {
    const emails = [...extraEmails];
    for (const idx of selectedContacts) {
      const cp = contactPersons[idx];
      if (cp?.email && !emails.includes(cp.email)) {
        emails.push(cp.email);
      }
    }
    return emails;
  }, [extraEmails, selectedContacts, contactPersons]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/trainings/offers/${offerId}/documents/${doc.id}/send`, {
        recipient_emails: recipientEmails,
        subject,
        body_html: bodyHtml,
        send_as_pdf: sendAsPdf,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.offerDocuments(offerId) });
      // Also refresh offer data so status updates from draft → sent
      queryClient.invalidateQueries({ queryKey: ['customer-offers'] });
      showToast(`Document sent to ${recipientEmails.length} recipient(s)`, 'success');
      onClose();
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Send Document</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{doc.filename}</p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Contact persons checkboxes */}
          {contactPersons.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Contact Persons
              </label>
              <div className="space-y-1">
                {contactPersons.map((cp, idx) => (
                  <label
                    key={idx}
                    className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedContacts.includes(idx)}
                      onChange={() => toggleContact(idx)}
                      className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                    />
                    {cp.first_name} {cp.last_name}
                    {cp.email && (
                      <span className="text-gray-400 dark:text-gray-500">({cp.email})</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Extra emails */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Additional Recipients
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={extraEmail}
                onChange={(e) => {
                  setExtraEmail(e.target.value);
                  setEmailError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
                placeholder="email@example.com"
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={handleAddEmail}
                className="px-3 py-2 text-sm text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30"
              >
                Add
              </button>
            </div>
            {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
            {extraEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {extraEmails.map((em) => (
                  <span
                    key={em}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    {em}
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(em)}
                      className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200"
                    >
                      x
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
              className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Message Body
            </label>
            <RichTextEditor value={bodyHtml} onChange={setBodyHtml} rows={4} />
          </div>

          {/* Send as PDF */}
          {doc.is_editable && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={sendAsPdf}
                onChange={(e) => setSendAsPdf(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              Send as PDF
            </label>
          )}

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
            disabled={recipientEmails.length === 0 || sendMutation.isPending || !subject}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendMutation.isPending
              ? 'Sending...'
              : `Send to ${recipientEmails.length} recipient${recipientEmails.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Document Card (list item)
// ---------------------------------------------------------------------------

export default SendModal;
