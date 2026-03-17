import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import BadgeTemplateEditor from '../../../../components/BadgeTemplateEditor';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import type { Conference } from '../../../../types';

const BADGE_TYPES = [
  { key: 'attendee', label: 'Attendee' },
  { key: 'speaker', label: 'Speaker' },
  { key: 'sponsor', label: 'Sponsor' },
  { key: 'volunteer', label: 'Volunteer' },
  { key: 'committee', label: 'Program Committee' },
  { key: 'organizer', label: 'Organizer' },
] as const;

type BadgeTypeKey = (typeof BADGE_TYPES)[number]['key'];

const QR_FIELD_OPTIONS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'job_title', label: 'Job Title' },
  { key: 'department', label: 'Department' },
  { key: 'company_name', label: 'Company' },
  { key: 'street', label: 'Street' },
  { key: 'postal_code', label: 'Postal Code' },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
] as const;

interface ConditionalImage {
  id: string;
  name: string;
  placeholder: string;
  condition_type: string;
  condition_value: string;
  attachment_id: string | null;
}

export default function BadgeDesignerTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [activeType, setActiveType] = useState<BadgeTypeKey>('attendee');
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [orientation, setOrientation] = useState('landscape');
  const [qrFields, setQrFields] = useState<string[]>([]);
  const [qrLogoAttachmentId, setQrLogoAttachmentId] = useState<string | null>(null);
  const [conditionalImages, setConditionalImages] = useState<ConditionalImage[]>([]);
  const [showQrConfig, setShowQrConfig] = useState(false);
  const [showCondImages, setShowCondImages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Fetch badge settings
  const { data: settings, isLoading } = useQuery({
    queryKey: queryKeys.badgeSettings(conference.id),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conference.id}/settings/badge-settings`);
      return res.data;
    },
  });

  // Update form state when settings load
  useEffect(() => {
    if (settings) {
      setTemplates(settings.badge_templates || {});
      setOrientation(settings.badge_orientation || 'landscape');
      setQrFields(settings.badge_qr_fields || []);
      setQrLogoAttachmentId(settings.badge_qr_logo_attachment_id || null);
      setConditionalImages(settings.badge_conditional_images || []);
    }
  }, [settings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        badge_templates: templates,
        badge_orientation: orientation,
        badge_qr_fields: qrFields,
        badge_conditional_images: conditionalImages,
      };
      const res = await api.put(`/conferences/${conference.id}/settings/badge-settings`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.badgeSettings(conference.id) });
      showToast('Badge templates saved successfully', 'success');
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  const handleSave = useCallback(() => {
    setError(null);
    saveMutation.mutate();
  }, [saveMutation]);

  const handleTemplateChange = useCallback(
    (html: string) => {
      setTemplates((prev) => ({ ...prev, [activeType]: html }));
    },
    [activeType]
  );

  const handleDuplicateFrom = (sourceType: BadgeTypeKey) => {
    const sourceHtml = templates[sourceType] || '';
    setTemplates((prev) => ({ ...prev, [activeType]: sourceHtml }));
    showToast(
      `Copied template from "${BADGE_TYPES.find((t) => t.key === sourceType)?.label}"`,
      'success'
    );
  };

  const toggleQrField = (field: string) => {
    setQrFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  // QR code preview
  const { data: qrPreviewUrl, refetch: refetchQrPreview } = useQuery({
    queryKey: [...queryKeys.badgeSettings(conference.id), 'qr-preview'],
    queryFn: async () => {
      const res = await api.get(
        `/conferences/${conference.id}/settings/badge-settings/qr-preview`,
        {
          responseType: 'blob',
        }
      );
      return URL.createObjectURL(res.data as Blob);
    },
    enabled: showQrConfig && qrFields.length > 0,
    staleTime: 0,
  });

  // Upload QR logo
  const handleQrLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(
        `/conferences/${conference.id}/settings/badge-settings/qr-logo`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setQrLogoAttachmentId(res.data.badge_qr_logo_attachment_id);
      queryClient.invalidateQueries({ queryKey: queryKeys.badgeSettings(conference.id) });
      refetchQrPreview();
      showToast('QR logo uploaded', 'success');
    } catch (err: unknown) {
      showToast(parseApiError(err, 'Failed to upload logo'), 'error');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  // Remove QR logo
  const handleRemoveQrLogo = async () => {
    try {
      await api.delete(`/conferences/${conference.id}/settings/badge-settings/qr-logo`);
      setQrLogoAttachmentId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.badgeSettings(conference.id) });
      refetchQrPreview();
      showToast('QR logo removed', 'success');
    } catch (err: unknown) {
      showToast(parseApiError(err, 'Failed to remove logo'), 'error');
    }
  };

  // Delete conditional image
  const handleDeleteCondImage = async (imageId: string) => {
    try {
      await api.delete(
        `/conferences/${conference.id}/settings/badge-settings/conditional-images/${imageId}`
      );
      setConditionalImages((prev) => prev.filter((img) => img.id !== imageId));
      queryClient.invalidateQueries({ queryKey: queryKeys.badgeSettings(conference.id) });
      showToast('Conditional image deleted', 'success');
    } catch (err: unknown) {
      showToast(parseApiError(err, 'Failed to delete image'), 'error');
    }
  };

  if (isLoading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  const currentHtml = templates[activeType] || '';

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}

      {/* Badge Type Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-1 overflow-x-auto">
          {BADGE_TYPES.map((bt) => (
            <button
              key={bt.key}
              onClick={() => setActiveType(bt.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeType === bt.key
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {bt.label}
              {templates[bt.key] ? '' : ' (empty)'}
            </button>
          ))}

          {/* Duplicate from dropdown */}
          {isAdmin && (
            <div className="relative ml-auto group">
              <button className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                Copy from...
              </button>
              <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                {BADGE_TYPES.filter((bt) => bt.key !== activeType).map((bt) => (
                  <button
                    key={bt.key}
                    onClick={() => handleDuplicateFrom(bt.key)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {bt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Template Editor */}
      <BadgeTemplateEditor
        conferenceId={conference.id}
        value={currentHtml}
        onChange={handleTemplateChange}
        disabled={!isAdmin}
        onSave={isAdmin ? handleSave : undefined}
        orientation={orientation}
        onOrientationChange={setOrientation}
        templateType={activeType}
      />

      {/* QR Code Configuration */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowQrConfig(!showQrConfig)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <span>
            QR Code Configuration{' '}
            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
              — select which fields to include in the vCard QR code
            </span>
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${showQrConfig ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showQrConfig && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Place{' '}
              <code className="font-mono text-primary-600 dark:text-primary-400">[QR_CODE]</code> in
              your badge template to show the QR code. Select which attendee fields are encoded:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {QR_FIELD_OPTIONS.map((field) => (
                <label
                  key={field.key}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={qrFields.includes(field.key)}
                    onChange={() => toggleQrField(field.key)}
                    disabled={!isAdmin}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{field.label}</span>
                </label>
              ))}
            </div>

            {/* QR Logo + Preview */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-6">
                {/* Logo Upload */}
                <div className="flex-1">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Center Logo (optional)
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Upload a logo to display in the center of the QR code. It will be rendered in
                    black &amp; white. Works best with simple, high-contrast logos.
                  </p>
                  {qrLogoAttachmentId ? (
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md text-sm">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Logo uploaded
                      </span>
                      {isAdmin && (
                        <button
                          onClick={handleRemoveQrLogo}
                          className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ) : (
                    isAdmin && (
                      <label className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleQrLogoUpload}
                          disabled={uploadingLogo}
                          className="hidden"
                        />
                      </label>
                    )
                  )}
                </div>

                {/* QR Preview */}
                {qrFields.length > 0 && (
                  <div className="shrink-0 text-center">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Preview
                    </p>
                    {qrPreviewUrl ? (
                      <img
                        src={qrPreviewUrl}
                        alt="QR Code Preview"
                        className="w-32 h-32 border border-gray-200 dark:border-gray-700 rounded"
                      />
                    ) : (
                      <div className="w-32 h-32 border border-gray-200 dark:border-gray-700 rounded flex items-center justify-center">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                      </div>
                    )}
                    <button
                      onClick={() => refetchQrPreview()}
                      className="mt-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      Refresh preview
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Conditional Images */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCondImages(!showCondImages)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <span>
            Conditional Images{' '}
            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
              — images that appear only when conditions are met ({conditionalImages.length})
            </span>
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${showCondImages ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showCondImages && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            {conditionalImages.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No conditional images configured. Upload images via the API to add conditions.
              </p>
            ) : (
              <div className="space-y-2">
                {conditionalImages.map((img) => (
                  <div
                    key={img.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {img.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Placeholder:{' '}
                        <code className="font-mono text-primary-600 dark:text-primary-400">
                          [{img.placeholder}]
                        </code>
                        {' — '}
                        {img.condition_type}: {img.condition_value}
                      </p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteCondImage(img.id)}
                        className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="Delete"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
