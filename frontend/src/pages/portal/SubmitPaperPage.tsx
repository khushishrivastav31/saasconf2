import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import UnsavedChangesDialog from '../../components/UnsavedChangesDialog';
import { usePortalBasePath } from '../../hooks/usePortalBasePath';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';
import RichTextEditor from '../../components/common/RichTextEditor';
import { formatDate } from '../../utils/formatDate';
import type {
  PortalConferenceSummary,
  PortalConferenceDetail,
  PortalPaper,
  PortalPaperCreateRequest,
  PortalCospeakerInput,
  PortalPaperFormSchema,
  PortalPaperFormField,
  PortalPaperFormVariant,
  PortalTopic,
} from '../../types/portal';
import { parseApiError } from '../../utils/apiError';
import { validateEmail } from '../../utils/validators';
import { COSPEAKER_UNADDED_MESSAGE } from './cospeakerMessages';

const BUILTIN_FIELD_DEFS: { key: string; label: string; alwaysRequired?: boolean }[] = [
  { key: 'title', label: 'Title', alwaysRequired: true },
  { key: 'abstract_short', label: 'Short Abstract' },
  { key: 'abstract_long', label: 'Detailed Abstract' },
  { key: 'level', label: 'Level' },
  { key: 'learning_objectives', label: 'Learning Objectives' },
  { key: 'session_type', label: 'Session Type' },
  { key: 'topics', label: 'Topics' },
];

// --- Dynamic Field Renderer ---

function DynamicField({
  field,
  value,
  onChange,
  onFileSelect,
  pendingFileName,
  disabled,
}: {
  field: PortalPaperFormField;
  value: unknown;
  onChange: (val: unknown) => void;
  onFileSelect?: (file: File | null) => void;
  pendingFileName?: string | null;
  disabled?: boolean;
}) {
  switch (field.field_type) {
    case 'text':
      return (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          disabled={disabled}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700"
        />
      );

    case 'textarea':
      return (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          disabled={disabled}
          rows={3}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700"
        />
      );

    case 'richtext':
      return (
        <RichTextEditor
          value={String(value ?? '')}
          onChange={(html) => onChange(html)}
          placeholder={field.placeholder || ''}
          rows={4}
          toolbarVariant="speaker"
        />
      );

    case 'checkbox':
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {field.placeholder || 'Yes'}
          </span>
        </label>
      );

    case 'checkbox_group': {
      const selectedValues = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-2">
          {(field.options || []).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedValues.includes(opt.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...selectedValues, opt.value]);
                  } else {
                    onChange(selectedValues.filter((v) => v !== opt.value));
                  }
                }}
                disabled={disabled}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
            </label>
          ))}
        </div>
      );
    }

    case 'dropdown':
      return (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700"
        >
          <option value="">{field.placeholder || 'Select...'}</option>
          {(field.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case 'file_upload': {
      const existingFile = value as { attachment_id: string; filename: string } | null | undefined;
      const acceptTypes = field.validation_rules?.allowed_file_types?.map((t) => `.${t}`).join(',');
      const displayName = pendingFileName ?? existingFile?.filename ?? null;
      return (
        <div className="space-y-2">
          {displayName && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
              <svg
                className="w-4 h-4 text-gray-400 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                {displayName}
              </span>
              {pendingFileName && (
                <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">
                  pending upload
                </span>
              )}
            </div>
          )}
          <input
            type="file"
            accept={acceptTypes}
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              onFileSelect?.(file);
            }}
            className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/30 dark:file:text-primary-300"
          />
        </div>
      );
    }

    default:
      return null;
  }
}

// --- Main Component ---

function SubmitPaperPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { applicant } = useApplicantAuth();
  const basePath = usePortalBasePath();

  const [selectedConferenceId, setSelectedConferenceId] = useState('');
  const [selectedCfpId, setSelectedCfpId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [sessionTypeId, setSessionTypeId] = useState('');
  const [title, setTitle] = useState('');
  const [abstractShort, setAbstractShort] = useState('');
  const [abstractLong, setAbstractLong] = useState('');
  const [level, setLevel] = useState('');
  const [learningObjectives, setLearningObjectives] = useState('');
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [cospeakers, setCospeakers] = useState<PortalCospeakerInput[]>([]);
  const [cospeakerFirstName, setCospeakerFirstName] = useState('');
  const [cospeakerInput, setCospeakerInput] = useState('');
  const [customFieldAnswers, setCustomFieldAnswers] = useState<Record<string, unknown>>({});
  const [customFieldFiles, setCustomFieldFiles] = useState<Record<string, File>>({});
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Unsaved changes guard — dirty if user has entered any meaningful content
  const isDirty = useMemo(
    () =>
      !!(
        title.trim() ||
        abstractShort.trim() ||
        abstractLong.trim() ||
        learningObjectives.trim() ||
        cospeakers.length > 0
      ),
    [title, abstractShort, abstractLong, learningObjectives, cospeakers]
  );
  const { showDialog, confirmLeave, cancelLeave } = useUnsavedChanges(isDirty);

  // Load conferences
  const { data: conferences } = useQuery({
    queryKey: ['portal-conferences'],
    queryFn: async () => {
      const res = await portalApi.get<PortalConferenceSummary[]>('/portal/conferences');
      return res.data;
    },
  });

  // Load conference detail (session types) when a conference is selected
  const { data: conferenceDetail } = useQuery({
    queryKey: ['portal-conference-detail', selectedConferenceId],
    queryFn: async () => {
      const res = await portalApi.get<PortalConferenceDetail>(
        `/portal/conferences/${selectedConferenceId}`
      );
      return res.data;
    },
    enabled: !!selectedConferenceId,
  });

  // Load form schema when a CFP is selected
  // Use short staleTime to ensure fresh data since admins may update the form
  const { data: formSchema } = useQuery({
    queryKey: ['portal-cfp-form-schema', selectedCfpId],
    queryFn: async () => {
      const res = await portalApi.get<PortalPaperFormSchema>(
        `/portal/cfp/${selectedCfpId}/paper-form-schema`
      );
      return res.data;
    },
    enabled: !!selectedCfpId,
    staleTime: 0, // Always consider data stale to refetch on mount
    refetchOnWindowFocus: true, // Refetch when user returns to the tab
  });

  // Load available topics for the tenant
  const { data: availableTopics = [] } = useQuery({
    queryKey: ['portal-topics'],
    queryFn: async () => {
      const res = await portalApi.get<PortalTopic[]>('/portal/topics');
      return res.data;
    },
    staleTime: 60_000,
  });

  const selectedConference = conferences?.find((c) => c.id === selectedConferenceId);
  const allowOutOfTimeframe = applicant?.allow_out_of_timeframe ?? false;
  const availableCfps = selectedConference?.cfps.filter(
    (cfp) => cfp.status === 'open' || allowOutOfTimeframe
  );

  // Auto-select the CFP when conference is selected (each conference has only one CFP)
  useEffect(() => {
    if (availableCfps && availableCfps.length > 0 && !selectedCfpId) {
      setSelectedCfpId(availableCfps[0].id);
    }
  }, [availableCfps, selectedCfpId]);

  // Scroll error banner into view whenever a new error is set
  useEffect(() => {
    if (error && errorRef.current && typeof errorRef.current.scrollIntoView === 'function') {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  const selectedCfp = availableCfps?.find((c) => c.id === selectedCfpId);
  const requiredSpeakerFields = selectedCfp?.required_speaker_fields || [];

  // Resolve active variant (if any)
  const activeVariant: PortalPaperFormVariant | null = useMemo(() => {
    if (!formSchema || !selectedVariantId) return null;
    return formSchema.variants?.find((v) => v.id === selectedVariantId) ?? null;
  }, [formSchema, selectedVariantId]);

  // Auto-select variant when there's exactly one
  useEffect(() => {
    if (formSchema?.variants?.length === 1 && !selectedVariantId) {
      setSelectedVariantId(formSchema.variants[0].id);
    }
  }, [formSchema, selectedVariantId]);

  // Create unified sorted list of all fields (builtin + custom)
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

  const unifiedFormFields = useMemo((): UnifiedFormField[] => {
    if (!formSchema) return [];

    // Use variant config if selected, otherwise base schema
    const builtinConfig =
      activeVariant?.builtin_fields_config ?? formSchema.builtin_fields_config ?? {};
    const customFieldsList = activeVariant?.fields ?? formSchema.fields;
    const requiredPaperFields = selectedCfp?.required_paper_fields || [];
    const builtinCount = BUILTIN_FIELD_DEFS.length;

    // Create unified built-in fields
    const builtinFields: UnifiedFormField[] = BUILTIN_FIELD_DEFS.map((bf, defaultIdx) => {
      const config = builtinConfig[bf.key];
      return {
        type: 'builtin' as const,
        key: bf.key,
        label: bf.label,
        display_order: config?.display_order ?? defaultIdx,
        is_visible: config?.visible !== false,
        is_required: bf.alwaysRequired || config?.required || requiredPaperFields.includes(bf.key),
        help_text: config?.help_text,
        min_chars: config?.min_chars,
        max_chars: config?.max_chars,
        options: config?.options,
      };
    });

    // Create unified custom fields
    const customFields: UnifiedFormField[] = customFieldsList
      .filter((f) => f.is_visible)
      .map((f) => {
        // Check if unified ordering is in use
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

    // Combine and sort
    return [...builtinFields, ...customFields]
      .filter((f) => f.is_visible)
      .sort((a, b) => a.display_order - b.display_order);
  }, [formSchema, activeVariant, selectedCfp]);

  // Check missing speaker profile fields
  const missingSpeakerFields = requiredSpeakerFields.filter((field) => {
    if (!applicant) return true;
    if (field === 'bio') return !applicant.bio;
    if (field === 'phone') return !applicant.phone;
    if (field === 'title') return !applicant.title;
    if (field === 'company') return !applicant.company;
    if (field === 'picture') return !applicant.picture_url;
    if (field === 'video') return !applicant.video_url;
    return false;
  });

  const speakerFieldLabels: Record<string, string> = {
    bio: 'Short Bio',
    picture: 'Picture',
    video: 'Video',
    phone: 'Phone',
    title: 'Title / Position',
    company: 'Company / Organization',
  };

  const createMutation = useMutation({
    mutationFn: async (payload: PortalPaperCreateRequest) => {
      const res = await portalApi.post<PortalPaper>('/portal/papers', payload);
      return res.data;
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create paper. Please try again.'));
    },
  });

  const handleAddCospeaker = () => {
    const email = cospeakerInput.trim().toLowerCase();
    const firstName = cospeakerFirstName.trim();
    if (!email || !firstName) return;
    if (applicant && email === applicant.email.toLowerCase()) {
      setError('You cannot add yourself as a co-speaker');
      return;
    }
    if (cospeakers.length >= 3) {
      setError('Maximum 3 co-speakers allowed');
      return;
    }
    if (cospeakers.some((cs) => cs.email === email)) {
      setError('This email is already added');
      return;
    }
    setCospeakers([...cospeakers, { first_name: firstName, email }]);
    setCospeakerFirstName('');
    setCospeakerInput('');
    setError('');
  };

  const handleRemoveCospeaker = (email: string) => {
    setCospeakers(cospeakers.filter((cs) => cs.email !== email));
  };

  const handleCustomFieldChange = (fieldKey: string, value: unknown) => {
    setCustomFieldAnswers((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const hasPendingCospeaker = cospeakerFirstName.trim() !== '' || cospeakerInput.trim() !== '';
  const canAddCospeaker = hasPendingCospeaker && !emailError && cospeakers.length < 3;

  const handleSubmit = async () => {
    if (!selectedCfpId || !title.trim()) {
      setError('Please select a CFP and provide a title');
      return;
    }

    if (cospeakerFirstName.trim() || cospeakerInput.trim()) {
      setError(COSPEAKER_UNADDED_MESSAGE);
      return;
    }

    // Validate required builtin topics field
    const topicsField = unifiedFormFields.find((f) => f.type === 'builtin' && f.key === 'topics');
    if (topicsField?.is_required && topicIds.length === 0) {
      setError('Please select at least one topic');
      return;
    }

    // Validate required custom fields (file fields count as filled if a file is pending)
    for (const field of unifiedFormFields) {
      if (field.type === 'custom' && field.is_required) {
        const val = customFieldAnswers[field.key];
        const hasPendingFile =
          field.customField?.field_type === 'file_upload' && !!customFieldFiles[field.key];
        const isEmpty =
          !hasPendingFile &&
          (val === undefined ||
            val === null ||
            val === '' ||
            (Array.isArray(val) && val.length === 0));
        if (isEmpty) {
          setError(`Please fill in the required field: ${field.label}`);
          return;
        }
      }
    }

    setError('');

    const payload: PortalPaperCreateRequest = {
      cfp_id: selectedCfpId,
      title: title.trim(),
      ...(selectedVariantId ? { form_variant_id: selectedVariantId } : {}),
      ...(sessionTypeId ? { session_type_id: sessionTypeId } : {}),
      ...(abstractShort ? { abstract_short: abstractShort } : {}),
      ...(abstractLong ? { abstract_long: abstractLong } : {}),
      ...(level ? { level } : {}),
      ...(learningObjectives ? { learning_objectives: learningObjectives } : {}),
      ...(topicIds.length > 0 ? { topic_ids: topicIds } : {}),
      ...(cospeakers.length > 0 ? { cospeakers } : {}),
      ...(Object.keys(customFieldAnswers).length > 0
        ? { custom_field_answers: customFieldAnswers }
        : {}),
    };

    try {
      const paper = await createMutation.mutateAsync(payload);

      // Upload any pending custom field files after paper creation
      const fileEntries = Object.entries(customFieldFiles);
      if (fileEntries.length > 0) {
        const fileAnswers: Record<string, unknown> = {};
        for (const [fieldKey, file] of fileEntries) {
          try {
            const form = new FormData();
            form.append('file', file);
            form.append('entity_type', 'paper_file');
            form.append('entity_id', paper.id);
            form.append('description', fieldKey);
            const resp = await portalApi.post<{ id: string; filename: string; file_size: number }>(
              '/portal/attachments',
              form,
              { headers: { 'Content-Type': 'multipart/form-data' } }
            );
            fileAnswers[fieldKey] = { attachment_id: resp.data.id, filename: resp.data.filename };
          } catch {
            // Non-fatal: file can be uploaded later in edit mode
          }
        }
        if (Object.keys(fileAnswers).length > 0) {
          try {
            await portalApi.put(`/portal/papers/${paper.id}`, {
              custom_field_answers: { ...(paper.custom_field_answers ?? {}), ...fileAnswers },
            });
          } catch {
            // Non-fatal
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['portal-papers'] });
      navigate(`${basePath}/papers/${paper.id}`);
    } catch {
      // Error handled by onError
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Submit New Paper
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Fill in the details to create a new paper submission.
          </p>
        </div>
      </div>

      {error && (
        <div
          ref={errorRef}
          className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 rounded text-sm mb-4"
        >
          {error}
        </div>
      )}

      {selectedCfpId && missingSpeakerFields.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-4 py-3 rounded text-sm mb-4">
          <strong>Missing required profile fields:</strong>{' '}
          {missingSpeakerFields.map((f) => speakerFieldLabels[f] || f).join(', ')}. Please update
          your{' '}
          <a href={`${basePath}/profile`} className="underline font-medium">
            profile
          </a>{' '}
          before submitting.
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        {/* Conference Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Conference
          </label>
          <select
            value={selectedConferenceId}
            onChange={(e) => {
              setSelectedConferenceId(e.target.value);
              setSelectedCfpId(''); // Will be auto-selected by useEffect
              setSelectedVariantId('');
              setSessionTypeId('');
              setCustomFieldAnswers({});
              setCustomFieldFiles({});
            }}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">Select a conference</option>
            {conferences?.map((conf) => (
              <option key={conf.id} value={conf.id}>
                {conf.name}
                {conf.abbreviation ? ` (${conf.abbreviation})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* CFP Info - auto-selected since each conference has one CFP */}
        {selectedConferenceId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Call for Papers
            </label>
            {selectedCfp ? (
              <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {selectedCfp.title}
                </span>
                {selectedCfp.close_date && (
                  <span className="text-gray-500 dark:text-gray-400 ml-2">
                    (closes {formatDate(selectedCfp.close_date)})
                  </span>
                )}
              </div>
            ) : availableCfps && availableCfps.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No open CFPs for this conference.
              </p>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
            )}
          </div>
        )}

        {/* Form Variant Selection */}
        {selectedCfpId && formSchema?.variants && formSchema.variants.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Submission Type
            </label>
            <select
              value={selectedVariantId}
              onChange={(e) => {
                setSelectedVariantId(e.target.value);
                setCustomFieldAnswers({});
                setCustomFieldFiles({});
              }}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">Select submission type</option>
              {formSchema.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            {activeVariant?.description && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {activeVariant.description}
              </p>
            )}
          </div>
        )}

        {/* Dynamic Form Fields - rendered in designed order */}
        {selectedCfpId &&
          unifiedFormFields.map((field) => {
            // Render built-in fields
            if (field.type === 'builtin') {
              switch (field.key) {
                case 'title':
                  return (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {field.label}
                        {field.is_required && <span className="text-red-500"> *</span>}
                      </label>
                      <input
                        type="text"
                        required={field.is_required}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={field.max_chars ?? undefined}
                        minLength={field.min_chars ?? undefined}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                        placeholder="Your paper title"
                      />
                      <div className="flex justify-between mt-1">
                        {field.help_text ? (
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {field.help_text}
                          </p>
                        ) : (
                          <span />
                        )}
                        {(field.min_chars != null || field.max_chars != null) && (
                          <span
                            className={`text-xs ${
                              field.max_chars != null && title.length > field.max_chars
                                ? 'text-red-600 font-medium'
                                : field.min_chars != null &&
                                    title.length > 0 &&
                                    title.length < field.min_chars
                                  ? 'text-red-600 font-medium'
                                  : 'text-gray-400 dark:text-gray-500'
                            }`}
                          >
                            {title.length}
                            {field.min_chars != null && <span> (min {field.min_chars})</span>}
                            {field.max_chars != null && <span> / {field.max_chars}</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  );

                case 'session_type':
                  if (!conferenceDetail || conferenceDetail.session_types.length === 0) return null;
                  return (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {field.label}
                        {field.is_required && <span className="text-red-500"> *</span>}
                      </label>
                      <select
                        value={sessionTypeId}
                        onChange={(e) => setSessionTypeId(e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value="">Select a session type</option>
                        {conferenceDetail.session_types.map((st) => (
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

                case 'abstract_short':
                  return (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {field.label}
                        {field.is_required && <span className="text-red-500"> *</span>}
                      </label>
                      <RichTextEditor
                        value={abstractShort}
                        onChange={(html) => setAbstractShort(html)}
                        placeholder="Brief summary of your talk..."
                        rows={3}
                        minLength={field.min_chars ?? undefined}
                        maxLength={field.max_chars ?? undefined}
                        toolbarVariant="speaker"
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
                        {field.label}
                        {field.is_required && <span className="text-red-500"> *</span>}
                      </label>
                      <RichTextEditor
                        value={abstractLong}
                        onChange={(html) => setAbstractLong(html)}
                        placeholder="Detailed description of your paper..."
                        rows={6}
                        minLength={field.min_chars ?? undefined}
                        maxLength={field.max_chars ?? undefined}
                        toolbarVariant="speaker"
                      />
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
                        {field.label}
                        {field.is_required && <span className="text-red-500"> *</span>}
                      </label>
                      <select
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value="">Select level</option>
                        {(field.options && field.options.length > 0
                          ? field.options
                          : [
                              { value: 'beginner', label: 'Beginner' },
                              { value: 'intermediate', label: 'Intermediate' },
                              { value: 'advanced', label: 'Advanced' },
                              { value: 'all_levels', label: 'All Levels' },
                            ]
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

                case 'learning_objectives':
                  return (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {field.label}
                        {field.is_required && <span className="text-red-500"> *</span>}
                      </label>
                      <RichTextEditor
                        value={learningObjectives}
                        onChange={(html) => setLearningObjectives(html)}
                        placeholder="What will attendees learn?"
                        rows={3}
                        minLength={field.min_chars ?? undefined}
                        maxLength={field.max_chars ?? undefined}
                        toolbarVariant="speaker"
                      />
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
                        {field.label}
                        {field.is_required && <span className="text-red-500"> *</span>}
                      </label>
                      {availableTopics.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {availableTopics.map((topic) => {
                            const isSelected = topicIds.includes(topic.id);
                            return (
                              <button
                                key={topic.id}
                                type="button"
                                onClick={() =>
                                  setTopicIds((prev) =>
                                    isSelected
                                      ? prev.filter((id) => id !== topic.id)
                                      : [...prev, topic.id]
                                  )
                                }
                                className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                  isSelected
                                    ? 'bg-primary-100 text-primary-700 border-2 border-primary-500'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                              >
                                {topic.name}
                                {isSelected && (
                                  <svg
                                    className="w-4 h-4 ml-1"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
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

                default:
                  return null;
              }
            }

            // Render custom fields
            if (field.type === 'custom' && field.customField) {
              return (
                <div key={field.customField.id}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {field.label}
                    {field.is_required && <span className="text-red-500"> *</span>}
                  </label>
                  {field.customField.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {field.customField.description}
                    </p>
                  )}
                  <DynamicField
                    field={field.customField}
                    value={customFieldAnswers[field.key]}
                    onChange={(val) => handleCustomFieldChange(field.key, val)}
                    onFileSelect={
                      field.customField.field_type === 'file_upload'
                        ? (file) => {
                            setCustomFieldFiles((prev) => {
                              if (file) return { ...prev, [field.key]: file };
                              const copy = { ...prev };
                              delete copy[field.key];
                              return copy;
                            });
                          }
                        : undefined
                    }
                    pendingFileName={
                      field.customField.field_type === 'file_upload'
                        ? (customFieldFiles[field.key]?.name ?? null)
                        : undefined
                    }
                  />
                  {field.customField.help_text && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {field.customField.help_text}
                    </p>
                  )}
                </div>
              );
            }

            return null;
          })}

        {/* Co-speakers — only relevant once a conference with an open CFP is selected */}
        {selectedCfpId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Co-speakers (max 3)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={cospeakerFirstName}
                onChange={(e) => setCospeakerFirstName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCospeaker();
                  }
                }}
                className="sm:w-40 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                placeholder="First name"
                disabled={cospeakers.length >= 3}
              />
              <div className="flex-1">
                <input
                  type="email"
                  value={cospeakerInput}
                  onChange={(e) => setCospeakerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCospeaker();
                    }
                  }}
                  onBlur={(e) => setEmailError(validateEmail(e.target.value))}
                  className={`w-full border ${emailError ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100`}
                  placeholder="Email"
                  disabled={cospeakers.length >= 3}
                />
                {emailError && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{emailError}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleAddCospeaker}
                disabled={cospeakers.length >= 3 || !!emailError}
                className={`px-3 py-2 rounded-md text-sm disabled:opacity-50 ${
                  canAddCospeaker
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                Add
              </button>
            </div>
            {cospeakers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {cospeakers.map((cs) => (
                  <span
                    key={cs.email}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-200"
                  >
                    {cs.first_name} ({cs.email})
                    <button
                      type="button"
                      onClick={() => handleRemoveCospeaker(cs.email)}
                      className="text-primary-400 hover:text-primary-600"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Co-speakers don't need an account yet — they'll get an email invitation to join and
              confirm.
            </p>
          </div>
        )}

        {/* Actions — only shown when a CFP is open (selectable); hidden when the CFP is closed */}
        {selectedCfpId && (
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => navigate(`${basePath}/dashboard`)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? 'Saving...' : 'Next step'}
            </button>
          </div>
        )}
      </div>
      <UnsavedChangesDialog open={showDialog} onConfirm={confirmLeave} onCancel={cancelLeave} />
    </div>
  );
}

export default SubmitPaperPage;
