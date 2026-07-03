import { useState, useCallback } from 'react';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';
import { parseApiError } from '../../../utils/apiError';

/**
 * Badge PDF generation (preview, single download, bulk download) plus the
 * transient UI state that drives the buttons and preview modal. Extracted from
 * BadgesTab so the tab component stays focused on layout.
 */
export function useBadgeGeneration(conferenceId: string, badgeType: string) {
  const { showToast } = useToast();
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);

  const handlePreview = useCallback(
    async (registrationId: string) => {
      setGeneratingId(registrationId);
      try {
        const res = await api.post(
          `/conferences/${conferenceId}/badges/preview/${registrationId}`,
          null,
          { responseType: 'blob', params: { badge_type: badgeType } }
        );
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const reader = new FileReader();
        reader.onloadend = () => setPreviewBlobUrl(reader.result as string);
        reader.readAsDataURL(blob);
      } catch (err: unknown) {
        showToast(parseApiError(err, 'Failed to generate preview'), 'error');
      } finally {
        setGeneratingId(null);
      }
    },
    [conferenceId, badgeType, showToast]
  );

  const handleDownload = useCallback(
    async (registrationId: string, name: string) => {
      setGeneratingId(registrationId);
      try {
        const res = await api.post(
          `/conferences/${conferenceId}/badges/generate/${registrationId}`,
          null,
          { responseType: 'blob', params: { badge_type: badgeType } }
        );
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `badge_${name.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err: unknown) {
        showToast(parseApiError(err, 'Failed to download badge'), 'error');
      } finally {
        setGeneratingId(null);
      }
    },
    [conferenceId, badgeType, showToast]
  );

  const handleBulkDownload = useCallback(
    async (regIds: string[]) => {
      if (regIds.length === 0) {
        showToast('No registrations selected', 'warning');
        return;
      }
      setBulkGenerating(true);
      try {
        const res = await api.post(
          `/conferences/${conferenceId}/badges/generate-bulk`,
          { registration_ids: regIds, badge_type: badgeType },
          { responseType: 'blob' }
        );
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `badges_bulk_${badgeType}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`${regIds.length} badges generated`, 'success');
      } catch (err: unknown) {
        showToast(parseApiError(err, 'Failed to generate bulk badges'), 'error');
      } finally {
        setBulkGenerating(false);
      }
    },
    [conferenceId, badgeType, showToast]
  );

  return {
    previewBlobUrl,
    setPreviewBlobUrl,
    generatingId,
    bulkGenerating,
    handlePreview,
    handleDownload,
    handleBulkDownload,
  };
}
