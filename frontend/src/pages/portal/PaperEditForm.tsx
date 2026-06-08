import type {
  PortalPaper,
  PortalConferenceDetail,
  PortalPaperFormField,
  PortalTopic,
} from '../../types/portal';
import RichTextEditor from '../../components/common/RichTextEditor';
import { validateEmail } from '../../utils/validators';
import { INVITATION_STATUS_COLORS } from '../../config/statusColors';
import { ACCEPTED_VIDEO_FORMATS } from '../../utils/mediaValidation';

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

const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'all_levels', label: 'All Levels' },
];

interface PaperEditFormProps {
  paper: PortalPaper;
  unifiedFormFields: UnifiedFormField[];
  conferenceDetail: PortalConferenceDetail | undefined;
  // Edit state
  editTitle: string;
  setEditTitle: (v: string) => void;
  editAbstractShort: string;
  setEditAbstractShort: (v: string) => void;
  editAbstractLong: string;
  setEditAbstractLong: (v: string) => void;
  editLevel: string;
  setEditLevel: (v: string) => void;
  editSessionTypeId: string;
  setEditSessionTypeId: (v: string) => void;
  editLearningObjectives: string;
  setEditLearningObjectives: (v: string) => void;
  editTopicIds: string[];
  setEditTopicIds: React.Dispatch<React.SetStateAction<string[]>>;
  availableTopics: PortalTopic[];
  editCustomFieldAnswers: Record<string, unknown>;
  setEditCustomFieldAnswers: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  // Co-speakers
  cospeakerEmails: string[];
  setCospeakerEmails: (v: string[]) => void;
  cospeakerInput: string;
  setCospeakerInput: (v: string) => void;
  emailError: string | null;
  setEmailError: (v: string | null) => void;
  // Video
  videoPreviewSrc: string | null;
  videoError: string | null;
  // Save status
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  submitError?: string;
  // Pending states
  isUpdatePending: boolean;
  isSubmitPending: boolean;
  isDeletePending: boolean;
  // Handlers
  onSave: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onAddCospeaker: () => void;
  onVideoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMediaPreview: (src: string) => void;
}

export default function PaperEditForm({
  paper,
  unifiedFormFields,
  conferenceDetail,
  editTitle,
  setEditTitle,
  editAbstractShort,
  setEditAbstractShort,
  editAbstractLong,
  setEditAbstractLong,
  editLevel,
  setEditLevel,
  editSessionTypeId,
  setEditSessionTypeId,
  editLearningObjectives,
  setEditLearningObjectives,
  editTopicIds,
  setEditTopicIds,
  availableTopics,
  editCustomFieldAnswers,
  setEditCustomFieldAnswers,
  cospeakerEmails,
  setCospeakerEmails,
  cospeakerInput,
  setCospeakerInput,
  emailError,
  setEmailError,
  videoPreviewSrc,
  videoError,
  saveStatus,
  submitError,
  isUpdatePending,
  isSubmitPending,
  isDeletePending,
  onSave,
  onSubmit,
  onCancel,
  onDelete,
  onAddCospeaker,
  onVideoChange,
  onMediaPreview,
}: PaperEditFormProps) {
  return (
    <div className="space-y-5">
      {/* Dynamic Form Fields - rendered in form schema display_order */}
      {unifiedFormFields.map((field) => {
        if (field.type === 'builtin') {
          switch (field.key) {
            case 'title':
              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {field.label} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    maxLength={field.max_chars ?? undefined}
                    minLength={field.min_chars ?? undefined}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  />
                  {(field.min_chars != null || field.max_chars != null) && (
                    <div className="flex justify-end mt-1">
                      <span
                        className={`text-xs ${
                          field.max_chars != null && editTitle.length > field.max_chars
                            ? 'text-red-600 font-medium'
                            : field.min_chars != null &&
                                editTitle.length > 0 &&
                                editTitle.length < field.min_chars
                              ? 'text-red-600 font-medium'
                              : 'text-gray-400 dark:text-gray-500'
                        }`}
                      >
                        {editTitle.length}
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
              if (!conferenceDetail || conferenceDetail.session_types.length === 0) return null;
              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {field.label}
                    {field.is_required && <span className="text-red-500"> *</span>}
                  </label>
                  <select
                    value={editSessionTypeId}
                    onChange={(e) => setEditSessionTypeId(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="">Select session type</option>
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
                        const isSelected = editTopicIds.includes(topic.id);
                        return (
                          <button
                            key={topic.id}
                            type="button"
                            onClick={() =>
                              setEditTopicIds((prev) =>
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
                    {field.label}
                    {field.is_required && <span className="text-red-500"> *</span>}
                  </label>
                  <select
                    value={editLevel}
                    onChange={(e) => setEditLevel(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
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
                    {field.label}
                    {field.is_required && <span className="text-red-500"> *</span>}
                  </label>
                  <RichTextEditor
                    value={editAbstractShort}
                    onChange={(html) => setEditAbstractShort(html)}
                    placeholder="Brief summary of your talk..."
                    rows={3}
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
                    {field.label}
                    {field.is_required && <span className="text-red-500"> *</span>}
                  </label>
                  <RichTextEditor
                    value={editAbstractLong}
                    onChange={(html) => setEditAbstractLong(html)}
                    placeholder="Detailed description of your talk..."
                    rows={6}
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
                    {field.label}
                    {field.is_required && <span className="text-red-500"> *</span>}
                  </label>
                  <RichTextEditor
                    value={editLearningObjectives}
                    onChange={(html) => setEditLearningObjectives(html)}
                    placeholder="What will attendees learn from this talk?"
                    rows={4}
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
          const cfValue = editCustomFieldAnswers[field.key];
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
                    setEditCustomFieldAnswers((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  placeholder={cf.placeholder || ''}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                />
              )}
              {cf.field_type === 'textarea' && (
                <textarea
                  value={String(cfValue ?? '')}
                  onChange={(e) =>
                    setEditCustomFieldAnswers((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  placeholder={cf.placeholder || ''}
                  rows={3}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                />
              )}
              {cf.field_type === 'richtext' && (
                <RichTextEditor
                  value={String(cfValue ?? '')}
                  onChange={(html) =>
                    setEditCustomFieldAnswers((prev) => ({ ...prev, [field.key]: html }))
                  }
                  placeholder={cf.placeholder || ''}
                  rows={4}
                />
              )}
              {cf.field_type === 'dropdown' && (
                <select
                  value={String(cfValue ?? '')}
                  onChange={(e) =>
                    setEditCustomFieldAnswers((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
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
                      setEditCustomFieldAnswers((prev) => ({
                        ...prev,
                        [field.key]: e.target.checked,
                      }))
                    }
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
                            setEditCustomFieldAnswers((prev) => ({
                              ...prev,
                              [field.key]: newValues,
                            }));
                          }}
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
                onMediaPreview(videoPreviewSrc);
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
                      className="w-4 h-4 text-gray-700 ml-0.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
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
            <input
              type="file"
              accept={ACCEPTED_VIDEO_FORMATS}
              onChange={onVideoChange}
              className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              MP4, MOV, WebM, AVI, or MKV. Max 50MB.
            </p>
            {videoError && <p className="mt-1 text-xs text-red-600">{videoError}</p>}
          </div>
        </div>
      </div>

      {/* Co-speakers (only main speaker can manage) */}
      {paper.is_main_speaker && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Co-speakers{' '}
            <span className="text-gray-400 dark:text-gray-500 font-normal">(max 3)</span>
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
                    onAddCospeaker();
                  }
                }}
                onBlur={(e) => setEmailError(validateEmail(e.target.value))}
                className={`w-full border ${emailError ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100`}
                placeholder="Co-speaker email"
                disabled={cospeakerEmails.length >= 3}
              />
              {emailError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{emailError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onAddCospeaker}
              disabled={cospeakerEmails.length >= 3 || !!emailError}
              className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-sm disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {cospeakerEmails.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {cospeakerEmails.map((email) => {
                const existing = paper.cospeakers.find((cs) => cs.email === email);
                return (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-200"
                  >
                    {existing
                      ? `${existing.first_name || ''} ${existing.last_name || ''}`.trim() || email
                      : email}
                    {existing && (
                      <span
                        className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${INVITATION_STATUS_COLORS[existing.invitation_status] || 'bg-gray-100 text-gray-600'}`}
                      >
                        {existing.invitation_status}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setCospeakerEmails(cospeakerEmails.filter((e) => e !== email))}
                      className="ml-0.5 text-primary-400 hover:text-primary-700"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {cospeakerEmails.length > 0 && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {cospeakerEmails.length}/3 co-speakers selected
            </p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Co-speakers must be registered on this platform. They will receive an invitation.
          </p>
        </div>
      )}

      {/* Actions */}
      {submitError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <div>
          {paper.is_main_speaker && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeletePending}
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
              {isDeletePending ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitPending || isUpdatePending}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50 transition-colors"
          >
            {isSubmitPending ? 'Submitting...' : 'Submit Paper'}
          </button>
          <button
            onClick={onSave}
            disabled={isUpdatePending || !!videoError}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 transition-all duration-300 inline-flex items-center gap-2 ${
              saveStatus === 'saved'
                ? 'bg-green-600 hover:bg-green-700'
                : saveStatus === 'error'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {saveStatus === 'saving' && (
              <svg
                className="animate-spin h-4 w-4 text-white"
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
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {saveStatus === 'saved' && (
              <svg
                className="h-4 w-4 text-white"
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
            )}
            {saveStatus === 'saving'
              ? 'Saving...'
              : saveStatus === 'saved'
                ? 'Saved!'
                : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
