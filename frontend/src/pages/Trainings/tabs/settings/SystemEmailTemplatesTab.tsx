/**
 * System Email Templates Tab (Training)
 *
 * Manages email templates for training registration + invoicing.
 * Tenant-scoped — shared across all trainings.
 */
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import RichTextEditor from '../../../../components/common/RichTextEditor';

interface EmailTemplate {
  template_type: string;
  display_name: string;
  subject: string;
  body_html: string;
  body_text: string;
  is_active: boolean;
  is_default: boolean;
}

const PLACEHOLDERS = [
  '[Training Name]',
  '[First Name]',
  '[Last Name]',
  '[Company Name]',
  '[Support Email]',
  '[Invoice Number]',
  '[Amount Due]',
  '[Due Date]',
  '[Year]',
  '[Training Count]',
  '[Changes]',
];

function TemplateEditModal({
  template,
  onClose,
  onSaved,
}: {
  template: EmailTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);
  const [isActive, setIsActive] = useState(template.is_active);
  const [showPlaceholders, setShowPlaceholders] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/trainings/email-templates/${template.template_type}`, {
        subject,
        body_html: bodyHtml,
        is_active: isActive,
      });
    },
    onSuccess: () => {
      showToast('Template saved', 'success');
      onSaved();
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/trainings/email-templates/${template.template_type}`);
    },
    onSuccess: () => {
      showToast('Template reset to default', 'success');
      onSaved();
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-4">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {template.display_name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Active toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Body HTML */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Body (HTML)
            </label>
            <RichTextEditor value={bodyHtml} onChange={setBodyHtml} rows={12} />
          </div>

          {/* Placeholders */}
          <div>
            <button
              type="button"
              onClick={() => setShowPlaceholders(!showPlaceholders)}
              className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showPlaceholders ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              Available Placeholders
            </button>
            {showPlaceholders && (
              <div className="mt-2 flex flex-wrap gap-2">
                {PLACEHOLDERS.map((p) => (
                  <span
                    key={p}
                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded font-mono"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <button
            onClick={() => resetMutation.mutate()}
            disabled={template.is_default || resetMutation.isPending}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {resetMutation.isPending ? 'Resetting...' : 'Reset to Default'}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SystemEmailTemplatesTab() {
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);

  const { data: templates, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: queryKeys.trainingEmailTemplates,
    queryFn: async () => {
      const res = await api.get('/trainings/email-templates');
      return res.data;
    },
  });

  const handleSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.trainingEmailTemplates });
    setEditingTemplate(null);
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email Templates</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Customize email templates sent for training registrations and invoicing. These apply to
          all trainings.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Template
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Subject
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {(templates || []).map((t) => (
              <tr key={t.template_type} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t.display_name}
                  </div>
                  {!t.is_default && (
                    <span className="text-xs text-blue-600 dark:text-blue-400">Customized</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">
                  {t.subject}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.is_active
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {t.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setEditingTemplate(t)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    title="Edit template"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingTemplate && (
        <TemplateEditModal
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
