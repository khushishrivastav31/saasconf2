import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import portalApi from '../../config/portalApi';
import type { ApplicantProfile, ApplicantProfileUpdate } from '../../types/portal';
import RichTextEditor from '../../components/common/RichTextEditor';
import MediaPreviewModal from '../../components/MediaPreviewModal';
import ProgramCommitteeTab from './ProgramCommitteeTab';
import { SPEAKER_SOCIAL_PLATFORMS } from '../../config/socialPlatforms';
import {
  ACCEPTED_IMAGE_FORMATS,
  ACCEPTED_VIDEO_FORMATS,
  validateImage,
  validateVideo,
} from '../../utils/mediaValidation';
import { usePortalAuthMedia } from '../../hooks/usePortalAuthMedia';

function convertSocialLinks(
  links: Record<string, string> | null | undefined
): Record<string, string> {
  if (!links) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(links)) {
    if (value && typeof value === 'string' && value.trim()) {
      result[key] = value;
    }
  }
  return result;
}

type ProfileTab = 'personal-info' | 'program-committee';

function ProfilePage() {
  const { applicant, refreshApplicant } = useApplicantAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>('personal-info');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [bio, setBio] = useState('');
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [addPlatform, setAddPlatform] = useState('');
  const [customPlatformName, setCustomPlatformName] = useState('');
  const [needsAccessibility, setNeedsAccessibility] = useState(false);
  const [accessibilityDetails, setAccessibilityDetails] = useState('');
  const [agreesToRecording, setAgreesToRecording] = useState(false);
  const [messageNotifications, setMessageNotifications] = useState(true);
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();

  const [pronounOptions, setPronounOptions] = useState<{ id: string; name: string }[]>([]);

  // Picture state
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);

  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Media preview modal
  const [mediaPreview, setMediaPreview] = useState<{
    open: boolean;
    src: string | null;
    type: 'image' | 'video';
  }>({ open: false, src: null, type: 'image' });

  const existingPictureSrc = usePortalAuthMedia(applicant?.picture_url ?? null);
  const existingVideoSrc = usePortalAuthMedia(applicant?.video_url ?? null);
  const picturePreviewSrc = picturePreview || existingPictureSrc;
  const videoPreviewSrc = videoPreview || existingVideoSrc;

  useEffect(() => {
    if (applicant) {
      setFirstName(applicant.first_name);
      setLastName(applicant.last_name);
      setPronouns(applicant.pronouns || '');
      setPhone(applicant.phone || '');
      setTitle(applicant.title || '');
      setCompany(applicant.company || '');
      setBio(applicant.bio || '');
      setSocialLinks(convertSocialLinks(applicant.social_links));
      setNeedsAccessibility(applicant.needs_accessibility);
      setAccessibilityDetails(applicant.accessibility_details || '');
      setAgreesToRecording(applicant.agrees_to_recording);
      setMessageNotifications(applicant.message_notifications_enabled ?? true);
    }
  }, [applicant]);

  useEffect(() => {
    portalApi
      .get<{ id: string; name: string }[]>('/portal/pronoun-options')
      .then((res) => setPronounOptions(res.data))
      .catch((err) => console.error('Failed to load pronoun options:', err));
  }, []);

  useEffect(() => {
    return () => {
      if (picturePreview) URL.revokeObjectURL(picturePreview);
      if (videoPreview) URL.revokeObjectURL(videoPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setPictureError(null);
    if (picturePreview) {
      URL.revokeObjectURL(picturePreview);
      setPicturePreview(null);
    }
    if (!file) {
      setPictureFile(null);
      return;
    }
    const validationError = await validateImage(file);
    if (validationError) {
      setPictureError(validationError);
      setPictureFile(null);
      e.target.value = '';
      return;
    }
    setPictureFile(file);
    setPicturePreview(URL.createObjectURL(file));
  };

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
    const validationError = validateVideo(file, 5);
    if (validationError) {
      setVideoError(validationError);
      setVideoFile(null);
      e.target.value = '';
      return;
    }
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const uploadMedia = async (entityType: string, entityId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('entity_type', entityType);
    form.append('entity_id', entityId);
    await portalApi.post('/portal/attachments', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  };

  const updateMutation = useMutation({
    mutationFn: async (data: ApplicantProfileUpdate) => {
      const res = await portalApi.put<ApplicantProfile>('/portal/me', data);
      return res.data;
    },
    onMutate: () => setSaving(),
    onSuccess: () => {
      setSaved();
      refreshApplicant();
    },
    onError: () => {
      setSaveError();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pictureError || videoError) return;

    // Filter out empty social links
    const filteredLinks: Record<string, string> = {};
    Object.entries(socialLinks).forEach(([key, value]) => {
      if (value && value.trim()) {
        filteredLinks[key] = value.trim();
      }
    });

    updateMutation.mutate({
      first_name: firstName,
      last_name: lastName,
      pronouns: pronouns || undefined,
      phone: phone || undefined,
      title: title || undefined,
      company: company || undefined,
      bio: bio || undefined,
      social_links: filteredLinks,
      needs_accessibility: needsAccessibility,
      accessibility_details: needsAccessibility ? accessibilityDetails || undefined : undefined,
      agrees_to_recording: agreesToRecording,
      message_notifications_enabled: messageNotifications,
    });

    // Upload picture/video if selected
    if (applicant && pictureFile) {
      try {
        await uploadMedia('applicant_picture', applicant.id, pictureFile);
        setPictureFile(null);
        refreshApplicant();
      } catch {
        // non-fatal
      }
    }
    if (applicant && videoFile) {
      try {
        await uploadMedia('applicant_video', applicant.id, videoFile);
        setVideoFile(null);
        refreshApplicant();
      } catch {
        // non-fatal
      }
    }
  };

  // Social links helpers
  const knownKeys = new Set(SPEAKER_SOCIAL_PLATFORMS.map((p) => p.key));
  const allEntries: { key: string; label: string; placeholder: string }[] = [];
  for (const p of SPEAKER_SOCIAL_PLATFORMS) {
    if (socialLinks[p.key] !== undefined) {
      allEntries.push(p);
    }
  }
  for (const key of Object.keys(socialLinks)) {
    if (!knownKeys.has(key)) {
      allEntries.push({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
        placeholder: 'Enter URL...',
      });
    }
  }
  const availablePlatforms = SPEAKER_SOCIAL_PLATFORMS.filter(
    (p) => socialLinks[p.key] === undefined
  );

  const handleAddPlatform = () => {
    const key =
      addPlatform === '__custom__'
        ? customPlatformName.trim().toLowerCase().replace(/\s+/g, '_')
        : addPlatform;
    if (!key || socialLinks[key] !== undefined) return;
    setSocialLinks((prev) => ({ ...prev, [key]: '' }));
    setAddPlatform('');
    setCustomPlatformName('');
  };

  const handleDeletePlatform = (key: string) => {
    setSocialLinks((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  if (!applicant) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">My Profile</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {activeTab === 'personal-info'
              ? 'Update your personal information and preferences.'
              : 'View and manage your program committee memberships.'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('personal-info')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'personal-info'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Personal Info
          </button>
          <button
            onClick={() => setActiveTab('program-committee')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'program-committee'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Program Committee
          </button>
        </nav>
      </div>

      {activeTab === 'program-committee' ? (
        <ProgramCommitteeTab />
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-5"
        >
          {/* Email (readonly) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              disabled
              value={applicant.email}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
            />
          </div>

          {/* Picture */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Picture
            </label>
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() => {
                  if (picturePreviewSrc) {
                    setMediaPreview({
                      open: true,
                      src: picturePreviewSrc,
                      type: 'image',
                    });
                  }
                }}
                disabled={!picturePreviewSrc}
                className={`w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-gray-900 ${
                  picturePreviewSrc
                    ? 'cursor-pointer hover:border-primary-400 hover:shadow-md transition-all'
                    : ''
                }`}
                title={picturePreviewSrc ? 'Click to view full size' : undefined}
              >
                {picturePreviewSrc ? (
                  <img
                    src={picturePreviewSrc}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                )}
              </button>
              <div className="flex-1">
                <input
                  type="file"
                  accept={ACCEPTED_IMAGE_FORMATS}
                  onChange={handlePictureChange}
                  className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:dark:bg-gray-700 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  JPEG, PNG, WebP, TIFF, or BMP. Min 600x600px (300 DPI).
                </p>
                {pictureError && <p className="mt-1 text-xs text-red-600">{pictureError}</p>}
              </div>
            </div>
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
                    setMediaPreview({
                      open: true,
                      src: videoPreviewSrc,
                      type: 'video',
                    });
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
                  onChange={handleVideoChange}
                  className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:dark:bg-gray-700 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  MP4, MOV, WebM, AVI, or MKV. Max 5MB.
                </p>
                {videoError && <p className="mt-1 text-xs text-red-600">{videoError}</p>}
              </div>
            </div>
          </div>

          {/* Personal info fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Pronouns
              </label>
              <select
                value={pronouns}
                onChange={(e) => setPronouns(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Select pronouns...</option>
                {pronounOptions.map((opt) => (
                  <option key={opt.id} value={opt.name}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title / Position
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                placeholder="e.g., Senior Engineer"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Company / Organization
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Short Bio
            </label>
            <RichTextEditor
              value={bio}
              onChange={(html) => setBio(html)}
              placeholder="Tell us about yourself..."
              rows={4}
            />
          </div>

          {/* Social Media Links */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Social Media Profiles
            </label>

            {allEntries.length > 0 ? (
              <div className="space-y-2 mb-3">
                {allEntries.map((platform) => (
                  <div key={platform.key} className="flex items-center gap-2">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 w-24 flex-shrink-0">
                      {platform.label}
                    </label>
                    <input
                      type="url"
                      placeholder={platform.placeholder}
                      className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md py-1.5 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                      value={socialLinks[platform.key] || ''}
                      onChange={(e) =>
                        setSocialLinks((prev) => ({
                          ...prev,
                          [platform.key]: e.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => handleDeletePlatform(platform.key)}
                      className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title={`Remove ${platform.label}`}
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
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 mb-3">
                No social media links added yet.
              </div>
            )}

            {/* Add new social link */}
            <div className="flex items-center gap-2">
              <select
                value={addPlatform}
                onChange={(e) => {
                  setAddPlatform(e.target.value);
                  if (e.target.value !== '__custom__') setCustomPlatformName('');
                }}
                className="border border-gray-300 dark:border-gray-600 rounded-md py-1.5 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Select platform...</option>
                {availablePlatforms.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
                <option value="__custom__">Custom...</option>
              </select>
              {addPlatform === '__custom__' && (
                <input
                  type="text"
                  placeholder="Platform name"
                  value={customPlatformName}
                  onChange={(e) => setCustomPlatformName(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded-md py-1.5 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 w-32"
                />
              )}
              <button
                type="button"
                onClick={handleAddPlatform}
                disabled={
                  !addPlatform || (addPlatform === '__custom__' && !customPlatformName.trim())
                }
                className="inline-flex items-center px-2.5 py-1.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add
              </button>
            </div>
          </div>

          {/* Accessibility */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="needs_accessibility"
                checked={needsAccessibility}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setNeedsAccessibility(checked);
                  if (!checked) setAccessibilityDetails('');
                }}
                className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="needs_accessibility" className="flex-1">
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  I need accessibility accommodations
                </span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Check if you require accessibility accommodations for the conference.
                </span>
              </label>
            </div>
            {needsAccessibility && (
              <div className="ml-7 mt-3">
                <textarea
                  rows={2}
                  value={accessibilityDetails}
                  onChange={(e) => setAccessibilityDetails(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="e.g., wheelchair access, sign language interpreter, dietary requirements..."
                />
              </div>
            )}
          </div>

          {/* Recording */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="agrees_to_recording"
              checked={agreesToRecording}
              onChange={(e) => setAgreesToRecording(e.target.checked)}
              className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="agrees_to_recording" className="flex-1">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                I agree to being recorded
              </span>
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                I agree that any selected session from me can be recorded and shared publicly.
              </span>
            </label>
          </div>

          {/* Message Notifications */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="message_notifications"
              checked={messageNotifications}
              onChange={(e) => setMessageNotifications(e.target.checked)}
              className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="message_notifications" className="flex-1">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email notifications for new messages
              </span>
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Receive an email when you get a new message on the platform.
              </span>
            </label>
          </div>

          {/* Save */}
          <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="submit"
              disabled={updateMutation.isPending || !!pictureError || !!videoError}
              className={`px-4 py-2 text-white rounded-md text-sm font-medium transition-colors duration-200 disabled:opacity-50 ${
                saveStatus === 'saved'
                  ? 'bg-green-600'
                  : saveStatus === 'error'
                    ? 'bg-red-600'
                    : 'bg-primary-600 hover:bg-primary-700'
              }`}
            >
              {saveStatus === 'saving' ? (
                <span className="inline-flex items-center gap-1.5">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
                  Saving...
                </span>
              ) : saveStatus === 'saved' ? (
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Saved
                </span>
              ) : saveStatus === 'error' ? (
                'Save failed'
              ) : (
                'Save Profile'
              )}
            </button>
          </div>
        </form>
      )}

      {/* Media Preview Modal */}
      <MediaPreviewModal
        open={mediaPreview.open}
        onClose={() => setMediaPreview({ open: false, src: null, type: 'image' })}
        src={mediaPreview.src}
        type={mediaPreview.type}
        alt="Profile media"
      />
    </div>
  );
}

export default ProfilePage;
