import { useCallback, useRef, useState } from 'react';
import BackLink from '../../../../../components/userDetail/BackLink';
import CustomerTimelineCard from '../../../../../components/CustomerTimelineCard';
import FormSection from '../../../../../components/userDetail/FormSection';
import TabBar, { type TabDescriptor } from '../../../../../components/userDetail/TabBar';
import UserDetailHeader from '../../../../../components/userDetail/UserDetailHeader';
import MergeDialog from '../MergeDialog';
import type { EditableProfile, PortalUser } from '../types';
import NoPortalAccountNotice from './NoPortalAccountNotice';
import ProfileMediaFields from './ProfileMediaFields';
import PortalAccountSection from './PortalAccountSection';
import RegistrationsList from './RegistrationsList';
import OfferLinksTable from './OfferLinksTable';
import IdentitySection from './profile/IdentitySection';
import AddressSection from './profile/AddressSection';
import BioSection from './profile/BioSection';
import { useUserDetailData } from './useUserDetailData';
import { useUserDetailMutations } from './useUserDetailMutations';

type DetailTab = 'profile' | 'portal' | 'activity' | 'registrations';

interface Props {
  selectedUser: PortalUser;
  items: PortalUser[];
  onBack: () => void;
}

export default function UserDetailPanel({ selectedUser, items, onBack }: Props) {
  const [detailTab, setDetailTab] = useState<DetailTab>('profile');
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<PortalUser>(selectedUser);
  const [formData, setFormData] = useState<EditableProfile | null>(null);

  const { profileQuery, editableQuery } = useUserDetailData({
    attendeeId: currentUser.id,
    portalUserId: currentUser.portal_user_id,
  });

  const prevEditableRef = useRef<EditableProfile | null>(null);
  if (editableQuery.data && editableQuery.data !== prevEditableRef.current) {
    prevEditableRef.current = editableQuery.data;
    setFormData({ ...editableQuery.data });
  }

  const mutations = useUserDetailMutations({
    attendeeId: currentUser.id,
    portalUserId: currentUser.portal_user_id,
    onPictureRemoved: () => setFormData((prev) => (prev ? { ...prev, picture_url: null } : prev)),
    onVideoRemoved: () => setFormData((prev) => (prev ? { ...prev, video_url: null } : prev)),
    onPortalAccountCreated: (portalUserId) =>
      setCurrentUser((u) => ({ ...u, portal_user_id: portalUserId })),
  });

  const updateField = useCallback(
    <K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) => {
      setFormData((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    []
  );

  const handleSaveProfile = useCallback(() => {
    if (!formData) return;
    const { picture_url: _p, video_url: _v, ...payload } = formData;
    mutations.saveProfile.mutate(payload);
  }, [formData, mutations.saveProfile]);

  const profile = profileQuery.data;
  const hasPortal = !!currentUser.portal_user_id;

  const statusTone =
    profile?.status === 'inactive'
      ? 'inactive'
      : profile?.status === 'parked'
        ? 'parked'
        : 'active';
  const statusLabel =
    profile?.status === 'inactive'
      ? 'Inactive'
      : profile?.status === 'parked'
        ? 'Parked'
        : 'Active';

  const tabs: TabDescriptor<DetailTab>[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'portal', label: 'Portal Account' },
    { id: 'activity', label: 'Activity' },
    { id: 'registrations', label: 'Registrations', count: profile?.registrations.length ?? 0 },
  ];

  return (
    <div>
      <BackLink onClick={onBack} />

      {profileQuery.isLoading ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">Loading profile...</div>
      ) : profileQuery.isError || !profile ? (
        <div className="text-center py-12 text-red-500 dark:text-red-400">
          Failed to load user profile.
        </div>
      ) : (
        <div className="space-y-4">
          <UserDetailHeader
            firstName={profile.first_name}
            lastName={profile.last_name}
            email={profile.email}
            pictureUrl={formData?.picture_url ?? null}
            statusLabel={statusLabel}
            statusTone={statusTone}
            primaryAction={
              profile.status === 'inactive'
                ? {
                    label: 'Reactivate',
                    onClick: () => mutations.reactivateAttendee.mutate(),
                    loading: mutations.reactivateAttendee.isPending,
                    loadingLabel: 'Reactivating...',
                  }
                : null
            }
          />

          <TabBar tabs={tabs} active={detailTab} onChange={setDetailTab} />

          {detailTab === 'profile' && (
            <div className="space-y-4">
              {!hasPortal ? (
                <FormSection>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Profile editing is available once a portal account is linked. Open the{' '}
                    <button
                      type="button"
                      onClick={() => setDetailTab('portal')}
                      className="text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      Portal Account
                    </button>{' '}
                    tab to create one.
                  </p>
                </FormSection>
              ) : editableQuery.isLoading || !formData ? (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                  Loading profile form...
                </div>
              ) : (
                <>
                  <FormSection title="Media">
                    <ProfileMediaFields
                      firstName={formData.first_name}
                      lastName={formData.last_name}
                      pictureUrl={formData.picture_url}
                      videoUrl={formData.video_url}
                      onUploadPicture={(file) => mutations.uploadPicture.mutate(file)}
                      onDeletePicture={() => mutations.deletePicture.mutate()}
                      onUploadVideo={(file) => mutations.uploadVideo.mutate(file)}
                      onDeleteVideo={() => mutations.deleteVideo.mutate()}
                      pictureUploading={mutations.uploadPicture.isPending}
                      pictureDeleting={mutations.deletePicture.isPending}
                      videoUploading={mutations.uploadVideo.isPending}
                      videoDeleting={mutations.deleteVideo.isPending}
                    />
                  </FormSection>

                  <FormSection title="Identity">
                    <IdentitySection formData={formData} updateField={updateField} />
                  </FormSection>

                  <FormSection title="Address">
                    <AddressSection formData={formData} updateField={updateField} />
                  </FormSection>

                  <FormSection title="Bio">
                    <BioSection formData={formData} updateField={updateField} />
                  </FormSection>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={mutations.saveProfile.isPending}
                      className="px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40 transition-colors"
                    >
                      {mutations.saveProfile.isPending ? 'Saving...' : 'Save Profile'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {detailTab === 'portal' && (
            <div className="space-y-4">
              {hasPortal && currentUser.portal_user_id ? (
                <PortalAccountSection
                  portalAccount={profile.portal_account}
                  portalUserId={currentUser.portal_user_id}
                  onToggleAccess={() => mutations.toggleAccess.mutate(currentUser.portal_user_id!)}
                  onResendInvite={() => mutations.resendInvite.mutate(currentUser.portal_user_id!)}
                  onResetPassword={() =>
                    mutations.resetPassword.mutate(currentUser.portal_user_id!)
                  }
                  onImpersonate={() => mutations.impersonate.mutate(currentUser.portal_user_id!)}
                  onRequestMerge={() => setMergeTarget(currentUser.portal_user_id)}
                  isTogglingAccess={mutations.toggleAccess.isPending}
                  isResendingInvite={mutations.resendInvite.isPending}
                  isResettingPassword={mutations.resetPassword.isPending}
                  isImpersonating={mutations.impersonate.isPending}
                />
              ) : (
                <NoPortalAccountNotice
                  profile={profile}
                  onCreate={() => mutations.createPortalAccount.mutate()}
                  isCreating={mutations.createPortalAccount.isPending}
                />
              )}
            </div>
          )}

          {detailTab === 'activity' && (
            <div className="space-y-4">
              {hasPortal && currentUser.portal_user_id ? (
                <CustomerTimelineCard portalUserId={currentUser.portal_user_id} />
              ) : (
                <FormSection>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Activity is available once a portal account is linked.
                  </p>
                </FormSection>
              )}
            </div>
          )}

          {detailTab === 'registrations' && (
            <div className="space-y-4">
              <RegistrationsList registrations={profile.registrations} />
              <OfferLinksTable offerLinks={profile.offer_links} />
            </div>
          )}
        </div>
      )}

      {mergeTarget && (
        <MergeDialog
          targetPortalUserId={mergeTarget}
          items={items}
          onClose={() => setMergeTarget(null)}
          onMerged={() => {
            setMergeTarget(null);
            onBack();
          }}
        />
      )}
    </div>
  );
}
