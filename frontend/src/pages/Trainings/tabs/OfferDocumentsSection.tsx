/**
 * OfferDocumentsSection — Documents sub-section inside the Offer detail view.
 * Follows patterns from SponsorContractTab.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';
import { parseApiError } from '../../../utils/apiError';
import { validateEmail } from '../../../utils/validators';
import { queryKeys } from '../../../config/queryKeys';
import RichTextEditor from '../../../components/common/RichTextEditor';
import type { OfferDocument, OfferDocumentVersion } from '../../../types/training';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OfferDocumentsSectionProps {
  offerId: string;
  offerNumber: string;
  customerName: string;
  contactPersons: Array<{
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DOC_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

// ---------------------------------------------------------------------------
// Send Modal
// ---------------------------------------------------------------------------

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
  contactPersons: OfferDocumentsSectionProps['contactPersons'];
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

const DocumentCard = React.memo(function DocumentCard({
  doc,
  isSelected,
  onSelect,
  onDelete,
}: {
  doc: OfferDocument;
  isSelected: boolean;
  onSelect: (doc: OfferDocument) => void;
  onDelete: (docId: string) => void;
}) {
  return (
    <div
      onClick={() => onSelect(doc)}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${
        isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
      }`}
    >
      {/* File icon */}
      <svg
        className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
        />
      </svg>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {doc.filename}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            v{doc.version}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${DOC_STATUS_COLORS[doc.status] || DOC_STATUS_COLORS.draft}`}
          >
            {doc.status}
          </span>
        </div>
        {doc.file_size && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatFileSize(doc.file_size)}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(doc.id);
        }}
        className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0"
        title="Delete document"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function OfferDocumentsSection({
  offerId,
  offerNumber,
  customerName,
  contactPersons,
}: OfferDocumentsSectionProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [isContentDirty, setIsContentDirty] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showSendHistory, setShowSendHistory] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Fetch documents list
  const { data: docsData, isLoading } = useQuery<OfferDocument[]>({
    queryKey: queryKeys.offerDocuments(offerId),
    queryFn: async () => {
      const res = await api.get(`/trainings/offers/${offerId}/documents`);
      return res.data;
    },
  });
  const documents = useMemo(() => docsData ?? [], [docsData]);

  // Fetch full document detail (with html_content) when selected
  const { data: selectedDocDetail } = useQuery<OfferDocument>({
    queryKey: queryKeys.offerDocument(offerId, selectedDocId ?? ''),
    queryFn: async () => {
      const res = await api.get(`/trainings/offers/${offerId}/documents/${selectedDocId}`);
      return res.data;
    },
    enabled: !!selectedDocId,
  });

  const selectedDoc = useMemo(() => {
    if (selectedDocDetail) return selectedDocDetail;
    return documents.find((d) => d.id === selectedDocId) ?? null;
  }, [selectedDocDetail, documents, selectedDocId]);

  // Update editor content when full doc loads
  React.useEffect(() => {
    if (selectedDocDetail?.html_content && !isContentDirty) {
      setEditContent(selectedDocDetail.html_content);
    }
  }, [selectedDocDetail, isContentDirty]);

  // Fetch versions when expanded
  const { data: versionsData } = useQuery<OfferDocumentVersion[]>({
    queryKey: queryKeys.offerDocumentVersions(offerId, selectedDocId ?? ''),
    queryFn: async () => {
      const res = await api.get(`/trainings/offers/${offerId}/documents/${selectedDocId}/versions`);
      return res.data;
    },
    enabled: showVersions && !!selectedDocId,
  });
  const versions = useMemo(() => versionsData ?? [], [versionsData]);

  const invalidateDocs = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.offerDocuments(offerId) });
    if (selectedDocId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.offerDocument(offerId, selectedDocId) });
    }
  }, [queryClient, offerId, selectedDocId]);

  // Select document
  const handleSelectDoc = useCallback((doc: OfferDocument) => {
    setSelectedDocId(doc.id);
    setEditContent(doc.html_content ?? '');
    setIsContentDirty(false);
    setShowVersions(false);
    setShowSendHistory(false);
  }, []);

  // Upload mutation
  // Fetch available offer templates
  const { data: templatesData } = useQuery<
    Array<{ id: string; name: string; language: string | null }>
  >({
    queryKey: ['offer-templates-list'],
    queryFn: async () => {
      const res = await api.get('/trainings/offer-templates', {
        params: { page_size: 100, is_active: true },
      });
      return res.data.items ?? res.data;
    },
    staleTime: 60_000,
  });
  const templates = useMemo(() => templatesData ?? [], [templatesData]);

  const createFromTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await api.post(
        `/trainings/offers/${offerId}/documents?template_id=${templateId}`
      );
      return res.data as OfferDocument;
    },
    onSuccess: (newDoc) => {
      invalidateDocs();
      showToast('Document created from template', 'success');
      handleSelectDoc(newDoc);
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  // Save content mutation
  const saveContentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDocId) return;
      const res = await api.put(`/trainings/offers/${offerId}/documents/${selectedDocId}/content`, {
        html_content: editContent,
      });
      return res.data as OfferDocument;
    },
    onSuccess: () => {
      invalidateDocs();
      showToast('Document saved', 'success');
      setIsContentDirty(false);
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      await api.delete(`/trainings/offers/${offerId}/documents/${docId}`);
    },
    onSuccess: () => {
      invalidateDocs();
      showToast('Document deleted', 'success');
      if (confirmDeleteId === selectedDocId) {
        setSelectedDocId(null);
      }
      setConfirmDeleteId(null);
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
      setConfirmDeleteId(null);
    },
  });

  const handleDownload = useCallback(async () => {
    if (!selectedDoc) return;
    try {
      const res = await api.get(
        `/trainings/offers/${offerId}/documents/${selectedDoc.id}/download`,
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedDoc.is_editable ? `${selectedDoc.filename}.docx` : selectedDoc.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(parseApiError(err), 'error');
    }
  }, [offerId, selectedDoc, showToast]);

  const handleDownloadPdf = useCallback(async () => {
    if (!selectedDoc) return;
    try {
      const res = await api.get(`/trainings/offers/${offerId}/documents/${selectedDoc.id}/pdf`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedDoc.filename}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(parseApiError(err), 'error');
    }
  }, [offerId, selectedDoc, showToast]);

  const handleVersionDownload = useCallback(
    async (version: OfferDocumentVersion) => {
      try {
        const res = await api.get(
          `/trainings/offers/${offerId}/documents/${selectedDocId}/versions/${version.version}/download`,
          { responseType: 'blob' }
        );
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = version.html_content ? `${version.filename}.docx` : version.filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        showToast(parseApiError(err), 'error');
      }
    },
    [offerId, selectedDocId, showToast]
  );

  const handleDeleteRequest = useCallback((docId: string) => {
    setConfirmDeleteId(docId);
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">Documents</h5>
          {documents.length > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
              {documents.length}
            </span>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTemplatePicker((prev) => !prev)}
            disabled={createFromTemplateMutation.isPending || templates.length === 0}
            className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md px-2.5 py-1 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
          >
            {createFromTemplateMutation.isPending ? 'Creating...' : '+ From Template'}
          </button>
          {showTemplatePicker && templates.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1 max-h-48 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => {
                    createFromTemplateMutation.mutate(t.id);
                    setShowTemplatePicker(false);
                  }}
                >
                  {t.name}
                  {t.language && (
                    <span className="ml-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                      ({t.language})
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-4 text-gray-400 text-sm">Loading documents...</div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          No documents yet. Choose a template to get started.
        </p>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {/* Document list */}
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                isSelected={doc.id === selectedDocId}
                onSelect={handleSelectDoc}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>

          {/* Selected document detail */}
          {selectedDoc && (
            <div className="border-t-2 border-blue-200 dark:border-blue-800 bg-gray-50 dark:bg-gray-900 p-4 space-y-4">
              {/* Detail header */}
              <div className="flex items-center justify-between">
                <div>
                  <h6 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {selectedDoc.filename}
                  </h6>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      v{selectedDoc.version}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${DOC_STATUS_COLORS[selectedDoc.status] || DOC_STATUS_COLORS.draft}`}
                    >
                      {selectedDoc.status}
                    </span>
                    {selectedDoc.file_size && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {formatFileSize(selectedDoc.file_size)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Download
                </button>
                {selectedDoc.is_editable && (
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Download PDF
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowSendModal(true)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteRequest(selectedDoc.id)}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Delete
                </button>
              </div>

              {/* Rich text editor (editable docs) */}
              {selectedDoc.is_editable ? (
                <div>
                  <RichTextEditor
                    value={editContent}
                    onChange={(html) => {
                      setEditContent(html);
                      setIsContentDirty(true);
                    }}
                    rows={8}
                  />
                  {isContentDirty && (
                    <div className="flex justify-end mt-2">
                      <button
                        type="button"
                        onClick={() => saveContentMutation.mutate()}
                        disabled={saveContentMutation.isPending}
                        className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saveContentMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic py-2">
                  This is a PDF document and cannot be edited inline. Download to view.
                </p>
              )}

              {/* Version History (collapsible) */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowVersions((prev) => !prev)}
                  className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${showVersions ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Version History ({selectedDoc.version_count})
                </button>
                {showVersions && (
                  <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Version
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Filename
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Size
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Created
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                        {versions.map((v) => (
                          <tr key={v.id}>
                            <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                              v{v.version}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {v.filename}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                              {formatFileSize(v.file_size)}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                              {new Date(v.created_at).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleVersionDownload(v)}
                                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 text-xs"
                              >
                                Download
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Send History (collapsible) */}
              {selectedDoc.sent_to && selectedDoc.sent_to.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowSendHistory((prev) => !prev)}
                    className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${showSendHistory ? 'rotate-90' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    Send History ({selectedDoc.sent_to.length})
                  </button>
                  {showSendHistory && (
                    <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Email
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Version
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Sent At
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                          {selectedDoc.sent_to.map((s, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                                {s.email}
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                v{s.version}
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                {new Date(s.sent_at).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Send Modal */}
      {showSendModal && selectedDoc && (
        <SendModal
          doc={selectedDoc}
          offerId={offerId}
          offerNumber={offerNumber}
          customerName={customerName}
          contactPersons={contactPersons}
          onClose={() => setShowSendModal(false)}
        />
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Delete Document?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              This will permanently delete this document and all its versions. This action cannot be
              undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(confirmDeleteId)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(OfferDocumentsSection);
