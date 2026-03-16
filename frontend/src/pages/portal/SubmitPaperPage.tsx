import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
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
  PortalPaperFormSchema,
  PortalPaperFormField,
  PortalPaperFormVariant,
} from '../../types/portal';
import { parseApiError } from '../../utils/apiError';
import { validateEmail } from '../../utils/validators';

const BUILTIN_FIELD_DEFS: { key: string; label: string; alwaysRequired?: boolean }[] = [
  { key: 'title', label: 'Title', alwaysRequired: true },
  { key: 'abstract_short', label: 'Short Abstract' },
  { key: 'abstract_long', label: 'Detailed Abstract' },
  { key: 'level', label: 'Level' },
  { key: 'learning_objectives', label: 'Learning Objectives' },
  { key: 'importance', label: 'Why is this important?' },
  { key: 'session_type', label: 'Session Type' },
  { key: 'topics', label: 'Topics' },
];

// --- Dynamic Field Renderer ---

function DynamicField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: PortalPaperFormField;
  value: unknown;
  onChange: (val: unknown) => void;
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

    case 'file_upload':
      return (
        <div className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            File upload not yet implemented
          </span>
        </div>
      );

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
  const [importance, setImportance] = useState('');
  const [cospeakerEmails, setCospeakerEmails] = useState<string[]>([]);
  const [cospeakerInput, setCospeakerInput] = useState('');
  const [customFieldAnswers, setCustomFieldAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

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
    onSuccess: (paper) => {
      queryClient.invalidateQueries({ queryKey: ['portal-papers'] });
      navigate(`${basePath}/papers/${paper.id}`);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create paper. Please try again.'));
    },
  });

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

  const handleRemoveCospeaker = (email: string) => {
    setCospeakerEmails(cospeakerEmails.filter((e) => e !== email));
  };

  const handleCustomFieldChange = (fieldKey: string, value: unknown) => {
    setCustomFieldAnswers((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const handleSubmit = () => {
    if (!selectedCfpId || !title.trim()) {
      setError('Please select a CFP and provide a title');
      return;
    }

    // Validate required custom fields
    for (const field of unifiedFormFields) {
      if (field.type === 'custom' && field.is_required) {
        const val = customFieldAnswers[field.key];
        const isEmpty =
          val === undefined ||
          val === null ||
          val === '' ||
          (Array.isArray(val) && val.length === 0);
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
      ...(importance ? { importance } : {}),
      ...(cospeakerEmails.length > 0 ? { cospeaker_emails: cospeakerEmails } : {}),
      ...(Object.keys(customFieldAnswers).length > 0
        ? { custom_field_answers: customFieldAnswers }
        : {}),
    };

    createMutation.mutate(payload);
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
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 rounded text-sm mb-4">
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
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                        placeholder="Your paper title"
                      />
                      {field.help_text && (
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                          {field.help_text}
                        </p>
                      )}
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
                        maxLength={800}
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
                        maxLength={8000}
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
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                        <option value="all_levels">All Levels</option>
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
                        maxLength={600}
                      />
                      {field.help_text && (
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                          {field.help_text}
                        </p>
                      )}
                    </div>
                  );

                case 'importance':
                  return (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {field.label}
                        {field.is_required && <span className="text-red-500"> *</span>}
                      </label>
                      <RichTextEditor
                        value={importance}
                        onChange={(html) => setImportance(html)}
                        placeholder="Why should this talk be selected?"
                        rows={3}
                        maxLength={600}
                      />
                      {field.help_text && (
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                          {field.help_text}
                        </p>
                      )}
                    </div>
                  );

                case 'topics':
                  // Topics would need topic selection - skip for now if not implemented
                  return null;

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

        {/* Co-speakers */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Co-speakers (max 3)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
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
                className={`w-full border ${emailError ? 'border-red-500 dark:border-red-500' : 'border-gray-300'} rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500`}
                placeholder="Co-speaker email"
                disabled={cospeakerEmails.length >= 3}
              />
              {emailError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{emailError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleAddCospeaker}
              disabled={cospeakerEmails.length >= 3 || !!emailError}
              className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-sm disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {cospeakerEmails.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {cospeakerEmails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-200"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => handleRemoveCospeaker(email)}
                    className="text-primary-400 hover:text-primary-600"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Co-speakers must be registered on this platform. They will receive an invitation.
          </p>
        </div>

        {/* Actions */}
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
            onClick={() => handleSubmit()}
            disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 transition-colors"
          >
            {createMutation.isPending ? 'Saving...' : 'Save as Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SubmitPaperPage;
