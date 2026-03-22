import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { queryKeys } from '../../../../../config/queryKeys';
import { useToast } from '../../../../../components/Toast';
import { parseApiError } from '../../../../../utils/apiError';
import BadgeTemplateEditor from '../../../../../components/BadgeTemplateEditor';
import { ErrorBanner } from '../../../../../components/common/ErrorBanner';
import type { Conference } from '../../../../../types';
import { DirtyContext } from '../../../DirtyContext';
import { BADGE_TYPES, type BadgeTypeKey, type ConditionalImage } from './constants';
import { QrConfigSection } from './QrConfigSection';
import { ConditionalImagesSection } from './ConditionalImagesSection';

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
      <QrConfigSection
        conferenceId={conference.id}
        isAdmin={isAdmin}
        showQrConfig={showQrConfig}
        setShowQrConfig={setShowQrConfig}
        qrFields={qrFields}
        toggleQrField={toggleQrField}
        qrLogoAttachmentId={qrLogoAttachmentId}
        qrPreviewUrl={qrPreviewUrl}
        uploadingLogo={uploadingLogo}
        handleQrLogoUpload={handleQrLogoUpload}
        handleRemoveQrLogo={handleRemoveQrLogo}
        refetchQrPreview={() => refetchQrPreview()}
      />

      {/* Conditional Images */}
      <ConditionalImagesSection
        conferenceId={conference.id}
        isAdmin={isAdmin}
        showCondImages={showCondImages}
        setShowCondImages={setShowCondImages}
        conditionalImages={conditionalImages}
        setConditionalImages={setConditionalImages}
      />
    </div>
  );
}
