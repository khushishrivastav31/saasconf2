import { useState, useEffect, useMemo, useRef } from 'react';
import { useSaveStatus } from '../../../../hooks/useSaveStatus';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useAuthMedia } from '../../../../hooks/useAuthMedia';
import { formatDate } from '../../../../utils/formatDate';
import type {
  Paper,
  PaperLevel,
  Applicant,
  CallForPapers,
  CFPTopic,
  SessionType,
  PaperFormSchema,
  PaperFormField,
} from '../../../../types';
import type { PaperAssignmentListResponse } from '../../../../types/review';
import { ACCEPTED_VIDEO_FORMATS, validateVideo } from '../../../../utils/mediaValidation';
import { DeleteIcon } from '../../../ConferenceDetail/icons';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import MediaPreviewModal from '../../../../components/MediaPreviewModal';
import PaperStatusLifeline from '../../../../components/PaperStatusLifeline';
import { MainSpeakerSearch, CospeakerSearch } from './SpeakerSearch';

interface ApplicantListResponse {
  items: Applicant[];
  total: number;
}

interface CFPListResponse {
  items: CallForPapers[];
  total: number;
}

interface TopicListResponse {
  items: CFPTopic[];
  total: number;
}

interface SessionTypeListResponse {
  items: SessionType[];
  total: number;
}

export interface PaperFormData {
  cfp_id: string;
  main_speaker_id: string;
  co_speaker_ids: string[];
  session_type_id: string;
  topic_ids: string[];
  title: string;
  abstract_short: string;
  abstract_long: string;
  level: PaperLevel | '';
  learning_objectives: string;
}

const emptyForm: PaperFormData = {
  cfp_id: '',
  main_speaker_id: '',
  co_speaker_ids: [],
  session_type_id: '',
  topic_ids: [],
  title: '',
  abstract_short: '',
  abstract_long: '',
  level: '',
  learning_objectives: '',
};

const LEVEL_OPTIONS: { value: PaperLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'all_levels', label: 'All Levels' },
];

const BUILTIN_FIELD_DEFS: { key: string; label: string; alwaysRequired?: boolean }[] = [
  { key: 'title', label: 'Title', alwaysRequired: true },
  { key: 'abstract_short', label: 'Short Abstract' },
  { key: 'abstract_long', label: 'Long Abstract' },
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
  customField?: PaperFormField;
};

// ---------------------------------------------------------------------------
// Paper form component
// ---------------------------------------------------------------------------

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
}: {
  paper: Paper | null; // null = creating
  conferenceId: string;
  fallbackCfpId?: string;
  onSave: (data: PaperFormData, videoFile: File | null) => void;
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
}) {
  const isEditing = !!paper;
  const canEdit = !paper || paper.status === 'draft';

  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();
  const wasSavingRef = useRef(false);

  // Track save status transitions based on isSaving and error props
  useEffect(() => {
    if (isSaving) {
      setSaving();
      wasSavingRef.current = true;
    } else if (wasSavingRef.current) {
      // Just finished saving
      wasSavingRef.current = false;
      if (error) {
        setSaveError();
      } else {
        setSaved();
      }
    }
  }, [isSaving, error, setSaving, setSaved, setSaveError]);

  const [formData, setFormData] = useState<PaperFormData>(
    paper
      ? {
          cfp_id: paper.cfp_id,
          main_speaker_id: paper.main_speaker_id,
          co_speaker_ids: paper.cospeakers.map((c) => c.applicant.id),
          session_type_id: paper.session_type_id || '',
          topic_ids: paper.topics.map((t) => t.id),
          title: paper.title,
          abstract_short: paper.abstract_short || '',
          abstract_long: paper.abstract_long || '',
          level: paper.level || '',
          learning_objectives: paper.learning_objectives || '',
        }
      : emptyForm
  );

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [customFieldAnswers, setCustomFieldAnswers] = useState<Record<string, unknown>>({});
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Media preview modal state
  const [mediaPreview, setMediaPreview] = useState<{
    open: boolean;
    src: string | null;
  }>({ open: false, src: null });

  const existingVideoSrc = useAuthMedia(paper?.video_url ?? null);
  const videoPreviewSrc = videoPreview || existingVideoSrc;

  // Fetch the conference's CFP (one per conference) to auto-assign
  const { data: cfpsData, error: cfpQueryError } = useQuery({
    queryKey: ['cfp-list', conferenceId],
    queryFn: async () => {
      const response = await api.get<CFPListResponse>(`/conferences/${conferenceId}/cfps`);
      return response.data;
    },
    enabled: !!conferenceId,
    retry: 2,
  });

  const conferenceCfpId = cfpsData?.items?.[0]?.id || fallbackCfpId || '';

  // Log CFP query failures so they don't get silently swallowed
  useEffect(() => {
    if (cfpQueryError) {
      console.error(
        '[PaperForm] Failed to fetch CFPs for conference:',
        conferenceId,
        cfpQueryError
      );
    }
  }, [cfpQueryError, conferenceId]);

  // Auto-assign CFP when data loads (for new papers)
  useEffect(() => {
    if (!paper && conferenceCfpId && !formData.cfp_id) {
      setFormData((d) => ({ ...d, cfp_id: conferenceCfpId }));
    }
  }, [paper, conferenceCfpId, formData.cfp_id]);

  // Fetch applicants
  const { data: applicantsData } = useQuery({
    queryKey: ['cfp-applicants'],
    queryFn: async () => {
      const response = await api.get<ApplicantListResponse>('/cfp/applicants');
      return response.data;
    },
  });

  // Fetch topics
  const { data: topicsData } = useQuery({
    queryKey: ['cfp-topics'],
    queryFn: async () => {
      const response = await api.get<TopicListResponse>('/cfp/topics');
      return response.data;
    },
  });

  // Fetch session types (only CFP-eligible) scoped to this conference
  const { data: sessionTypesData } = useQuery({
    queryKey: ['session-types', conferenceId],
    queryFn: async () => {
      const response = await api.get<SessionTypeListResponse>(
        `/conferences/${conferenceId}/settings/session-types`
      );
      return response.data;
    },
  });

  // Fetch assignments for this paper
  const { data: assignmentsData } = useQuery({
    queryKey: ['paper-assignments', paper?.id],
    queryFn: async () => {
      const response = await api.get<PaperAssignmentListResponse>(
        `/cfp/papers/${paper!.id}/assignments`
      );
      return response.data;
    },
    enabled: !!paper?.id,
  });
  const assignments = assignmentsData?.items || [];

  // Load form schema for character limits
  const { data: formSchemaData } = useQuery({
    queryKey: ['paper-form-schema', conferenceId],
    queryFn: async () => {
      const res = await api.get<PaperFormSchema>(`/conferences/${conferenceId}/paper-form-schema`);
      return res.data;
    },
    staleTime: 60_000,
  });

  // Build unified sorted list of all fields (builtin + custom) based on form schema display_order
  const unifiedFormFields = useMemo((): UnifiedFormField[] => {
    const builtinConfig = formSchemaData?.builtin_fields_config ?? {};
    const customFieldsList = formSchemaData?.fields ?? [];
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

    const customFields: UnifiedFormField[] = customFieldsList
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
  }, [formSchemaData]);

  const applicants = useMemo(() => applicantsData?.items || [], [applicantsData?.items]);
  const topics = topicsData?.items || [];
  const sessionTypes = useMemo(() => {
    return (sessionTypesData?.items || []).filter((st) => st.cfp_eligible && st.is_active);
  }, [sessionTypesData?.items]);

  // Available co-speakers (exclude main speaker)
  const availableCospeakers = useMemo(() => {
    return applicants.filter((a) => a.id !== formData.main_speaker_id);
  }, [applicants, formData.main_speaker_id]);

  // Reset form when the paper changes
  useEffect(() => {
    setFormData((prev) =>
      paper
        ? {
            cfp_id: paper.cfp_id,
            main_speaker_id: paper.main_speaker_id,
            co_speaker_ids: paper.cospeakers.map((c) => c.applicant.id),
            session_type_id: paper.session_type_id || '',
            topic_ids: paper.topics.map((t) => t.id),
            title: paper.title,
            abstract_short: paper.abstract_short || '',
            abstract_long: paper.abstract_long || '',
            level: paper.level || '',
            learning_objectives: paper.learning_objectives || '',
          }
        : { ...emptyForm, cfp_id: prev.cfp_id || conferenceCfpId }
    );
    setVideoFile(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null);
    setVideoError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.id]);

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

  const handleCospeakerToggle = (applicantId: string) => {
    setFormData((d) => {
      const current = d.co_speaker_ids;
      if (current.includes(applicantId)) {
        return { ...d, co_speaker_ids: current.filter((id) => id !== applicantId) };
      }
      if (current.length >= 3) {
        return d; // Max 3 co-speakers
      }
      return { ...d, co_speaker_ids: [...current, applicantId] };
    });
  };

  const handleTopicToggle = (topicId: string) => {
    setFormData((d) => {
      const current = d.topic_ids;
      if (current.includes(topicId)) {
        return { ...d, topic_ids: current.filter((id) => id !== topicId) };
      }
      return { ...d, topic_ids: [...current, topicId] };
    });
  };

  const handleFormSubmit = () => {
    // Resolve cfp_id at submit time (useEffect race condition can leave it empty)
    const resolvedCfpId = formData.cfp_id || conferenceCfpId;
    const errors: string[] = [];
    if (!resolvedCfpId)
      errors.push('No CFP is linked to this conference. Please create or link a CFP first.');
    if (!formData.main_speaker_id) errors.push('Please select a main speaker.');
    if (!formData.title.trim()) errors.push('Please enter a title.');
    if (videoError) errors.push(videoError);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    const submitData = { ...formData, cfp_id: resolvedCfpId };
    onSave(submitData, videoFile);
  };

  const displayStatus = paper?.display_status || paper?.status;

  return (
    <div className="space-y-5">
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

      {/* Status lifeline for existing papers */}
      {paper && (
        <div className="mb-2">
          <PaperStatusLifeline status={displayStatus || paper.status} />
        </div>
      )}

      {/* Main Speaker */}
      <MainSpeakerSearch
        applicants={applicants}
        selectedId={formData.main_speaker_id}
        onSelect={(id) => {
          setFormData((d) => ({
            ...d,
            main_speaker_id: id,
            co_speaker_ids: d.co_speaker_ids.filter((cid) => cid !== id),
          }));
        }}
        onClear={() => setFormData((d) => ({ ...d, main_speaker_id: '' }))}
        disabled={!canEdit}
      />

      {/* Co-speakers */}
      <CospeakerSearch
        applicants={availableCospeakers}
        selectedIds={formData.co_speaker_ids}
        existingCospeakers={paper?.cospeakers || []}
        onToggle={handleCospeakerToggle}
        disabled={!canEdit}
      />

      {/* Dynamic Form Fields - rendered in form schema display_order */}
      {unifiedFormFields.map((field) => {
        if (field.type === 'builtin') {
          switch (field.key) {
            case 'title':
              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData((d) => ({ ...d, title: e.target.value }))}
                    disabled={!canEdit}
                    maxLength={field.max_chars ?? undefined}
                    minLength={field.min_chars ?? undefined}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                    required
                  />
                  {(field.min_chars != null || field.max_chars != null) && (
                    <div className="flex justify-end mt-1">
                      <span
                        className={`text-xs ${
                          field.max_chars != null && formData.title.length > field.max_chars
                            ? 'text-red-600 font-medium'
                            : field.min_chars != null &&
                                formData.title.length > 0 &&
                                formData.title.length < field.min_chars
                              ? 'text-red-600 font-medium'
                              : 'text-gray-400 dark:text-gray-500'
                        }`}
                      >
                        {formData.title.length}
                        {field.min_chars != null && <span> (min {field.min_chars})</span>}
                        {field.max_chars != null && <span> / {field.max_chars}</span>}
                      </span>
                    </div>
                  )}
                  {field.help_text && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {field.help_text}
                    </p>
                  )}
                </div>
              );

            case 'session_type':
              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Session Type
                    {field.is_required && <span className="text-red-500"> *</span>}
                  </label>
                  <select
                    value={formData.session_type_id}
                    onChange={(e) =>
                      setFormData((d) => ({ ...d, session_type_id: e.target.value }))
                    }
                    disabled={!canEdit}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                  >
                    <option value="">Select session type...</option>
                    {sessionTypes.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.duration_minutes} min)
                      </option>
                    ))}
                  </select>
                  {field.help_text && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {field.help_text}
                    </p>
                  )}
                </div>
              );

            case 'topics':
              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Topics
                    {field.is_required && <span className="text-red-500"> *</span>}
                  </label>
                  {topics.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {topics.map((topic) => {
                        const isSelected = formData.topic_ids.includes(topic.id);
                        return (
                          <button
                            key={topic.id}
                            type="button"
                            onClick={() => handleTopicToggle(topic.id)}
                            disabled={!canEdit}
                            className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                              isSelected
                                ? 'bg-primary-100 text-primary-700 border-2 border-primary-500'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
                            } ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {topic.name}
                            {isSelected && (
                              <svg className="w-4 h-4 ml-1" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      No topics available.
                    </p>
                  )}
                  {field.help_text && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {field.help_text}
                    </p>
                  )}
                </div>
              );

            case 'level':
              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Level
                    {field.is_required && <span className="text-red-500"> *</span>}
                  </label>
                  <select
                    value={formData.level}
                    onChange={(e) =>
                      setFormData((d) => ({ ...d, level: e.target.value as PaperLevel | '' }))
                    }
                    disabled={!canEdit}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                  >
                    <option value="">Select level...</option>
                    {(field.options && field.options.length > 0
                      ? field.options
                      : LEVEL_OPTIONS
                    ).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {field.help_text && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {field.help_text}
                    </p>
                  )}
                </div>
              );

            case 'abstract_short':
              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Short Abstract
                    {field.is_required && <span className="text-red-500"> *</span>}
                  </label>
                  <RichTextEditor
                    value={formData.abstract_short}
                    onChange={(html) => setFormData((d) => ({ ...d, abstract_short: html }))}
                    placeholder="Brief summary of your talk..."
                    rows={3}
                    disabled={!canEdit}
                    minLength={field.min_chars ?? undefined}
                    maxLength={field.max_chars ?? undefined}
                  />
                  {field.help_text && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {field.help_text}
                    </p>
                  )}
                </div>
              );

            case 'abstract_long':
              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Long Abstract
                    {field.is_required && <span className="text-red-500"> *</span>}
                  </label>
                  <RichTextEditor
                    value={formData.abstract_long}
                    onChange={(html) => setFormData((d) => ({ ...d, abstract_long: html }))}
                    placeholder="Detailed description of your talk..."
                    rows={6}
                    disabled={!canEdit}
                    minLength={field.min_chars ?? undefined}
                    maxLength={field.max_chars ?? undefined}
                  />
                  {field.help_text && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {field.help_text}
                    </p>
                  )}
                </div>
              );

            case 'learning_objectives':
              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Learning Objectives
                    {field.is_required && <span className="text-red-500"> *</span>}
                  </label>
                  <RichTextEditor
                    value={formData.learning_objectives}
                    onChange={(html) => setFormData((d) => ({ ...d, learning_objectives: html }))}
                    placeholder="What will attendees learn from this talk?"
                    rows={4}
                    disabled={!canEdit}
                    minLength={field.min_chars ?? undefined}
                    maxLength={field.max_chars ?? undefined}
                  />
                  {field.help_text && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {field.help_text}
                    </p>
                  )}
                </div>
              );

            default:
              return null;
          }
        }

        // Render custom fields
        if (field.type === 'custom' && field.customField) {
          const cf = field.customField;
          const cfValue = customFieldAnswers[field.key];
          return (
            <div key={cf.id}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {field.label}
                {field.is_required && <span className="text-red-500"> *</span>}
              </label>
              {cf.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{cf.description}</p>
              )}
              {cf.field_type === 'text' && (
                <input
                  type="text"
                  value={String(cfValue ?? '')}
                  onChange={(e) =>
                    setCustomFieldAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={cf.placeholder || ''}
                  disabled={!canEdit}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                />
              )}
              {cf.field_type === 'textarea' && (
                <textarea
                  value={String(cfValue ?? '')}
                  onChange={(e) =>
                    setCustomFieldAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={cf.placeholder || ''}
                  disabled={!canEdit}
                  rows={3}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                />
              )}
              {cf.field_type === 'richtext' && (
                <RichTextEditor
                  value={String(cfValue ?? '')}
                  onChange={(html) =>
                    setCustomFieldAnswers((prev) => ({ ...prev, [field.key]: html }))
                  }
                  placeholder={cf.placeholder || ''}
                  rows={4}
                  disabled={!canEdit}
                />
              )}
              {cf.field_type === 'dropdown' && (
                <select
                  value={String(cfValue ?? '')}
                  onChange={(e) =>
                    setCustomFieldAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  disabled={!canEdit}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                >
                  <option value="">{cf.placeholder || 'Select...'}</option>
                  {(cf.options || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
              {cf.field_type === 'checkbox' && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(cfValue)}
                    onChange={(e) =>
                      setCustomFieldAnswers((prev) => ({ ...prev, [field.key]: e.target.checked }))
                    }
                    disabled={!canEdit}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {cf.placeholder || 'Yes'}
                  </span>
                </label>
              )}
              {cf.field_type === 'checkbox_group' && (
                <div className="space-y-2">
                  {(cf.options || []).map((opt) => {
                    const selectedValues = Array.isArray(cfValue) ? cfValue : [];
                    return (
                      <label key={opt.value} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedValues.includes(opt.value)}
                          onChange={(e) => {
                            const newValues = e.target.checked
                              ? [...selectedValues, opt.value]
                              : selectedValues.filter((v: string) => v !== opt.value);
                            setCustomFieldAnswers((prev) => ({ ...prev, [field.key]: newValues }));
                          }}
                          disabled={!canEdit}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {opt.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {cf.help_text && (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{cf.help_text}</p>
              )}
            </div>
          );
        }

        return null;
      })}

      {/* Video (always rendered after dynamic fields) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Video
        </label>
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => {
              if (videoPreviewSrc) {
                setMediaPreview({ open: true, src: videoPreviewSrc });
              }
            }}
            disabled={!videoPreviewSrc}
            className={`w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden shrink-0 bg-gray-50 dark:bg-gray-900 relative ${
              videoPreviewSrc
                ? 'cursor-pointer hover:border-primary-400 hover:shadow-md transition-all'
                : ''
            }`}
            title={videoPreviewSrc ? 'Click to play video' : undefined}
          >
            {videoPreviewSrc ? (
              <>
                <video
                  src={videoPreviewSrc}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-gray-700 dark:text-gray-300 ml-0.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
          </button>
          <div className="flex-1">
            {canEdit && (
              <>
                <input
                  type="file"
                  accept={ACCEPTED_VIDEO_FORMATS}
                  onChange={handleVideoChange}
                  className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  MP4, MOV, WebM, AVI, or MKV. Max 50MB.
                </p>
              </>
            )}
            {videoError && <p className="mt-1 text-xs text-red-600">{videoError}</p>}
          </div>
        </div>
      </div>

      {/* Comments (read-only) */}
      {paper && paper.comments.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Committee Comments
          </label>
          <div className="space-y-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            {paper.comments.map((comment) => (
              <div
                key={comment.id}
                className="bg-white dark:bg-gray-800 rounded-md p-3 border border-gray-100 dark:border-gray-700"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {`${comment.committee_member_first_name} ${comment.committee_member_last_name}`.trim() ||
                      'Committee Member'}
                    {comment.committee_member_role && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-normal ml-1.5 capitalize">
                        ({comment.committee_member_role.replace('_', ' ')})
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {formatDate(comment.created_at)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {comment.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assigned Reviewers (read-only) */}
      {paper && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Assigned Reviewers
            {assignments.length > 0 && (
              <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">
                ({assignments.length})
              </span>
            )}
          </label>
          {assignments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {assignments.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200"
                >
                  {`${a.committee_member_first_name} ${a.committee_member_last_name}`.trim()}
                  {a.is_anonymous && (
                    <span className="px-1 rounded text-[9px] bg-yellow-100 text-yellow-700">
                      anon
                    </span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">
              No reviewers assigned yet.
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
        <div className="flex gap-2">
          {isEditing && onDelete && canEdit && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <DeleteIcon />
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          {isEditing && paper?.status !== 'draft' && onUnsubmit && (
            <button
              type="button"
              onClick={onUnsubmit}
              disabled={isUnsubmitting}
              className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              {isUnsubmitting ? 'Reverting...' : 'Revert to Draft'}
            </button>
          )}
          {isEditing && paper?.status !== 'rejected' && onReject && (
            <button
              type="button"
              onClick={onReject}
              disabled={isRejecting}
              className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {isRejecting ? 'Rejecting...' : 'Reject'}
            </button>
          )}
          {isEditing && paper?.status !== 'accepted' && onAccept && (
            <button
              type="button"
              onClick={onAccept}
              disabled={isAccepting}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50 transition-colors"
            >
              {isAccepting ? 'Accepting...' : 'Accept'}
            </button>
          )}
          {isEditing && paper?.status === 'draft' && onSubmit && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting || isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Paper'}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={handleFormSubmit}
              disabled={isSaving || !!videoError}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 transition-all duration-300 ${
                saveStatus === 'saved'
                  ? 'bg-green-600 hover:bg-green-700'
                  : saveStatus === 'error'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-primary-600 hover:bg-primary-700'
              }`}
            >
              {saveStatus === 'saving' && (
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              )}
              {saveStatus === 'saved' && (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {saveStatus === 'error' && (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
              {saveStatus === 'saving'
                ? 'Saving...'
                : saveStatus === 'saved'
                  ? 'Saved!'
                  : saveStatus === 'error'
                    ? 'Error'
                    : isEditing
                      ? 'Save Changes'
                      : 'Create Paper'}
            </button>
          )}
        </div>
      </div>

      {/* Media Preview Modal */}
      <MediaPreviewModal
        open={mediaPreview.open}
        onClose={() => setMediaPreview({ open: false, src: null })}
        src={mediaPreview.src}
        type="video"
        alt="Paper video"
      />
    </div>
  );
}
