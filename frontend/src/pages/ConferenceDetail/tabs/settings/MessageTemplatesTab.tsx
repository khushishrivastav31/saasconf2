import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../config/api';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import OverlaySelector from '../../../../components/OverlaySelector';
import type { Conference } from '../../../../types';
import type { MessageTemplate, MessageTemplateListResponse } from '../../../../types/messaging';

const TEMPLATE_VARIABLES = [
  { label: 'First Name', token: '[First Name]' },
  { label: 'Last Name', token: '[Last Name]' },
  { label: 'Email', token: '[Email]' },
  { label: 'Conference Name', token: '[Conference Name]' },
  { label: 'Paper Title', token: '[Paper Title]' },
];

interface Props {
  conference: Conference;
  isAdmin: boolean;
}

export default function MessageTemplatesTab({ conference, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formOverlayId, setFormOverlayId] = useState<string | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<MessageTemplateListResponse>({
    queryKey: ['message-templates', conference.id],
    queryFn: () => api.get(`/conferences/${conference.id}/messaging/templates`).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      subject: string;
      body_html: string;
      screen_overlay_id?: string | null;
    }) => api.post(`/conferences/${conference.id}/messaging/templates`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['message-templates', conference.id],
      });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      name: string;
      subject: string;
      body_html: string;
      screen_overlay_id?: string | null;
    }) => api.put(`/conferences/${conference.id}/messaging/templates/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['message-templates', conference.id],
      });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/conferences/${conference.id}/messaging/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['message-templates', conference.id],
      });
      setDeleteConfirm(null);
    },
  });

  const closeModal = () => {
    setShowModal(false);
    setEditingTemplate(null);
    setFormName('');
    setFormSubject('');
    setFormBody('');
    setFormOverlayId(null);
  };

  const openCreate = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormSubject('');
    setFormBody('');
    setFormOverlayId(null);
    setShowModal(true);
  };

  const openEdit = (t: MessageTemplate) => {
    setEditingTemplate(t);
    setFormName(t.name);
    setFormSubject(t.subject);
    setFormBody(t.body_html);
    setFormOverlayId(t.screen_overlay_id ?? null);
    setShowModal(true);
  };

  const handleSave = () => {
    const payload = {
      name: formName,
      subject: formSubject,
      body_html: formBody,
      screen_overlay_id: formOverlayId,
    };
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const templates = data?.items ?? [];
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Message Templates</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create reusable templates for composing messages.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            Create Template
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-gray-500">No templates yet.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Subject
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.subject}</td>
                  <td className="px-4 py-3 text-right">
                    {isAdmin && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(t)}
                          className="text-sm text-primary-600 hover:text-primary-800"
                        >
                          Edit
                        </button>
                        {deleteConfirm === t.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => deleteMutation.mutate(t.id)}
                              className="text-sm text-red-600 hover:text-red-800 font-medium"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-sm text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(t.id)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingTemplate ? 'Edit Template' : 'Create Template'}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Variable pills */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Variables
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Click to insert into subject or body. Variables are replaced per recipient when
                  sending.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => {
                        // Insert into subject if it's focused, otherwise append to body
                        const subjectEl = subjectRef.current;
                        if (subjectEl && document.activeElement === subjectEl) {
                          const start = subjectEl.selectionStart ?? formSubject.length;
                          const end = subjectEl.selectionEnd ?? formSubject.length;
                          const newVal =
                            formSubject.slice(0, start) + v.token + formSubject.slice(end);
                          setFormSubject(newVal);
                          // Restore cursor
                          setTimeout(() => {
                            subjectEl.focus();
                            subjectEl.setSelectionRange(
                              start + v.token.length,
                              start + v.token.length
                            );
                          }, 0);
                        } else {
                          // Insert into body (append at the end as HTML)
                          setFormBody((prev) => {
                            if (!prev || prev === '<p></p>') return `<p>${v.token}</p>`;
                            // Insert before closing </p> if it ends with one, else append
                            if (prev.endsWith('</p>')) {
                              return prev.slice(0, -4) + v.token + '</p>';
                            }
                            return prev + v.token;
                          });
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="e.g. Acceptance Letter"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  ref={subjectRef}
                  type="text"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="e.g. Your paper has been accepted, [First Name]!"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                <RichTextEditor
                  value={formBody}
                  onChange={setFormBody}
                  placeholder="Write your template body..."
                  rows={8}
                />
              </div>

              <OverlaySelector
                conferenceId={conference.id}
                value={formOverlayId}
                onChange={setFormOverlayId}
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!formName || !formSubject || !formBody || saving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingTemplate ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
