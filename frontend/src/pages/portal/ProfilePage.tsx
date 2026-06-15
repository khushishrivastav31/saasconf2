import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import UnsavedChangesDialog from '../../components/UnsavedChangesDialog';
import portalApi from '../../config/portalApi';
import type {
  ApplicantProfile,
  ApplicantProfileUpdate,
  PortalMePatchBody,
  PortalConferenceSummary,
} from '../../types/portal';
import RichTextEditor from '../../components/common/RichTextEditor';
import MediaPreviewModal from '../../components/MediaPreviewModal';
import ProgramCommitteeTab from './ProgramCommitteeTab';
import VolunteerProfileSection from '../../components/portal/VolunteerProfileSection';
import { validateImage, validateVideo } from '../../utils/mediaValidation';
import { usePortalAuthMedia } from '../../hooks/usePortalAuthMedia';
import MediaUploader from './profile/MediaUploader';
import IdentityFields from './profile/IdentityFields';
import AddressFields from './profile/AddressFields';
import SocialLinksEditor from './profile/SocialLinksEditor';
import PreferencesCheckboxes from './profile/PreferencesCheckboxes';
import SaveButton from './profile/SaveButton';

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

const BIO_MIN_CHARS = 300;
const BIO_MAX_CHARS = 2000;

function ProfilePage() {
  const { applicant, portalMe, refreshApplicant } = useApplicantAuth();
  const isAttendeeOnly = !applicant && !!portalMe?.is_conference_attendee;
  const [activeTab, setActiveTab] = useState<ProfileTab>('personal-info');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [profileCity, setProfileCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [profileCountry, setProfileCountry] = useState('');
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

  const { data: conferences } = useQuery({
    queryKey: ['portal-conferences'],
    queryFn: async () => {
      const res = await portalApi.get<PortalConferenceSummary[]>('/portal/conferences');
      return res.data;
    },
    enabled: !!applicant,
  });

  const requiredSpeakerFields = useMemo(() => {
    if (!conferences) return [];
    const fields = new Set<string>();
    for (const conf of conferences) {
      for (const cfp of conf.cfps) {
        if (cfp.status === 'open') {
          for (const f of cfp.required_speaker_fields) {
            fields.add(f);
          }
        }
      }
    }
    return [...fields];
  }, [conferences]);

  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

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
      setAddressLine1(applicant.address_line_1 || '');
      setAddressLine2(applicant.address_line_2 || '');
      setProfileCity(applicant.city || '');
      setPostalCode(applicant.postal_code || '');
      setProfileCountry(applicant.country || '');
      setBio(applicant.bio || '');
      setSocialLinks(convertSocialLinks(applicant.social_links));
      setNeedsAccessibility(applicant.needs_accessibility);
      setAccessibilityDetails(applicant.accessibility_details || '');
      setAgreesToRecording(applicant.agrees_to_recording);
      setMessageNotifications(applicant.message_notifications_enabled ?? true);
    }
  }, [applicant]);

  useEffect(() => {
    if (isAttendeeOnly && portalMe) {
      setFirstName(portalMe.first_name);
      setLastName(portalMe.last_name);
      setPronouns(portalMe.pronouns || '');
      setPhone(portalMe.phone || '');
      setTitle(portalMe.title || '');
      setCompany(portalMe.company || '');
      setAddressLine1(portalMe.address_line_1 || '');
      setAddressLine2(portalMe.address_line_2 || '');
      setProfileCity(portalMe.city || '');
      setPostalCode(portalMe.postal_code || '');
      setProfileCountry(portalMe.country || '');
      setBio(portalMe.bio || '');
    }
  }, [isAttendeeOnly, portalMe]);

  const isDirty = useMemo(() => {
    if (!applicant) return false;
    return (
      firstName !== applicant.first_name ||
      lastName !== applicant.last_name ||
      pronouns !== (applicant.pronouns || '') ||
      phone !== (applicant.phone || '') ||
      title !== (applicant.title || '') ||
      company !== (applicant.company || '') ||
      addressLine1 !== (applicant.address_line_1 || '') ||
      addressLine2 !== (applicant.address_line_2 || '') ||
      profileCity !== (applicant.city || '') ||
      postalCode !== (applicant.postal_code || '') ||
      profileCountry !== (applicant.country || '') ||
      bio !== (applicant.bio || '') ||
      needsAccessibility !== applicant.needs_accessibility ||
      accessibilityDetails !== (applicant.accessibility_details || '') ||
      agreesToRecording !== applicant.agrees_to_recording ||
      messageNotifications !== (applicant.message_notifications_enabled ?? true) ||
      !!pictureFile ||
      !!videoFile
    );
  }, [
    applicant,
    firstName,
    lastName,
    pronouns,
    phone,
    title,
    company,
    addressLine1,
    addressLine2,
    profileCity,
    postalCode,
    profileCountry,
    bio,
    needsAccessibility,
    accessibilityDetails,
    agreesToRecording,
    messageNotifications,
    pictureFile,
    videoFile,
  ]);

  const { showDialog, confirmLeave, cancelLeave } = useUnsavedChanges(isDirty);

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

  const attendeeMutation = useMutation({
    mutationFn: async (data: PortalMePatchBody) => {
      const res = await portalApi.patch('/portal/unified/me', data);
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

  const [requiredFieldErrors, setRequiredFieldErrors] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const bioTextLen = bio.replace(/<[^>]*>/g, '').trim().length;
    const missing: string[] = [];

    if (!isAttendeeOnly && requiredSpeakerFields.length > 0) {
      const fieldValues: Record<string, boolean> = {
        bio: bioTextLen > 0,
        title: !!title.trim(),
        company: !!company.trim(),
        phone: !!phone.trim(),
        picture: !!pictureFile || !!applicant?.picture_url,
        video: !!videoFile || !!applicant?.video_url,
      };
      const labels: Record<string, string> = {
        bio: 'Short Bio',
        title: 'Title / Position',
        company: 'Company / Organization',
        phone: 'Phone',
        picture: 'Profile Picture',
        video: 'Video',
      };
      for (const field of requiredSpeakerFields) {
        if (field === 'address') {
          if (!addressLine1.trim()) missing.push('Address Line 1');
          if (!profileCity.trim()) missing.push('City');
          if (!postalCode.trim()) missing.push('Postal Code');
          if (!profileCountry.trim()) missing.push('Country');
        } else if (!fieldValues[field]) {
          missing.push(labels[field] ?? field);
        }
      }
    }

    if (!isAttendeeOnly) {
      if (bioTextLen > BIO_MAX_CHARS) {
        if (!missing.includes('Short Bio')) missing.push('Short Bio');
      } else if (bioTextLen > 0 && bioTextLen < BIO_MIN_CHARS) {
        if (!missing.includes('Short Bio')) missing.push('Short Bio');
      }
    }

    if (missing.length > 0) {
      setRequiredFieldErrors(missing);
      return;
    }
    setRequiredFieldErrors([]);

    if (isAttendeeOnly) {
      attendeeMutation.mutate({
        first_name: firstName,
        last_name: lastName,
        pronouns: pronouns || undefined,
        phone: phone || undefined,
        title: title || undefined,
        company: company || undefined,
        address_line_1: addressLine1 || undefined,
        address_line_2: addressLine2 || undefined,
        city: profileCity || undefined,
        postal_code: postalCode || undefined,
        country: profileCountry || undefined,
        bio: bio || undefined,
      });
      return;
    }

    if (pictureError || videoError) return;

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
      address_line_1: addressLine1 || undefined,
      address_line_2: addressLine2 || undefined,
      city: profileCity || undefined,
      postal_code: postalCode || undefined,
      country: profileCountry || undefined,
      bio: bio || undefined,
      social_links: filteredLinks,
      needs_accessibility: needsAccessibility,
      accessibility_details: needsAccessibility ? accessibilityDetails || undefined : undefined,
      agrees_to_recording: agreesToRecording,
      message_notifications_enabled: messageNotifications,
    });

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

  if (!applicant && !isAttendeeOnly) return null;

  if (isAttendeeOnly) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">My Profile</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Update your personal information.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              disabled
              value={portalMe?.email ?? ''}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
            />
          </div>

          <IdentityFields
            firstName={firstName}
            lastName={lastName}
            pronouns={pronouns}
            phone={phone}
            title={title}
            company={company}
            pronounOptions={pronounOptions}
            onFirstNameChange={setFirstName}
            onLastNameChange={setLastName}
            onPronounsChange={setPronouns}
            onPhoneChange={setPhone}
            onTitleChange={setTitle}
            onCompanyChange={setCompany}
          />

          <AddressFields
            addressLine1={addressLine1}
            addressLine2={addressLine2}
            city={profileCity}
            postalCode={postalCode}
            country={profileCountry}
            onAddressLine1Change={setAddressLine1}
            onAddressLine2Change={setAddressLine2}
            onCityChange={setProfileCity}
            onPostalCodeChange={setPostalCode}
            onCountryChange={setProfileCountry}
          />

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

          <SaveButton saveStatus={saveStatus} disabled={attendeeMutation.isPending} />
        </form>

        <UnsavedChangesDialog open={showDialog} onConfirm={confirmLeave} onCancel={cancelLeave} />
      </div>
    );
  }

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
        <>
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-5"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                disabled
                value={applicant?.email ?? ''}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
              />
            </div>

            <MediaUploader
              picturePreviewSrc={picturePreviewSrc}
              videoPreviewSrc={videoPreviewSrc}
              pictureError={pictureError}
              videoError={videoError}
              requiredFields={requiredSpeakerFields}
              onPictureChange={handlePictureChange}
              onVideoChange={handleVideoChange}
              onOpenPreview={(src, type) => setMediaPreview({ open: true, src, type })}
            />

            <IdentityFields
              firstName={firstName}
              lastName={lastName}
              pronouns={pronouns}
              phone={phone}
              title={title}
              company={company}
              country={profileCountry}
              pronounOptions={pronounOptions}
              requiredFields={requiredSpeakerFields}
              onFirstNameChange={setFirstName}
              onLastNameChange={setLastName}
              onPronounsChange={setPronouns}
              onPhoneChange={setPhone}
              onTitleChange={setTitle}
              onCompanyChange={setCompany}
            />

            <AddressFields
              addressLine1={addressLine1}
              addressLine2={addressLine2}
              city={profileCity}
              postalCode={postalCode}
              country={profileCountry}
              requiredFields={requiredSpeakerFields}
              onAddressLine1Change={setAddressLine1}
              onAddressLine2Change={setAddressLine2}
              onCityChange={setProfileCity}
              onPostalCodeChange={setPostalCode}
              onCountryChange={setProfileCountry}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Short Bio
                {requiredSpeakerFields.includes('bio') && <span className="text-red-500"> *</span>}
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Write 300–2,000 characters about yourself and your experience.
              </p>
              <RichTextEditor
                value={bio}
                onChange={(html) => setBio(html)}
                placeholder="Tell us about yourself..."
                rows={4}
                minLength={BIO_MIN_CHARS}
                maxLength={BIO_MAX_CHARS}
              />
            </div>

            <SocialLinksEditor
              socialLinks={socialLinks}
              setSocialLinks={setSocialLinks}
              addPlatform={addPlatform}
              setAddPlatform={setAddPlatform}
              customPlatformName={customPlatformName}
              setCustomPlatformName={setCustomPlatformName}
            />

            <PreferencesCheckboxes
              needsAccessibility={needsAccessibility}
              accessibilityDetails={accessibilityDetails}
              agreesToRecording={agreesToRecording}
              messageNotifications={messageNotifications}
              onNeedsAccessibilityChange={setNeedsAccessibility}
              onAccessibilityDetailsChange={setAccessibilityDetails}
              onAgreesToRecordingChange={setAgreesToRecording}
              onMessageNotificationsChange={setMessageNotifications}
            />

            {requiredFieldErrors.length > 0 && (
              <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
                Please fill in all required fields before saving: {requiredFieldErrors.join(', ')}.
              </div>
            )}

            <SaveButton
              saveStatus={saveStatus}
              disabled={updateMutation.isPending || !!pictureError || !!videoError}
            />
          </form>

          <VolunteerProfileSection />
        </>
      )}

      <MediaPreviewModal
        open={mediaPreview.open}
        onClose={() => setMediaPreview({ open: false, src: null, type: 'image' })}
        src={mediaPreview.src}
        type={mediaPreview.type}
        alt="Profile media"
      />
      <UnsavedChangesDialog open={showDialog} onConfirm={confirmLeave} onCancel={cancelLeave} />
    </div>
  );
}

export default ProfilePage;
