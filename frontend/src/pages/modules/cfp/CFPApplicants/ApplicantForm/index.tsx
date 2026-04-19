import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { queryKeys } from '../../../../../config/queryKeys';
import { useSaveStatus } from '../../../../../hooks/useSaveStatus';
import { useAuthMedia } from '../../../../../hooks/useAuthMedia';
import {
  ACCEPTED_IMAGE_FORMATS,
  ACCEPTED_VIDEO_FORMATS,
  validateImage,
  validateVideo,
} from '../../../../../utils/mediaValidation';
import RichTextEditor from '../../../../../components/common/RichTextEditor';
import MediaPreviewModal from '../../../../../components/MediaPreviewModal';
import { ErrorBanner } from '../../../../../components/common/ErrorBanner';
import PortalAccountCard from '../../../../../components/PortalAccountCard';
import CustomerTimelineCard from '../../../../../components/CustomerTimelineCard';
import FormSection from '../../../../../components/userDetail/FormSection';
import TabBar, { type TabDescriptor } from '../../../../../components/userDetail/TabBar';
import UserDetailHeader from '../../../../../components/userDetail/UserDetailHeader';
import type { Applicant, PronounOption, UserRole } from '../../../../../types';
import { ApplicantPapers } from '../ApplicantPapers';

import MediaUploadField from './MediaUploadField';
import IdentityFields from './IdentityFields';
import AddressFields from './AddressFields';
import SocialLinksEditor from './SocialLinksEditor';
import RolesField from './RolesField';
import CheckboxFields from './CheckboxFields';
import FormActions from './FormActions';
import { convertSocialLinks, emptyForm, type ApplicantFormData } from './types';

export type { ApplicantFormData } from './types';

type CFPTab = 'profile' | 'account' | 'activity' | 'papers';

function buildFormState(applicant: Applicant | null): ApplicantFormData {
  if (!applicant) return emptyForm;
  return {
    first_name: applicant.first_name,
    last_name: applicant.last_name,
    pronouns: applicant.pronouns || '',
    email: applicant.email,
    phone: applicant.phone || '',
    title: applicant.title || '',
    company: applicant.company || '',
    address_line_1: applicant.address_line_1 || '',
    address_line_2: applicant.address_line_2 || '',
    city: applicant.city || '',
    postal_code: applicant.postal_code || '',
    country: applicant.country || '',
    bio: applicant.bio || '',
    password: '',
    allow_out_of_timeframe: applicant.allow_out_of_timeframe,
    social_links: convertSocialLinks(applicant.social_links),
    needs_accessibility: applicant.needs_accessibility,
    accessibility_details: applicant.accessibility_details || '',
    agrees_to_recording: applicant.agrees_to_recording,
    role_ids: applicant.roles?.map((r) => r.id) || [],
  };
}

export function ApplicantForm({
  applicant,
  onSave,
  onCancel,
  onDelete,
  isSaving,
  isDeleting,
  error,
  conferenceId,
}: {
  applicant: Applicant | null;
  onSave: (data: ApplicantFormData, pictureFile: File | null, videoFile: File | null) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isSaving: boolean;
  isDeleting?: boolean;
  error: string | null;
  conferenceId?: string;
}) {
  const isEditing = !!applicant;
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();
  const [activeTab, setActiveTab] = useState<CFPTab>('profile');

  const { data: pronounOptions } = useQuery({
    queryKey: queryKeys.pronounOptions,
    queryFn: async () => {
      const response = await api.get<{ items: PronounOption[] }>('/pronoun-options');
      return response.data.items.filter((p) => p.is_active);
    },
  });

  const { data: userRoles } = useQuery({
    queryKey: ['user-roles-active', conferenceId],
    queryFn: async () => {
      const response = await api.get<{ items: UserRole[] }>(
        `/conferences/${conferenceId}/settings/user-roles`
      );
      return response.data.items.filter((r) => r.is_active);
    },
    enabled: !!conferenceId,
  });

  const [formData, setFormData] = useState<ApplicantFormData>(() => buildFormState(applicant));
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [mediaPreview, setMediaPreview] = useState<{
    open: boolean;
    src: string | null;
    type: 'image' | 'video';
  }>({ open: false, src: null, type: 'image' });

  const existingPictureSrc = useAuthMedia(applicant?.picture_url ?? null);
  const existingVideoSrc = useAuthMedia(applicant?.video_url ?? null);
  const picturePreviewSrc = picturePreview || existingPictureSrc;
  const videoPreviewSrc = videoPreview || existingVideoSrc;

  const applicantRolesKey = useMemo(
    () =>
      applicant?.roles
        ?.map((r) => r.id)
        .sort()
        .join(',') ?? '',
    [applicant?.roles]
  );

  useEffect(() => {
    setFormData(buildFormState(applicant));
    setPictureFile(null);
    if (picturePreview) URL.revokeObjectURL(picturePreview);
    setPicturePreview(null);
    setPictureError(null);
    setVideoFile(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null);
    setVideoError(null);
    setPhoneError(null);
    setActiveTab('profile');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant?.id, applicantRolesKey]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.first_name.trim() || !formData.last_name.trim() || !formData.email.trim()) return;
    if (!isEditing && !formData.password.trim()) return;
    if (pictureError || videoError || phoneError) return;

    setSaving();
    onSave(formData, pictureFile, videoFile);
  };

  useEffect(() => {
    if (saveStatus === 'saving' && !isSaving) {
      if (error) {
        setSaveError();
      } else {
        setSaved();
      }
    }
  }, [isSaving, error, saveStatus, setSaveError, setSaved]);

  const socialLinksKey = applicant?.id ?? 'new';
  const openMediaPreview = (src: string, type: 'image' | 'video') =>
    setMediaPreview({ open: true, src, type });

  const tabs: TabDescriptor<CFPTab>[] = applicant?.portal_user_id
    ? [
        { id: 'profile', label: 'Profile' },
        { id: 'account', label: 'Portal Account' },
        { id: 'activity', label: 'Activity' },
        { id: 'papers', label: 'Papers' },
      ]
    : isEditing
      ? [
          { id: 'profile', label: 'Profile' },
          { id: 'papers', label: 'Papers' },
        ]
      : [{ id: 'profile', label: 'Profile' }];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ErrorBanner message={error} />

      {isEditing && applicant && (
        <UserDetailHeader
          firstName={applicant.first_name}
          lastName={applicant.last_name}
          email={applicant.email}
          pictureUrl={applicant.picture_url}
        />
      )}

      {isEditing && <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />}

      {activeTab === 'profile' && (
        <>
          <FormSection title="Media">
            <div className="space-y-5">
              <MediaUploadField
                kind="image"
                label="Picture"
                acceptedFormats={ACCEPTED_IMAGE_FORMATS}
                helpText="JPEG, PNG, WebP, TIFF, or BMP. Min 600x600px (300 DPI)."
                previewSrc={picturePreviewSrc}
                error={pictureError}
                onFileChange={handlePictureChange}
                onPreviewClick={(src) => openMediaPreview(src, 'image')}
              />
              <MediaUploadField
                kind="video"
                label="Video"
                acceptedFormats={ACCEPTED_VIDEO_FORMATS}
                helpText="MP4, MOV, WebM, AVI, or MKV. Max 5MB."
                previewSrc={videoPreviewSrc}
                error={videoError}
                onFileChange={handleVideoChange}
                onPreviewClick={(src) => openMediaPreview(src, 'video')}
              />
            </div>
          </FormSection>

          <FormSection title="Identity">
            <IdentityFields
              formData={formData}
              setFormData={setFormData}
              emailError={emailError}
              setEmailError={setEmailError}
              phoneError={phoneError}
              setPhoneError={setPhoneError}
              pronounOptions={pronounOptions}
            />
          </FormSection>

          <FormSection title="Address">
            <AddressFields formData={formData} setFormData={setFormData} />
          </FormSection>

          <FormSection title="Account">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password{' '}
                  {isEditing ? (
                    <span className="text-gray-400 dark:text-gray-500 font-normal">
                      (leave blank to keep current)
                    </span>
                  ) : (
                    <span className="text-red-500">*</span>
                  )}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData((d) => ({ ...d, password: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  required={!isEditing}
                  minLength={6}
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Bio">
            <RichTextEditor
              value={formData.bio}
              onChange={(html) => setFormData((d) => ({ ...d, bio: html }))}
              placeholder="Brief biography..."
              rows={4}
            />
          </FormSection>

          {conferenceId && userRoles && userRoles.length > 0 && (
            <FormSection title="Roles">
              <RolesField formData={formData} setFormData={setFormData} userRoles={userRoles} />
            </FormSection>
          )}

          <FormSection title="Social Links">
            <SocialLinksEditor key={socialLinksKey} formData={formData} setFormData={setFormData} />
          </FormSection>

          <FormSection title="Preferences">
            <CheckboxFields formData={formData} setFormData={setFormData} />
          </FormSection>

          <FormActions
            isEditing={isEditing}
            isSaving={isSaving}
            isDeleting={isDeleting}
            onCancel={onCancel}
            onDelete={onDelete}
            saveStatus={saveStatus}
            submitDisabled={!!pictureError || !!videoError || !!phoneError}
          />
        </>
      )}

      {activeTab === 'account' && applicant?.portal_user_id && (
        <div className="space-y-4">
          <PortalAccountCard portalUserId={applicant.portal_user_id} />
        </div>
      )}

      {activeTab === 'activity' && applicant?.portal_user_id && (
        <div className="space-y-4">
          <CustomerTimelineCard portalUserId={applicant.portal_user_id} />
        </div>
      )}

      {activeTab === 'papers' && applicant && <ApplicantPapers applicantId={applicant.id} />}

      <MediaPreviewModal
        open={mediaPreview.open}
        onClose={() => setMediaPreview({ open: false, src: null, type: 'image' })}
        src={mediaPreview.src}
        type={mediaPreview.type}
        alt="Applicant media"
      />
    </form>
  );
}
