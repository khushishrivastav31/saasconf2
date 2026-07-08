import { useEffect, useRef, useState, useMemo } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useSaveStatus } from '../../../../../hooks/useSaveStatus';
import { useAuthMedia } from '../../../../../hooks/useAuthMedia';
import { ErrorBanner } from '../../../../../components/common/ErrorBanner';
import PaperStatusLifeline from '../../../../../components/PaperStatusLifeline';
import type { Paper } from '../../../../../types';
import { zResolver } from '../../../../../lib/forms';
import { MainSpeakerSearch, CospeakerSearch } from '../SpeakerSearch';
import { emptyForm, paperFormSchema, paperToFormData, type PaperFormData } from './schema';
import { usePaperFormData } from './usePaperFormData';
import { usePaperVideoState } from './usePaperVideoState';
import PaperFieldRenderer from './PaperFieldRenderer';
import PaperVideoInput from './PaperVideoInput';
import PaperReadOnlySections from './PaperReadOnlySections';
import PaperFormActions from './PaperFormActions';

export type { PaperFormData } from './schema';

interface PaperFormProps {
  paper: Paper | null;
  conferenceId: string;
  fallbackCfpId?: string;
  onSave: (
    data: PaperFormData,
    videoFile: File | null,
    customFieldFiles: Record<string, File>
  ) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onSubmit?: () => void;
  onUnsubmit?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  isSaving: boolean;
  isDeleting?: boolean;
  isSubmitting?: boolean;
  isUnsubmitting?: boolean;
  isAccepting?: boolean;
  isRejecting?: boolean;
  error: string | null;
}

export function PaperForm({
  paper,
  conferenceId,
  fallbackCfpId,
  onSave,
  onCancel,
  onDelete,
  onSubmit,
  onUnsubmit,
  onAccept,
  onReject,
  isSaving,
  isDeleting,
  isSubmitting,
  isUnsubmitting,
  isAccepting,
  isRejecting,
  error,
}: PaperFormProps) {
  const canEdit = !paper || paper.status === 'draft';

  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();
  const wasSavingRef = useRef(false);

  useEffect(() => {
    if (isSaving) {
      setSaving();
      wasSavingRef.current = true;
    } else if (wasSavingRef.current) {
      wasSavingRef.current = false;
      if (error) {
        setSaveError();
      } else {
        setSaved();
      }
    }
  }, [isSaving, error, setSaving, setSaved, setSaveError]);

  const methods = useForm<PaperFormData>({
    resolver: zResolver(paperFormSchema),
    defaultValues: paper ? paperToFormData(paper) : emptyForm,
    mode: 'onSubmit',
  });
  const { reset, setValue, watch, handleSubmit } = methods;

  const { applicants, topics, sessionTypes, assignments, conferenceCfpId, unifiedFormFields } =
    usePaperFormData({
      conferenceId,
      paperId: paper?.id ?? null,
      fallbackCfpId,
    });

  const { videoFile, videoPreview, videoError, mediaPreview, setMediaPreview, handleVideoChange } =
    usePaperVideoState(paper?.id ?? null);

  const existingVideoSrc = useAuthMedia(paper?.video_url ?? null);
  const videoPreviewSrc = videoPreview || existingVideoSrc;

  const [customFieldAnswers, setCustomFieldAnswers] = useState<Record<string, unknown>>({});
  const setCustomFieldAnswer = (key: string, value: unknown) => {
    setCustomFieldAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const [customFieldFiles, setCustomFieldFiles] = useState<Record<string, File>>({});
  const handleFileSelect = (fieldKey: string, file: File | null) => {
    setCustomFieldFiles((prev) => {
      if (!file) {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      }
      return { ...prev, [fieldKey]: file };
    });
  };

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Reset form when the paper changes
  useEffect(() => {
    reset(paper ? paperToFormData(paper) : { ...emptyForm, cfp_id: conferenceCfpId || '' });
    setCustomFieldAnswers(paper?.custom_field_answers ?? {});
    setCustomFieldFiles({});
    setValidationErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.id]);

  // Sync custom field answers when backend data is refreshed on the same paper
  // (e.g., after a file upload patches custom_field_answers without changing paper.id)
  const customFieldAnswersJson = JSON.stringify(paper?.custom_field_answers ?? null);
  useEffect(() => {
    setCustomFieldAnswers(paper?.custom_field_answers ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFieldAnswersJson]);

  // Auto-assign CFP when data loads (for new papers)
  const currentCfpId = watch('cfp_id');
  useEffect(() => {
    if (!paper && conferenceCfpId && !currentCfpId) {
      setValue('cfp_id', conferenceCfpId);
    }
  }, [paper, conferenceCfpId, currentCfpId, setValue]);

  const mainSpeakerId = watch('main_speaker_id');
  const coSpeakerIds = watch('co_speaker_ids');

  const availableCospeakers = useMemo(() => {
    return applicants.filter((a) => a.id !== mainSpeakerId);
  }, [applicants, mainSpeakerId]);

  const handleMainSpeakerSelect = (id: string) => {
    setValue('main_speaker_id', id, { shouldDirty: true });
    setValue(
      'co_speaker_ids',
      coSpeakerIds.filter((cid) => cid !== id),
      { shouldDirty: true }
    );
  };

  const handleCospeakerToggle = (applicantId: string) => {
    const current = coSpeakerIds;
    if (current.includes(applicantId)) {
      setValue(
        'co_speaker_ids',
        current.filter((id) => id !== applicantId),
        { shouldDirty: true }
      );
    } else if (current.length < 3) {
      setValue('co_speaker_ids', [...current, applicantId], { shouldDirty: true });
    }
  };

  const onFormValid = (data: PaperFormData) => {
    const resolvedCfpId = data.cfp_id || conferenceCfpId;
    const errors: string[] = [];
    if (!resolvedCfpId)
      errors.push('No CFP is linked to this conference. Please create or link a CFP first.');
    if (!data.main_speaker_id) errors.push('Please select a main speaker.');
    if (!data.title.trim()) errors.push('Please enter a title.');
    if (videoError) errors.push(videoError);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    onSave({ ...data, cfp_id: resolvedCfpId }, videoFile, customFieldFiles);
  };

  const onFormInvalid = () => {
    const errors: string[] = [];
    const values = methods.getValues();
    if (!values.main_speaker_id) errors.push('Please select a main speaker.');
    if (!values.title.trim()) errors.push('Please enter a title.');
    if (videoError) errors.push(videoError);
    if (errors.length === 0) errors.push('Please fix the highlighted fields.');
    setValidationErrors(errors);
  };

  const displayStatus = paper?.display_status || paper?.status;

  // Errors and validation messages render at the top of a long form; scroll
  // them into view so a submit failure isn't missed below the fold.
  const errorAnchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error || validationErrors.length > 0) {
      errorAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error, validationErrors]);

  return (
    <FormProvider {...methods}>
      <form className="space-y-5" onSubmit={handleSubmit(onFormValid, onFormInvalid)} noValidate>
        <div ref={errorAnchorRef} />
        <ErrorBanner message={error} />
        {validationErrors.length > 0 && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 p-3">
            <ul className="list-disc list-inside text-sm text-amber-800 dark:text-amber-300 space-y-1">
              {validationErrors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {paper && (
          <div className="mb-2">
            <PaperStatusLifeline status={displayStatus || paper.status} />
          </div>
        )}

        <MainSpeakerSearch
          applicants={applicants}
          selectedId={mainSpeakerId}
          onSelect={handleMainSpeakerSelect}
          onClear={() => setValue('main_speaker_id', '', { shouldDirty: true })}
          disabled={!canEdit}
        />

        <CospeakerSearch
          applicants={availableCospeakers}
          selectedIds={coSpeakerIds}
          existingCospeakers={paper?.cospeakers || []}
          onToggle={handleCospeakerToggle}
          disabled={!canEdit}
        />

        <PaperFieldRenderer
          fields={unifiedFormFields}
          canEdit={canEdit}
          topics={topics}
          sessionTypes={sessionTypes}
          customFieldAnswers={customFieldAnswers}
          setCustomFieldAnswer={setCustomFieldAnswer}
          onFileSelect={handleFileSelect}
          pendingFileNames={Object.fromEntries(
            Object.entries(customFieldFiles).map(([k, f]) => [k, f.name])
          )}
        />

        {unifiedFormFields.some((f) => f.key === 'video' && f.is_visible) && (
          <PaperVideoInput
            canEdit={canEdit}
            videoPreviewSrc={videoPreviewSrc}
            videoError={videoError}
            mediaPreview={mediaPreview}
            onMediaPreviewOpen={(src) => setMediaPreview({ open: true, src })}
            onMediaPreviewClose={() => setMediaPreview({ open: false, src: null })}
            onVideoChange={handleVideoChange}
          />
        )}

        <PaperReadOnlySections paper={paper} assignments={assignments} />

        <PaperFormActions
          paper={paper}
          canEdit={canEdit}
          saveStatus={saveStatus}
          isSaving={isSaving}
          isDeleting={isDeleting}
          isSubmitting={isSubmitting}
          isUnsubmitting={isUnsubmitting}
          isAccepting={isAccepting}
          isRejecting={isRejecting}
          videoError={videoError}
          onCancel={onCancel}
          onDelete={onDelete}
          onSubmit={onSubmit}
          onUnsubmit={onUnsubmit}
          onAccept={onAccept}
          onReject={onReject}
          onSave={handleSubmit(onFormValid, onFormInvalid)}
        />
      </form>
    </FormProvider>
  );
}
