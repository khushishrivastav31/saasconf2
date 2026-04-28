import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import Modal from '../../../../components/Modal';
import RichTextEditor, {
  type RichTextEditorHandle,
} from '../../../../components/common/RichTextEditor';
import TrainingVariableButtons from '../../../../components/trainings/TrainingVariableButtons';
import { useToast } from '../../../../components/Toast';

interface MessageTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  created_at: string;
  updated_at: string;
}

interface MessageTemplateListResponse {
  items: MessageTemplate[];
  total: number;
}

interface FormState {
  name: string;
  subject: string;
  body_html: string;
}

const EMPTY_FORM: FormState = { name: '', subject: '', body_html: '' };

export default function MessageTemplatesTab() {
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<MessageTemplate | null>(null);
  const [lastFocused, setLastFocused] = useState<'subject' | 'body'>('body');
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyEditorRef = useRef<RichTextEditorHandle>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['training-message-templates'],
    queryFn: async () => {
      const resp = await api.get<MessageTemplateListResponse>('/trainings/messaging/templates');
      return resp.data;
    },
  });

  const items = data?.items ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const resp = await api.post<MessageTemplate>('/trainings/messaging/templates', form);
      return resp.data;
    },
    onSuccess: () => {
      showToast('Template created', 'success');
      queryClient.invalidateQueries({ queryKey: ['training-message-templates'] });
      setFormOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      showToast(detail || 'Failed to create template', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (id: string) => {
      const resp = await api.put<MessageTemplate>(`/trainings/messaging/templates/${id}`, form);
      return resp.data;
    },
    onSuccess: () => {
      showToast('Template updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['training-message-templates'] });
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      showToast(detail || 'Failed to update template', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/trainings/messaging/templates/${id}`);
    },
    onSuccess: () => {
      showToast('Template deleted', 'success');
      queryClient.invalidateQueries({ queryKey: ['training-message-templates'] });
      setConfirmDelete(null);
    },
    onError: () => showToast('Failed to delete template', 'error'),
  });

  const handleNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const handleEdit = (t: MessageTemplate) => {
    setEditing(t);
    setForm({ name: t.name, subject: t.subject, body_html: t.body_html });
    setFormOpen(true);
  };

  const handleSave = () => {
    if (editing) updateMutation.mutate(editing.id);
    else createMutation.mutate();
  };

  const insertVariable = (token: string) => {
    if (lastFocused === 'subject' && subjectRef.current) {
      const input = subjectRef.current;
      const start = input.selectionStart ?? form.subject.length;
      const end = input.selectionEnd ?? form.subject.length;
      const next = form.subject.slice(0, start) + token + form.subject.slice(end);
      setForm((f) => ({ ...f, subject: next }));
      requestAnimationFrame(() => {
        input.focus();
        const cursor = start + token.length;
        input.setSelectionRange(cursor, cursor);
      });
      return;
    }
    bodyEditorRef.current?.insertText(token);
  };

  const canSave =
    form.name.trim().length > 0 &&
    form.subject.trim().length > 0 &&
    form.body_html.trim().length > 0 &&
    form.body_html.trim() !== '<p></p>' &&
    !createMutation.isPending &&
    !updateMutation.isPending;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Message Templates
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Reusable subject + body templates for training broadcasts. Used from{' '}
            <span className="font-medium">Compose</span> in the Messages tab.
          </p>
        </div>
        <button
          type="button"
          onClick={handleNew}
          className="inline-flex items-center gap-1 px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
        >
          + New template
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No templates yet. Click <span className="font-medium">+ New template</span> to create
            one.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-4 py-2 font-medium w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {items.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{t.name}</td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{t.subject}</td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(t)}
                      className="px-2 py-1 text-xs text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(t)}
                      className="px-2 py-1 text-xs text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setForm(EMPTY_FORM);
        }}
        title={editing ? `Edit template — ${editing.name}` : 'New template'}
      >
        <div className="px-6 py-4 space-y-4">
          <div>
            <label
              htmlFor="template-name"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Name
            </label>
            <input
              id="template-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={200}
              placeholder="e.g. Day-of instructions"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label
              htmlFor="template-subject"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Subject
            </label>
            <input
              id="template-subject"
              ref={subjectRef}
              type="text"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              onFocus={() => setLastFocused('subject')}
              maxLength={500}
              placeholder="e.g. Reminder: [Training Name] starts soon"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label
              htmlFor="template-body"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Body
            </label>
            <div onFocusCapture={() => setLastFocused('body')}>
              <RichTextEditor
                ref={bodyEditorRef}
                value={form.body_html}
                onChange={(html) => setForm({ ...form, body_html: html })}
                placeholder="Write the template body. Click a variable below to insert it."
              />
            </div>
          </div>
          <TrainingVariableButtons onInsert={insertVariable} />
        </div>
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setFormOpen(false);
              setEditing(null);
              setForm(EMPTY_FORM);
            }}
            className="px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
          >
            {createMutation.isPending || updateMutation.isPending
              ? 'Saving…'
              : editing
                ? 'Save'
                : 'Create'}
          </button>
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete template?"
        size="max-w-sm"
      >
        <div className="px-6 py-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Delete <span className="font-medium">{confirmDelete?.name}</span>? Existing broadcasts
            that used it stay intact; only future Compose dialogs lose this option.
          </p>
        </div>
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(null)}
            className="px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
            disabled={deleteMutation.isPending}
            className="px-4 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
