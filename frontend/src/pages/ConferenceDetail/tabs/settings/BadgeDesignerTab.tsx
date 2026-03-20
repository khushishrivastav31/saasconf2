import { useState, useEffect, useCallback, useRef, useMemo, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import BadgeTemplateEditor from '../../../../components/BadgeTemplateEditor';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import type { Conference } from '../../../../types';
import { DirtyContext } from '../../DirtyContext';

/** Small component that fetches an image through the authenticated API and displays it. */
function AuthImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    api
      .get(url, { responseType: 'blob' })
      .then((res) => {
        const objectUrl = URL.createObjectURL(res.data as Blob);
        revoke = objectUrl;
        setSrc(objectUrl);
      })
      .catch(() => setSrc(null));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [url]);
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded text-gray-400 dark:text-gray-500 ${className ?? ''}`}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} />;
}

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
  condition_field?: string | null;
  condition_operator?: string | null;
}

const CONDITION_TYPES = [
  { key: 'booking_option', label: 'Booking Option' },
  { key: 'conference_day', label: 'Conference Day' },
  { key: 'field', label: 'Field Condition' },
] as const;

// Legacy display label for existing registration_item conditions
const CONDITION_TYPE_LABELS: Record<string, string> = {
  booking_option: 'Booking Option',
  conference_day: 'Conference Day',
  registration_item: 'Booking Option',
  field: 'Field Condition',
};

const CONDITION_FIELDS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'job_title', label: 'Job Title' },
  { key: 'department', label: 'Department' },
  { key: 'pronouns', label: 'Pronouns' },
  { key: 'company_name', label: 'Company' },
  { key: 'country', label: 'Country' },
  { key: 'city', label: 'City' },
  { key: 'booking_option', label: 'Booking Option (name)' },
  { key: 'badge_type', label: 'Badge Type' },
] as const;

const CONDITION_OPERATORS = [
  { key: 'eq', label: 'equals' },
  { key: 'neq', label: 'not equals' },
  { key: 'contains', label: 'contains' },
  { key: 'not_empty', label: 'is not empty' },
  { key: 'empty', label: 'is empty' },
] as const;

const NO_VALUE_OPERATORS = new Set(['not_empty', 'empty']);

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
  const [showAddCondImage, setShowAddCondImage] = useState(false);
  const [condName, setCondName] = useState('');
  const [condPlaceholder, setCondPlaceholder] = useState('');
  const [condType, setCondType] = useState<string>('booking_option');
  const [condValue, setCondValue] = useState('');
  const [condFile, setCondFile] = useState<File | null>(null);
  const [uploadingCondImage, setUploadingCondImage] = useState(false);
  const condFileRef = useRef<HTMLInputElement>(null);
  const [editingCondImageId, setEditingCondImageId] = useState<string | null>(null);
  const [editCondType, setEditCondType] = useState<string>('booking_option');
  const [editCondValue, setEditCondValue] = useState('');
  const [editCondName, setEditCondName] = useState('');
  const [editCondField, setEditCondField] = useState('');
  const [editCondOperator, setEditCondOperator] = useState('eq');
  // For "Add" form field conditions
  const [condField, setCondField] = useState('');
  const [condOperator, setCondOperator] = useState('eq');
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

  // Fetch booking options for condition dropdowns
  const { data: bookingOptions } = useQuery({
    queryKey: queryKeys.booking.options(conference.id),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conference.id}/settings/booking-options`);
      return (res.data?.items ?? res.data) as { id: string; name: string }[];
    },
    enabled: showCondImages,
    staleTime: 30_000,
  });

  // Fetch program days for condition dropdowns
  const { data: programDays } = useQuery({
    queryKey: queryKeys.program.days(conference.id),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conference.id}/program/days`);
      return (res.data?.items ?? res.data) as { id: string; name: string }[];
    },
    enabled: showCondImages,
    staleTime: 30_000,
  });

  // Condition value options based on selected type
  const condValueOptions =
    condType === 'conference_day' ? (programDays ?? []) : (bookingOptions ?? []);

  // Upload conditional image
  const handleUploadCondImage = async () => {
    if (!condFile || !condName.trim() || !condPlaceholder.trim()) return;
    if (condType === 'field') {
      if (!condField || !condOperator) return;
      if (!NO_VALUE_OPERATORS.has(condOperator) && !condValue) return;
    } else if (!condValue) {
      return;
    }
    setUploadingCondImage(true);
    try {
      const formData = new FormData();
      formData.append('file', condFile);
      formData.append('name', condName.trim());
      formData.append('placeholder', condPlaceholder.trim());
      formData.append('condition_type', condType);
      formData.append(
        'condition_value',
        condType === 'field' && NO_VALUE_OPERATORS.has(condOperator) ? '' : condValue
      );
      if (condType === 'field') {
        formData.append('condition_field', condField);
        formData.append('condition_operator', condOperator);
      }
      const res = await api.post(
        `/conferences/${conference.id}/settings/badge-settings/conditional-images`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setConditionalImages(res.data.badge_conditional_images ?? []);
      queryClient.invalidateQueries({ queryKey: queryKeys.badgeSettings(conference.id) });
      showToast('Conditional image added', 'success');
      // Reset form
      setCondName('');
      setCondPlaceholder('');
      setCondType('booking_option');
      setCondValue('');
      setCondField('');
      setCondOperator('eq');
      setCondFile(null);
      if (condFileRef.current) condFileRef.current.value = '';
      setShowAddCondImage(false);
    } catch (err: unknown) {
      showToast(parseApiError(err, 'Failed to upload conditional image'), 'error');
    } finally {
      setUploadingCondImage(false);
    }
  };

  // Start editing a conditional image
  const startEditCondImage = (img: ConditionalImage) => {
    setEditingCondImageId(img.id);
    setEditCondType(
      img.condition_type === 'registration_item' ? 'booking_option' : img.condition_type
    );
    setEditCondValue(img.condition_value);
    setEditCondName(img.name);
    setEditCondField(img.condition_field ?? '');
    setEditCondOperator(img.condition_operator ?? 'eq');
  };

  // Save edited conditional image via PUT badge settings
  const saveEditCondImage = async () => {
    if (!editingCondImageId) return;
    if (editCondType === 'field') {
      if (!editCondField || !editCondOperator) return;
      if (!NO_VALUE_OPERATORS.has(editCondOperator) && !editCondValue) return;
    } else if (!editCondValue) {
      return;
    }
    const updated = conditionalImages.map((img) =>
      img.id === editingCondImageId
        ? {
            ...img,
            name: editCondName.trim() || img.name,
            condition_type: editCondType,
            condition_value:
              editCondType === 'field' && NO_VALUE_OPERATORS.has(editCondOperator)
                ? ''
                : editCondValue,
            condition_field: editCondType === 'field' ? editCondField : null,
            condition_operator: editCondType === 'field' ? editCondOperator : null,
          }
        : img
    );
    try {
      await api.put(`/conferences/${conference.id}/settings/badge-settings`, {
        badge_conditional_images: updated,
      });
      setConditionalImages(updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.badgeSettings(conference.id) });
      showToast('Conditional image updated', 'success');
      setEditingCondImageId(null);
    } catch (err: unknown) {
      showToast(parseApiError(err, 'Failed to update conditional image'), 'error');
    }
  };

  // Track dirty state for unsaved changes guard
  const isDirty = useMemo(() => {
    if (!settings) return false;
    const serverTemplates = settings.badge_templates || {};
    const serverOrientation = settings.badge_orientation || 'landscape';
    const serverQrFields = settings.badge_qr_fields || [];
    if (orientation !== serverOrientation) return true;
    if (JSON.stringify(qrFields) !== JSON.stringify(serverQrFields)) return true;
    if (JSON.stringify(templates) !== JSON.stringify(serverTemplates)) return true;
    return false;
  }, [settings, templates, orientation, qrFields]);

  const reportDirty = useContext(DirtyContext);
  useEffect(() => {
    reportDirty(isDirty);
    return () => reportDirty(false);
  }, [isDirty, reportDirty]);

  // Build extra placeholder category from conditional images
  const condImagePlaceholders = useMemo(() => {
    if (conditionalImages.length === 0) return undefined;
    return [
      {
        category: 'Conditional Images',
        items: conditionalImages.map((img) => ({
          name: `[${img.placeholder}]`,
          description: img.name,
        })),
      },
    ];
  }, [conditionalImages]);

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
              <button className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
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
        extraPlaceholders={condImagePlaceholders}
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
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
            {conditionalImages.length === 0 && !showAddCondImage && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No conditional images configured.
              </p>
            )}

            {conditionalImages.length > 0 && (
              <div className="space-y-2">
                {conditionalImages.map((img) => {
                  const isEditing = editingCondImageId === img.id;
                  const typeLabel = CONDITION_TYPE_LABELS[img.condition_type] ?? img.condition_type;
                  let condLabel: string | undefined;
                  if (img.condition_type === 'field') {
                    const fieldLabel =
                      CONDITION_FIELDS.find((f) => f.key === img.condition_field)?.label ??
                      img.condition_field;
                    const opLabel =
                      CONDITION_OPERATORS.find((o) => o.key === img.condition_operator)?.label ??
                      img.condition_operator;
                    condLabel = `${fieldLabel} ${opLabel}${NO_VALUE_OPERATORS.has(img.condition_operator ?? '') ? '' : ` "${img.condition_value}"`}`;
                  } else if (img.condition_type === 'conference_day') {
                    condLabel = programDays?.find((d) => d.id === img.condition_value)?.name;
                  } else {
                    condLabel = bookingOptions?.find((o) => o.id === img.condition_value)?.name;
                  }
                  const editValueOptions =
                    (isEditing ? editCondType : img.condition_type) === 'conference_day'
                      ? (programDays ?? [])
                      : (bookingOptions ?? []);

                  return (
                    <div
                      key={img.id}
                      className="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden"
                    >
                      <div className="flex items-center gap-3 p-3">
                        {img.attachment_id ? (
                          <AuthImage
                            url={`/conferences/${conference.id}/settings/badge-settings/conditional-images/${img.attachment_id}/file`}
                            alt={img.name}
                            className="h-8 w-8 object-contain rounded shrink-0"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded text-gray-400 dark:text-gray-500 shrink-0">
                            <svg
                              className="h-4 w-4"
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
                          </div>
                        )}
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
                            {typeLabel}: {condLabel ?? img.condition_value}
                          </p>
                        </div>
                        {isAdmin && !isEditing && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startEditCondImage(img)}
                              className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                              title="Edit"
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
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
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
                          </div>
                        )}
                      </div>

                      {/* Inline edit form */}
                      {isEditing && (
                        <div className="px-3 pb-3 pt-1 border-t border-gray-200 dark:border-gray-700 space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                              Name
                            </label>
                            <input
                              type="text"
                              value={editCondName}
                              onChange={(e) => setEditCondName(e.target.value)}
                              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Condition Type
                              </label>
                              <select
                                value={editCondType}
                                onChange={(e) => {
                                  setEditCondType(e.target.value);
                                  setEditCondValue('');
                                  setEditCondField('');
                                  setEditCondOperator('eq');
                                }}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                              >
                                {CONDITION_TYPES.map((ct) => (
                                  <option key={ct.key} value={ct.key}>
                                    {ct.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {editCondType === 'field' ? (
                              <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                  Field
                                </label>
                                <select
                                  value={editCondField}
                                  onChange={(e) => setEditCondField(e.target.value)}
                                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                                >
                                  <option value="">Select field...</option>
                                  {CONDITION_FIELDS.map((f) => (
                                    <option key={f.key} value={f.key}>
                                      {f.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                  Condition Value
                                </label>
                                <select
                                  value={editCondValue}
                                  onChange={(e) => setEditCondValue(e.target.value)}
                                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                                >
                                  <option value="">Select...</option>
                                  {editValueOptions.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                          {editCondType === 'field' && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                  Operator
                                </label>
                                <select
                                  value={editCondOperator}
                                  onChange={(e) => setEditCondOperator(e.target.value)}
                                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                                >
                                  {CONDITION_OPERATORS.map((op) => (
                                    <option key={op.key} value={op.key}>
                                      {op.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              {!NO_VALUE_OPERATORS.has(editCondOperator) && (
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                    Value
                                  </label>
                                  <input
                                    type="text"
                                    value={editCondValue}
                                    onChange={(e) => setEditCondValue(e.target.value)}
                                    placeholder="e.g. she/her"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={saveEditCondImage}
                              disabled={
                                editCondType === 'field'
                                  ? !editCondField ||
                                    !editCondOperator ||
                                    (!NO_VALUE_OPERATORS.has(editCondOperator) && !editCondValue)
                                  : !editCondValue
                              }
                              className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingCondImageId(null)}
                              className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Conditional Image Form */}
            {isAdmin && !showAddCondImage && (
              <button
                onClick={() => setShowAddCondImage(true)}
                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
              >
                + Add Conditional Image
              </button>
            )}

            {isAdmin && showAddCondImage && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 bg-white dark:bg-gray-800">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Add Conditional Image
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={condName}
                      onChange={(e) => setCondName(e.target.value)}
                      placeholder="e.g. Day 1 Badge"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Placeholder
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-400">[</span>
                      <input
                        type="text"
                        value={condPlaceholder}
                        onChange={(e) =>
                          setCondPlaceholder(e.target.value.toUpperCase().replace(/\s+/g, '_'))
                        }
                        placeholder="IMG_DAY1"
                        className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm font-mono dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                      />
                      <span className="text-sm text-gray-400">]</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Condition Type
                    </label>
                    <select
                      value={condType}
                      onChange={(e) => {
                        setCondType(e.target.value);
                        setCondValue('');
                        setCondField('');
                        setCondOperator('eq');
                      }}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                    >
                      {CONDITION_TYPES.map((ct) => (
                        <option key={ct.key} value={ct.key}>
                          {ct.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {condType === 'field' ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Field
                      </label>
                      <select
                        value={condField}
                        onChange={(e) => setCondField(e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="">Select field...</option>
                        {CONDITION_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Condition Value
                      </label>
                      <select
                        value={condValue}
                        onChange={(e) => setCondValue(e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="">Select...</option>
                        {condValueOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                {condType === 'field' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Operator
                      </label>
                      <select
                        value={condOperator}
                        onChange={(e) => setCondOperator(e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                      >
                        {CONDITION_OPERATORS.map((op) => (
                          <option key={op.key} value={op.key}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {!NO_VALUE_OPERATORS.has(condOperator) && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Value
                        </label>
                        <input
                          type="text"
                          value={condValue}
                          onChange={(e) => setCondValue(e.target.value)}
                          placeholder="e.g. she/her"
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                        />
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Image File
                  </label>
                  <input
                    ref={condFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={(e) => setCondFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 dark:file:bg-primary-900/30 dark:file:text-primary-300 hover:file:bg-primary-100 dark:hover:file:bg-primary-900/50"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleUploadCondImage}
                    disabled={
                      uploadingCondImage ||
                      !condFile ||
                      !condName.trim() ||
                      !condPlaceholder.trim() ||
                      (condType === 'field'
                        ? !condField ||
                          !condOperator ||
                          (!NO_VALUE_OPERATORS.has(condOperator) && !condValue)
                        : !condValue)
                    }
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploadingCondImage ? 'Uploading...' : 'Add Image'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddCondImage(false);
                      setCondName('');
                      setCondPlaceholder('');
                      setCondType('booking_option');
                      setCondValue('');
                      setCondField('');
                      setCondOperator('eq');
                      setCondFile(null);
                      if (condFileRef.current) condFileRef.current.value = '';
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Use <code className="font-mono">[{condPlaceholder || 'PLACEHOLDER'}]</code> in
                  your badge template. The image will only appear when the condition is met.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
