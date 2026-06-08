import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';
import { usePortalBasePath } from '../../hooks/usePortalBasePath';
import type {
  PortalPaper,
  PortalPaperUpdateRequest,
  PortalConferenceDetail,
  PortalSpeakerFeedbackListResponse,
  PortalPaperFormSchema,
  PortalPaperFormField,
} from '../../types/portal';
import RichTextDisplay from '../../components/common/RichTextDisplay';
import { isAxiosError } from 'axios';
import { parseApiError } from '../../utils/apiError';
import MediaPreviewModal from '../../components/MediaPreviewModal';
import ConfirmDialog from '../../components/ConfirmDialog';
import PaperStatusLifeline from '../../components/PaperStatusLifeline';
import { validateVideo } from '../../utils/mediaValidation';
import { usePortalAuthMedia } from '../../hooks/usePortalAuthMedia';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import PaperEditForm from './PaperEditForm';
import PaperViewDisplay from './PaperViewDisplay';

const BUILTIN_FIELD_DEFS: { key: string; label: string; alwaysRequired?: boolean }[] = [
  { key: 'title', label: 'Title', alwaysRequired: true },
  { key: 'abstract_short', label: 'Short Abstract' },
  { key: 'abstract_long', label: 'Detailed Abstract' },
  { key: 'level', label: 'Level' },
  { key: 'learning_objectives', label: 'Learning Objectives' },
  { key: 'session_type', label: 'Session Type' },
  { key: 'topics', label: 'Topics' },
];

type UnifiedFormField = {
  type: 'builtin' | 'custom';
  key: string;
  label: string;
  display_order: number;
  is_visible: boolean;
  is_required: boolean;
  help_text?: string | null;
  min_chars?: number | null;
  max_chars?: number | null;
  options?: { value: string; label: string }[] | null;
  customField?: PortalPaperFormField;
};

function PaperDetailPage() {
  const { paperId } = useParams<{
    paperId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { applicant } = useApplicantAuth();
  const basePath = usePortalBasePath();

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editAbstractShort, setEditAbstractShort] = useState('');
  const [editAbstractLong, setEditAbstractLong] = useState('');
  const [editLevel, setEditLevel] = useState('');
  const [editSessionTypeId, setEditSessionTypeId] = useState('');
  const [editLearningObjectives, setEditLearningObjectives] = useState('');
  const [editCustomFieldAnswers, setEditCustomFieldAnswers] = useState<Record<string, unknown>>({});
  const [cospeakerEmails, setCospeakerEmails] = useState<string[]>([]);
  const [cospeakerInput, setCospeakerInput] = useState('');
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();

  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Media preview modal
  const [mediaPreview, setMediaPreview] = useState<{
    open: boolean;
    src: string | null;
  }>({ open: false, src: null });

  // Confirmation dialogs
  const [showUnsubmitConfirm, setShowUnsubmitConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: paper, isLoading } = useQuery({
    queryKey: ['portal-paper', paperId],
    queryFn: async () => {
      const res = await portalApi.get<PortalPaper>(`/portal/papers/${paperId}`);
      return res.data;
    },
    refetchInterval: 30000,
  });

  const { data: feedbackData } = useQuery({
    queryKey: ['portal-paper-feedback', paperId],
    queryFn: async () => {
      const res = await portalApi.get<PortalSpeakerFeedbackListResponse>(
        `/portal/papers/${paperId}/feedback`
      );
      return res.data;
    },
    enabled: !!paperId,
  });

  const existingVideoSrc = usePortalAuthMedia(paper?.video_url ?? null);
  const videoPreviewSrc = videoPreview || existingVideoSrc;

  // Load conference detail for session types when editing
  const { data: conferenceDetail } = useQuery({
    queryKey: ['portal-conference-detail', paper?.conference_id],
    queryFn: async () => {
      const res = await portalApi.get<PortalConferenceDetail>(
        `/portal/conferences/${paper!.conference_id}`
      );
      return res.data;
    },
    enabled: !!paper?.conference_id && (isEditing || paper?.status === 'draft'),
  });

  // Load form schema for character limits
  const { data: formSchema } = useQuery({
    queryKey: ['portal-paper-form-schema', paper?.cfp_id],
    queryFn: async () => {
      const res = await portalApi.get<PortalPaperFormSchema>(
        `/portal/cfp/${paper!.cfp_id}/paper-form-schema`
      );
      return res.data;
    },
    enabled: !!paper?.cfp_id && (isEditing || paper?.status === 'draft'),
    staleTime: 60_000,
  });

  // Build unified sorted list of all fields (builtin + custom) based on form schema display_order
  const unifiedFormFields = useMemo((): UnifiedFormField[] => {
    if (!formSchema) return [];

    const builtinConfig = paper?.form_variant_id
      ? (formSchema.variants?.find((v) => v.id === paper.form_variant_id)?.builtin_fields_config ??
        formSchema.builtin_fields_config ??
        {})
      : (formSchema.builtin_fields_config ?? {});
    const customFieldsList = paper?.form_variant_id
      ? (formSchema.variants?.find((v) => v.id === paper.form_variant_id)?.fields ??
        formSchema.fields)
      : formSchema.fields;
    const builtinCount = BUILTIN_FIELD_DEFS.length;

    const builtinFields: UnifiedFormField[] = BUILTIN_FIELD_DEFS.map((bf, defaultIdx) => {
      const config = builtinConfig[bf.key];
      return {
        type: 'builtin' as const,
        key: bf.key,
        label: bf.label,
        display_order: config?.display_order ?? defaultIdx,
        is_visible: config?.visible !== false,
        is_required: bf.alwaysRequired || config?.required || false,
        help_text: config?.help_text,
        min_chars: config?.min_chars,
        max_chars: config?.max_chars,
        options: config?.options,
      };
    });

    const customFields: UnifiedFormField[] = (customFieldsList ?? [])
      .filter((f) => f.is_visible)
      .map((f) => {
        const unifiedOrderingInUse = Object.values(builtinConfig).some(
          (c) => c.display_order !== undefined && c.display_order !== null
        );
        const order = unifiedOrderingInUse ? f.display_order : f.display_order + builtinCount;

        return {
          type: 'custom' as const,
          key: f.field_key,
          label: f.label,
          display_order: order,
          is_visible: f.is_visible,
          is_required: f.is_required,
          customField: f,
        };
      });

    return [...builtinFields, ...customFields]
      .filter((f) => f.is_visible)
      .sort((a, b) => a.display_order - b.display_order);
  }, [formSchema, paper?.form_variant_id]);

  useEffect(() => {
    return () => {
      if (videoPreview) URL.revokeObjectURL(videoPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setVideoError(null);
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
      setVideoPreview(null);
    }
    if (!file) {
      setVideoFile(null);
      return;
    }
    const validationError = validateVideo(file, 50);
    if (validationError) {
      setVideoError(validationError);
      setVideoFile(null);
      e.target.value = '';
      return;
    }
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const uploadVideo = async (paperId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('entity_type', 'paper_video');
    form.append('entity_id', paperId);
    await portalApi.post('/portal/attachments', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  };

  const updateMutation = useMutation({
    mutationFn: async (payload: PortalPaperUpdateRequest) => {
      const res = await portalApi.put<PortalPaper>(`/portal/papers/${paperId}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-paper', paperId] });
      queryClient.invalidateQueries({ queryKey: ['portal-papers'] });
      setIsEditing(false);
      setError('');
      setSaved();
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update paper.'));
      setSaveError();
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await portalApi.post<PortalPaper>(`/portal/papers/${paperId}/submit`);
      return res.data;
    },
    onSuccess: () => {
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['portal-paper', paperId] });
      queryClient.invalidateQueries({ queryKey: ['portal-papers'] });
      queryClient.invalidateQueries({ queryKey: ['portal-assigned-papers'] });
      queryClient.invalidateQueries({ queryKey: ['portal-pending-assignments'] });
    },
    onError: (err: unknown) => {
      const detail = isAxiosError(err) ? err.response?.data?.detail : undefined;
      if (detail && typeof detail === 'object' && 'missing_fields' in detail) {
        const fieldLabels: Record<string, string> = {
          'paper:abstract_short': 'Short Abstract',
          'paper:abstract_long': 'Detailed Abstract',
          'paper:level': 'Level',
          'paper:learning_objectives': 'Learning Objectives',
          'paper:session_type': 'Session Type',
          'paper:topics': 'Topics',
          'speaker:bio': 'Speaker Bio',
          'speaker:picture': 'Speaker Picture',
          'speaker:video': 'Speaker Video',
          'speaker:phone': 'Speaker Phone',
          'speaker:title': 'Speaker Title',
          'speaker:company': 'Speaker Company',
        };
        const missingFields = (detail as { missing_fields: string[] }).missing_fields;
        const names = missingFields.map((f: string) => fieldLabels[f] || f);
        setError(`Missing required fields: ${names.join(', ')}`);
      } else if (detail && typeof detail === 'object' && 'char_errors' in detail) {
        const charErrors = (detail as { char_errors: string[] }).char_errors;
        setError(charErrors.join('. '));
      } else {
        setError(typeof detail === 'string' ? detail : 'Failed to submit paper.');
      }
    },
  });

  const unsubmitMutation = useMutation({
    mutationFn: async () => {
      const res = await portalApi.post<PortalPaper>(`/portal/papers/${paperId}/unsubmit`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-paper', paperId] });
      queryClient.invalidateQueries({ queryKey: ['portal-papers'] });
      queryClient.invalidateQueries({ queryKey: ['portal-assigned-papers'] });
      queryClient.invalidateQueries({ queryKey: ['portal-pending-assignments'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to revert paper to draft.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await portalApi.delete(`/portal/papers/${paperId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-papers'] });
      queryClient.invalidateQueries({ queryKey: ['portal-assigned-papers'] });
      queryClient.invalidateQueries({ queryKey: ['portal-pending-assignments'] });
      navigate(`${basePath}/dashboard`);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to delete paper.'));
    },
  });

  const startEditing = () => {
    if (!paper) return;
    setEditTitle(paper.title);
    setEditAbstractShort(paper.abstract_short || '');
    setEditAbstractLong(paper.abstract_long || '');
    setEditLevel(paper.level || '');
    setEditSessionTypeId(paper.session_type_id || '');
    setEditLearningObjectives(paper.learning_objectives || '');
    setCospeakerEmails(paper.cospeakers.map((cs) => cs.email));
    setEditCustomFieldAnswers(paper.custom_field_answers || {});
    setVideoFile(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null);
    setVideoError(null);
    setIsEditing(true);
    setError('');
  };

  // Auto-enter edit mode for draft papers
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (paper && paper.status === 'draft' && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      startEditing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper]);

  const handleSave = async () => {
    if (videoError) return;

    setSaving();

    const payload: PortalPaperUpdateRequest = {
      title: editTitle,
      abstract_short: editAbstractShort || undefined,
      abstract_long: editAbstractLong || undefined,
      level: editLevel || undefined,
      session_type_id: editSessionTypeId || undefined,
      learning_objectives: editLearningObjectives || undefined,
      ...(paper?.is_main_speaker ? { cospeaker_emails: cospeakerEmails } : {}),
      ...(Object.keys(editCustomFieldAnswers).length > 0
        ? { custom_field_answers: editCustomFieldAnswers }
        : {}),
    };

    try {
      await updateMutation.mutateAsync(payload);

      if (videoFile && paperId) {
        try {
          await uploadVideo(paperId, videoFile);
          setVideoFile(null);
          queryClient.invalidateQueries({
            queryKey: ['portal-paper', paperId],
          });
        } catch {
          // non-fatal
        }
      }
    } catch {
      // error handled by onError
    }
  };

  const handleAddCospeaker = () => {
    const email = cospeakerInput.trim().toLowerCase();
    if (!email) return;
    if (applicant && email === applicant.email.toLowerCase()) {
      setError('You cannot add yourself as a co-speaker');
      return;
    }
    if (cospeakerEmails.length >= 3) {
      setError('Maximum 3 co-speakers allowed');
      return;
    }
    if (cospeakerEmails.includes(email)) {
      setError('This email is already added');
      return;
    }
    setCospeakerEmails([...cospeakerEmails, email]);
    setCospeakerInput('');
    setError('');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">Paper not found.</div>
    );
  }

  const isDraft = paper.status === 'draft';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isEditing ? 'Edit Paper' : paper.title}
            {!paper.is_main_speaker && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 align-middle">
                Co-speaker
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isEditing ? 'Edit the paper details below.' : 'View paper details.'}
            {!paper.is_main_speaker &&
              (paper.main_speaker_first_name || paper.main_speaker_last_name) && (
                <span className="ml-2 text-gray-400 dark:text-gray-500">
                  Main speaker:{' '}
                  {`${paper.main_speaker_first_name || ''} ${paper.main_speaker_last_name || ''}`.trim()}
                </span>
              )}
          </p>
        </div>
        {isDraft && !isEditing && (
          <div className="flex flex-wrap gap-2">
            {paper.is_main_speaker && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            )}
            <button
              onClick={startEditing}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {submitMutation.isPending ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        )}
        {paper.status === 'submitted' && (
          <button
            onClick={() => setShowUnsubmitConfirm(true)}
            disabled={unsubmitMutation.isPending}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            {unsubmitMutation.isPending ? 'Reverting...' : 'Revert to Draft'}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        {/* Status lifeline */}
        <div className="mb-6">
          <PaperStatusLifeline status={paper.status} />
          {paper.conference_name && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{paper.conference_name}</p>
          )}
        </div>

        {isEditing ? (
          <PaperEditForm
            paper={paper}
            unifiedFormFields={unifiedFormFields}
            conferenceDetail={conferenceDetail}
            editTitle={editTitle}
            setEditTitle={setEditTitle}
            editAbstractShort={editAbstractShort}
            setEditAbstractShort={setEditAbstractShort}
            editAbstractLong={editAbstractLong}
            setEditAbstractLong={setEditAbstractLong}
            editLevel={editLevel}
            setEditLevel={setEditLevel}
            editSessionTypeId={editSessionTypeId}
            setEditSessionTypeId={setEditSessionTypeId}
            editLearningObjectives={editLearningObjectives}
            setEditLearningObjectives={setEditLearningObjectives}
            editCustomFieldAnswers={editCustomFieldAnswers}
            setEditCustomFieldAnswers={setEditCustomFieldAnswers}
            cospeakerEmails={cospeakerEmails}
            setCospeakerEmails={setCospeakerEmails}
            cospeakerInput={cospeakerInput}
            setCospeakerInput={setCospeakerInput}
            emailError={emailError}
            setEmailError={setEmailError}
            videoPreviewSrc={videoPreviewSrc}
            videoError={videoError}
            saveStatus={saveStatus}
            isUpdatePending={updateMutation.isPending}
            isSubmitPending={submitMutation.isPending}
            isDeletePending={deleteMutation.isPending}
            submitError={error || undefined}
            onSave={handleSave}
            onSubmit={() => submitMutation.mutate()}
            onCancel={() => setIsEditing(false)}
            onDelete={() => setShowDeleteConfirm(true)}
            onAddCospeaker={handleAddCospeaker}
            onVideoChange={handleVideoChange}
            onMediaPreview={(src) => setMediaPreview({ open: true, src })}
          />
        ) : (
          <PaperViewDisplay
            paper={paper}
            videoPreviewSrc={videoPreviewSrc}
            onMediaPreview={(src) => setMediaPreview({ open: true, src })}
          />
        )}
      </div>

      {/* Reviewer Feedback Section */}
      {feedbackData && feedbackData.items.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Reviewer Feedback
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Anonymous feedback from program committee reviewers.
          </p>
          <div className="space-y-4">
            {feedbackData.items.map((feedback, index) => (
              <div
                key={index}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Reviewer {index + 1}
                  </span>
                  {feedback.total_score != null && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
                      Score: {feedback.total_score.toFixed(1)}
                    </span>
                  )}
                </div>
                <RichTextDisplay
                  content={feedback.speaker_feedback}
                  className="text-sm text-gray-700 dark:text-gray-300"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => navigate(`${basePath}/dashboard`)}
        className="mt-4 inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to My Papers
      </button>

      {/* Media Preview Modal */}
      <MediaPreviewModal
        open={mediaPreview.open}
        onClose={() => setMediaPreview({ open: false, src: null })}
        src={mediaPreview.src}
        type="video"
        alt="Paper video"
      />

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={showUnsubmitConfirm}
        title="Revert to Draft"
        message="Revert this paper to draft? You can edit and resubmit it afterwards."
        confirmLabel="Revert to Draft"
        variant="warning"
        onConfirm={() => {
          setShowUnsubmitConfirm(false);
          unsubmitMutation.mutate();
        }}
        onCancel={() => setShowUnsubmitConfirm(false)}
      />
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Draft"
        message="Are you sure you want to delete this draft? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          deleteMutation.mutate();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

export default PaperDetailPage;
