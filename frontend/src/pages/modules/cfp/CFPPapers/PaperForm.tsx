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
  BuiltinFieldConfig,
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
  importance: string;
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
  importance: '',
};

const LEVEL_OPTIONS: { value: PaperLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'all_levels', label: 'All Levels' },
];

// ---------------------------------------------------------------------------
// Paper form component
// ---------------------------------------------------------------------------

export function PaperForm({
  paper,
  conferenceId,
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
          importance: paper.importance || '',
        }
      : emptyForm
  );

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
  const { data: cfpsData } = useQuery({
    queryKey: ['cfp-list', conferenceId],
    queryFn: async () => {
      const response = await api.get<CFPListResponse>(`/conferences/${conferenceId}/cfps`);
      return response.data;
    },
  });

  const conferenceCfpId = cfpsData?.items?.[0]?.id || '';

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

  const getFieldConfig = (fieldKey: string): BuiltinFieldConfig | undefined => {
    return formSchemaData?.builtin_fields_config?.[fieldKey];
  };

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
    setFormData(
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
            importance: paper.importance || '',
          }
        : emptyForm
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

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.cfp_id || !formData.main_speaker_id || !formData.title.trim()) return;
    if (videoError) return;

    onSave(formData, videoFile);
  };

  const displayStatus = paper?.display_status || paper?.status;

  return (
    <form onSubmit={handleFormSubmit} className="space-y-5">
      <ErrorBanner message={error} />

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

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData((d) => ({ ...d, title: e.target.value }))}
          disabled={!canEdit}
          maxLength={getFieldConfig('title')?.max_chars ?? undefined}
          minLength={getFieldConfig('title')?.min_chars ?? undefined}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          required
        />
        {(getFieldConfig('title')?.min_chars != null ||
          getFieldConfig('title')?.max_chars != null) && (
          <div className="flex justify-end mt-1">
            <span
              className={`text-xs ${
                getFieldConfig('title')?.max_chars != null &&
                formData.title.length > getFieldConfig('title')!.max_chars!
                  ? 'text-red-600 font-medium'
                  : getFieldConfig('title')?.min_chars != null &&
                      formData.title.length > 0 &&
                      formData.title.length < getFieldConfig('title')!.min_chars!
                    ? 'text-red-600 font-medium'
                    : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {formData.title.length}
              {getFieldConfig('title')?.min_chars != null && (
                <span> (min {getFieldConfig('title')!.min_chars})</span>
              )}
              {getFieldConfig('title')?.max_chars != null && (
                <span> / {getFieldConfig('title')!.max_chars}</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Session Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Session Type
        </label>
        <select
          value={formData.session_type_id}
          onChange={(e) => setFormData((d) => ({ ...d, session_type_id: e.target.value }))}
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
      </div>

      {/* Topics */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Topics
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
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">No topics available.</p>
        )}
      </div>

      {/* Level */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Level
        </label>
        <select
          value={formData.level}
          onChange={(e) => setFormData((d) => ({ ...d, level: e.target.value as PaperLevel | '' }))}
          disabled={!canEdit}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
        >
          <option value="">Select level...</option>
          {LEVEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Short Abstract */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Short Abstract
        </label>
        <RichTextEditor
          value={formData.abstract_short}
          onChange={(html) => setFormData((d) => ({ ...d, abstract_short: html }))}
          placeholder="Brief summary of your talk..."
          rows={3}
          disabled={!canEdit}
          minLength={getFieldConfig('abstract_short')?.min_chars ?? undefined}
          maxLength={getFieldConfig('abstract_short')?.max_chars ?? undefined}
        />
      </div>

      {/* Long Abstract */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Long Abstract
        </label>
        <RichTextEditor
          value={formData.abstract_long}
          onChange={(html) => setFormData((d) => ({ ...d, abstract_long: html }))}
          placeholder="Detailed description of your talk..."
          rows={6}
          disabled={!canEdit}
          minLength={getFieldConfig('abstract_long')?.min_chars ?? undefined}
          maxLength={getFieldConfig('abstract_long')?.max_chars ?? undefined}
        />
      </div>

      {/* Learning Objectives */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Learning Objectives
        </label>
        <RichTextEditor
          value={formData.learning_objectives}
          onChange={(html) => setFormData((d) => ({ ...d, learning_objectives: html }))}
          placeholder="What will attendees learn from this talk?"
          rows={4}
          disabled={!canEdit}
          minLength={getFieldConfig('learning_objectives')?.min_chars ?? undefined}
          maxLength={getFieldConfig('learning_objectives')?.max_chars ?? undefined}
        />
      </div>

      {/* Why Important */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Why is this talk important?
        </label>
        <RichTextEditor
          value={formData.importance}
          onChange={(html) => setFormData((d) => ({ ...d, importance: html }))}
          placeholder="Explain why this topic matters..."
          rows={4}
          disabled={!canEdit}
          minLength={getFieldConfig('importance')?.min_chars ?? undefined}
          maxLength={getFieldConfig('importance')?.max_chars ?? undefined}
        />
      </div>

      {/* Video */}
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
            className={`w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-gray-900 relative ${
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
              type="submit"
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
    </form>
  );
}
