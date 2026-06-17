import { useState } from 'react';
import { sanitizeHtml } from '../../../../utils/richText';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import type {
  Conference,
  EmailTemplate,
  EmailTemplateUpdate,
  EmailTemplateType,
} from '../../../../types';
import { EMAIL_TEMPLATE_LABELS, EMAIL_TEMPLATE_DESCRIPTIONS } from '../../../../types';
import { queryKeys } from '../../../../config/queryKeys';
import { parseApiError } from '../../../../utils/apiError';
import Modal from '../../../../components/Modal';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import OverlaySelector from '../../../../components/OverlaySelector';
import StatusBadge from '../../../../components/common/StatusBadge';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import ModalFooter from '../../../../components/common/ModalFooter';
import { EditIcon } from '../../icons';

interface EmailTemplateListResponse {
  items: EmailTemplate[];
  total: number;
}

function EmailTemplatesTab({ conference, isAdmin }: { conference: Conference; isAdmin: boolean }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.settings.emailTemplates(conference.id),
    queryFn: async () => {
      const response = await api.get<EmailTemplateListResponse>(
        `/conferences/${conference.id}/settings/email-templates`
      );
      return response.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      templateType,
      data,
    }: {
      templateType: string;
      data: EmailTemplateUpdate;
    }) => {
      const response = await api.put<EmailTemplate>(
        `/conferences/${conference.id}/settings/email-templates/${templateType}`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.emailTemplates(conference.id) });
      setIsModalOpen(false);
      setEditingTemplate(null);
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update template'));
    },
  });

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setIsModalOpen(true);
    setError(null);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTemplate(null);
    setError(null);
  };

  const handleSubmit = (formData: EmailTemplateUpdate) => {
    if (editingTemplate) {
      updateMutation.mutate({
        templateType: editingTemplate.template_type,
        data: formData,
      });
    }
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            System Email Templates
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Customize email templates sent to speakers and committee members
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : isError ? (
        <ErrorBanner message={parseApiError(queryError, 'Failed to load templates')} />
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow overflow-x-auto sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Template Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Subject
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="sticky right-0 z-[1] bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {data?.items?.map((template) => (
                <tr
                  key={template.template_type}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {template.display_name ||
                            EMAIL_TEMPLATE_LABELS[template.template_type as EmailTemplateType] ||
                            template.template_type}
                        </div>
                        {EMAIL_TEMPLATE_DESCRIPTIONS[
                          template.template_type as EmailTemplateType
                        ] && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {
                              EMAIL_TEMPLATE_DESCRIPTIONS[
                                template.template_type as EmailTemplateType
                              ]
                            }
                          </div>
                        )}
                        {!template.id && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            Using default template
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 dark:text-gray-100 truncate max-w-md">
                      {template.subject}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge isActive={template.is_active} />
                  </td>
                  <td className="sticky right-0 z-[1] bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {isAdmin && (
                      <button
                        onClick={() => handleEdit(template)}
                        className="text-primary-600 hover:text-primary-900"
                        title="Edit template"
                        aria-label="Edit template"
                      >
                        <EditIcon />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {(!data?.items || data.items.length === 0) && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-4 text-center text-gray-500 dark:text-gray-400"
                  >
                    No email templates found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Template Modal */}
      <Modal
        key={editingTemplate?.id ?? 'new'}
        open={isModalOpen}
        onClose={handleCloseModal}
        title={`Edit ${editingTemplate ? EMAIL_TEMPLATE_LABELS[editingTemplate.template_type as EmailTemplateType] || editingTemplate.template_type : 'Template'}`}
        size="max-w-4xl"
      >
        {editingTemplate && (
          <EmailTemplateForm
            conferenceId={conference.id}
            template={editingTemplate}
            onSubmit={handleSubmit}
            onCancel={handleCloseModal}
            isSubmitting={updateMutation.isPending}
            error={error}
          />
        )}
      </Modal>
    </div>
  );
}

// --- Email Template Form ---

interface EmailTemplateFormProps {
  conferenceId: string;
  template: EmailTemplate;
  onSubmit: (data: EmailTemplateUpdate) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
}

// Valid placeholders that can be used in email templates
const VALID_PLACEHOLDERS = [
  'First Name',
  'Last Name',
  'Full Name',
  'Email',
  'Conference Name',
  'Company Name',
  'Paper Title',
  'Paper List',
  'Speakers',
  'Main Speaker Name',
  'User Type',
  'Verify Link',
  'Reset Link',
  'Portal Link',
  'Support Email',
  'Message Subject',
  'Messages Link',
  'Recipient Name',
  'Package Name',
  'Custom Message',
  'Contract Content',
  'Invoice Number',
  'Total Amount',
  'Invoice Amount',
  'Currency',
  'Due Date',
  'Days Overdue',
  'Booking Option Name',
  'Password Setup Link',
  'Cancellation Reason',
];

// Extract all placeholders from text (anything in [brackets])
function extractPlaceholders(text: string): string[] {
  const regex = /\[([^\]]+)\]/g;
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (!matches.includes(match[1])) {
      matches.push(match[1]);
    }
  }
  return matches;
}

// Find invalid placeholders in text
function findInvalidPlaceholders(text: string): string[] {
  const used = extractPlaceholders(text);
  return used.filter((p) => !VALID_PLACEHOLDERS.includes(p));
}

function EmailTemplateForm({
  conferenceId,
  template,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: EmailTemplateFormProps) {
  const [displayName, setDisplayName] = useState(
    template.display_name ||
      EMAIL_TEMPLATE_LABELS[template.template_type as EmailTemplateType] ||
      template.template_type
  );
  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);
  const [bodyText, setBodyText] = useState(template.body_text || '');
  const [isActive, setIsActive] = useState(template.is_active);
  const [screenOverlayId, setScreenOverlayId] = useState<string | null>(
    template.screen_overlay_id ?? null
  );
  const [activePreviewTab, setActivePreviewTab] = useState<'html' | 'text'>('html');
  const [placeholderWarning, setPlaceholderWarning] = useState<string[] | null>(null);

  // Convert HTML to plain text with formatting preserved
  const htmlToPlainText = (html: string): string => {
    // Replace block elements with newlines
    let text = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<\/tr>/gi, '\n');

    // Strip remaining HTML tags
    const temp = document.createElement('div');
    temp.innerHTML = text;
    text = temp.textContent || temp.innerText || '';

    // Clean up multiple newlines and trim
    return text.replace(/\n{3,}/g, '\n\n').trim();
  };

  const handleHtmlChange = (html: string) => {
    setBodyHtml(html);
    setBodyText(htmlToPlainText(html));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Check for invalid placeholders in subject and body
    const allText = `${subject} ${bodyHtml} ${bodyText}`;
    const invalidPlaceholders = findInvalidPlaceholders(allText);

    if (invalidPlaceholders.length > 0) {
      setPlaceholderWarning(invalidPlaceholders);
      return;
    }

    setPlaceholderWarning(null);
    onSubmit({
      display_name: displayName,
      subject,
      body_html: bodyHtml,
      body_text: bodyText || undefined,
      is_active: isActive,
      screen_overlay_id: screenOverlayId,
    });
  };

  const handleSaveAnyway = () => {
    setPlaceholderWarning(null);
    onSubmit({
      display_name: displayName,
      subject,
      body_html: bodyHtml,
      body_text: bodyText || undefined,
      is_active: isActive,
      screen_overlay_id: screenOverlayId,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* Placeholder Warning Popup */}
      <Modal
        open={placeholderWarning !== null}
        onClose={() => setPlaceholderWarning(null)}
        title="Unknown Placeholders Detected"
        size="max-w-md"
      >
        <div className="p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                The following placeholders are not recognized and will not be replaced:
              </p>
              <ul className="mt-2 list-disc list-inside text-sm text-gray-600 dark:text-gray-300">
                {placeholderWarning?.map((p) => (
                  <li key={p}>
                    <code className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded text-yellow-800">
                      [{p}]
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3 rounded-b-lg">
          <button
            type="button"
            onClick={() => setPlaceholderWarning(null)}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Go Back & Fix
          </button>
          <button
            type="button"
            onClick={handleSaveAnyway}
            className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 border border-transparent rounded-md hover:bg-yellow-700"
          >
            Save Anyway
          </button>
        </div>
      </Modal>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Template Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            placeholder={
              EMAIL_TEMPLATE_LABELS[template.template_type as EmailTemplateType] ||
              template.template_type
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            HTML Body
          </label>
          <div data-testid="email-editor-wrapper" className="px-4 py-2">
            <RichTextEditor
              value={bodyHtml}
              onChange={handleHtmlChange}
              placeholder="Enter the HTML email body..."
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Plain Text Body{' '}
            <span className="text-gray-400 dark:text-gray-500 font-normal">
              (auto-generated from HTML)
            </span>
          </label>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono text-sm dark:bg-gray-800 dark:text-gray-100"
            placeholder="Plain text version will be auto-generated..."
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="is_active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
          />
          <label
            htmlFor="is_active"
            className="ml-2 block text-sm text-gray-700 dark:text-gray-300"
          >
            Template is active
          </label>
        </div>

        <OverlaySelector
          conferenceId={conferenceId}
          value={screenOverlayId}
          onChange={setScreenOverlayId}
        />

        {/* Placeholders reference */}
        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Available Placeholders
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
            <div>
              <code>[First Name]</code> - Recipient's first name
            </div>
            <div>
              <code>[Last Name]</code> - Recipient's last name
            </div>
            <div>
              <code>[Full Name]</code> - Recipient's full name
            </div>
            <div>
              <code>[Email]</code> - Recipient's email address
            </div>
            <div>
              <code>[Conference Name]</code> - Conference name
            </div>
            <div>
              <code>[Company Name]</code> - Tenant/Company name
            </div>
            <div>
              <code>[Paper Title]</code> - Submitted paper title
            </div>
            <div>
              <code>[Paper List]</code> - List of paper titles (acceptance/rejection)
            </div>
            <div>
              <code>[Speakers]</code> - List of speakers
            </div>
            <div>
              <code>[Main Speaker Name]</code> - Main speaker name
            </div>
            <div>
              <code>[User Type]</code> - Role (Admin, Reviewer, etc.)
            </div>
            <div>
              <code>[Verify Link]</code> - Email verification URL
            </div>
            <div>
              <code>[Reset Link]</code> - Password reset URL
            </div>
            <div>
              <code>[Portal Link]</code> - CFP portal URL
            </div>
            <div>
              <code>[Support Email]</code> - Support contact email
            </div>
            <div>
              <code>[Recipient Name]</code> - Contract recipient name
            </div>
            <div>
              <code>[Package Name]</code> - Sponsor package name
            </div>
            <div>
              <code>[Custom Message]</code> - Cover message from sender
            </div>
            <div>
              <code>[Contract Content]</code> - Inline contract HTML
            </div>
          </div>
        </div>

        {/* Preview section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Preview
            </label>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setActivePreviewTab('html')}
                className={`px-3 py-1 text-xs rounded ${
                  activePreviewTab === 'html'
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}
              >
                HTML
              </button>
              <button
                type="button"
                onClick={() => setActivePreviewTab('text')}
                className={`px-3 py-1 text-xs rounded ${
                  activePreviewTab === 'text'
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}
              >
                Plain Text
              </button>
            </div>
          </div>
          <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4 bg-white dark:bg-gray-800 max-h-64 overflow-auto">
            {activePreviewTab === 'html' ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml) }}
              />
            ) : (
              <pre className="text-sm whitespace-pre-wrap font-mono text-gray-700 dark:text-gray-300">
                {bodyText || '(No plain text version)'}
              </pre>
            )}
          </div>
        </div>
      </div>

      <ModalFooter onCancel={onCancel} submitLabel="Save Template" isLoading={isSubmitting} />
    </form>
  );
}

export default EmailTemplatesTab;
