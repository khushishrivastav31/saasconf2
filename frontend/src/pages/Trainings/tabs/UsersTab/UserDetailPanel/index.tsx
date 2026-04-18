import { useCallback, useRef, useState } from 'react';
import MergeDialog from '../MergeDialog';
import type { DetailTab, EditableProfile, PortalUser } from '../types';
import UserDetailHeader from './UserDetailHeader';
import DetailTabs from './DetailTabs';
import NoPortalAccountNotice from './NoPortalAccountNotice';
import ProfileMediaFields from './ProfileMediaFields';
import ProfileFormFields from './ProfileFormFields';
import PortalAccountSection from './PortalAccountSection';
import RegistrationsList from './RegistrationsList';
import OfferLinksTable from './OfferLinksTable';
import ActivityHistory from './ActivityHistory';
import { useUserDetailData } from './useUserDetailData';
import { useUserDetailMutations } from './useUserDetailMutations';
import { sectionCls } from './styles';

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

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-4"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to users
      </button>

      {profileQuery.isLoading ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">Loading profile...</div>
      ) : profileQuery.isError || !profile ? (
        <div className="text-center py-12 text-red-500 dark:text-red-400">
          Failed to load user profile.
        </div>
      ) : (
        <div className="space-y-4">
          <UserDetailHeader
            profile={profile}
            onReactivate={() => mutations.reactivateAttendee.mutate()}
            isReactivating={mutations.reactivateAttendee.isPending}
          />

          <DetailTabs
            active={detailTab}
            registrationCount={profile.registrations.length}
            onChange={setDetailTab}
          />

          {detailTab === 'profile' && (
            <div className="space-y-4">
              {!hasPortal ? (
                <NoPortalAccountNotice
                  profile={profile}
                  onCreate={() => mutations.createPortalAccount.mutate()}
                  isCreating={mutations.createPortalAccount.isPending}
                />
              ) : editableQuery.isLoading || !formData ? (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                  Loading profile form...
                </div>
              ) : (
                <>
                  <div className={sectionCls}>
                    <div className="px-6 py-6 space-y-6">
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

                      <ProfileFormFields formData={formData} updateField={updateField} />

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={handleSaveProfile}
                          disabled={mutations.saveProfile.isPending}
                          className="px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40 transition-colors"
                        >
                          {mutations.saveProfile.isPending ? 'Saving...' : 'Save Profile'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <PortalAccountSection
                    portalAccount={profile.portal_account}
                    portalUserId={currentUser.portal_user_id!}
                    onToggleAccess={() =>
                      mutations.toggleAccess.mutate(currentUser.portal_user_id!)
                    }
                    onResendInvite={() =>
                      mutations.resendInvite.mutate(currentUser.portal_user_id!)
                    }
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
                </>
              )}

              <ActivityHistory history={profile.history} />
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
