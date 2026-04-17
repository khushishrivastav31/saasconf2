import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useToast } from '../../../../components/Toast';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import { COUNTRIES_BY_CONTINENT } from '../../../../config/countries';
import MergeDialog from './MergeDialog';
import type { PortalUser, UserProfile, EditableProfile, DetailTab } from './types';
import {
  STATUS_COLORS,
  EVENT_LABELS,
  EVENT_COLORS,
  REG_STATUS_COLORS,
  formatDate,
  formatDateTime,
  formatCurrency,
} from './constants';

export default function UserDetailPanel({
  selectedUser,
  items,
  onBack,
}: {
  selectedUser: PortalUser;
  items: PortalUser[];
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [detailTab, setDetailTab] = useState<DetailTab>('profile');
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<PortalUser>(selectedUser);
  const pictureInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const toggleAccessMutation = useMutation({
    mutationFn: (portalUserId: string) => api.put(`/trainings/users/${portalUserId}/toggle-access`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['training-users'] });
      queryClient.invalidateQueries({ queryKey: ['training-user-profile'] });
      showToast(res.data.message, 'success');
    },
    onError: () => showToast('Failed to update access', 'error'),
  });

  const resendInviteMutation = useMutation({
    mutationFn: (portalUserId: string) =>
      api.post(`/trainings/users/${portalUserId}/resend-invite`),
    onSuccess: () => showToast('Invite email sent', 'success'),
    onError: () => showToast('Failed to send invite', 'error'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (portalUserId: string) =>
      api.post(`/trainings/users/${portalUserId}/reset-password`),
    onSuccess: () => showToast('Password reset email sent', 'success'),
    onError: () => showToast('Failed to send reset email', 'error'),
  });

  const impersonateMutation = useMutation({
    mutationFn: (portalUserId: string) => api.post(`/trainings/users/${portalUserId}/impersonate`),
    onSuccess: (res) => {
      const { access_token, portal_user_name } = res.data;
      localStorage.setItem('portal_access_token', access_token);
      const tenantSlug = window.location.pathname.split('/')[2] || '';
      window.open(`/${tenantSlug}/trainings/portal/dashboard`, '_blank');
      showToast(`Viewing portal as ${portal_user_name}`, 'info');
    },
    onError: () => showToast('Failed to impersonate user', 'error'),
  });

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useQuery({
    queryKey: ['training-user-profile', currentUser.id],
    queryFn: async () => {
      const res = await api.get(`/trainings/attendees/${currentUser.id}/profile`);
      return res.data as UserProfile;
    },
    staleTime: 30_000,
  });

  const { data: editableProfile, isLoading: editableLoading } = useQuery({
    queryKey: ['training-user-editable', currentUser.portal_user_id],
    queryFn: async () => {
      const res = await api.get(`/trainings/users/${currentUser.portal_user_id}`);
      return res.data as EditableProfile;
    },
    enabled: !!currentUser.portal_user_id,
    staleTime: 30_000,
  });

  const [formData, setFormData] = useState<EditableProfile | null>(null);

  const prevEditableRef = useRef<EditableProfile | null>(null);
  if (editableProfile && editableProfile !== prevEditableRef.current) {
    prevEditableRef.current = editableProfile;
    setFormData({ ...editableProfile });
  }

  const updateField = useCallback(
    <K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) => {
      setFormData((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    []
  );

  const saveProfileMutation = useMutation({
    mutationFn: async (data: Partial<EditableProfile>) => {
      const res = await api.put(`/trainings/users/${currentUser.portal_user_id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-user-editable'] });
      queryClient.invalidateQueries({ queryKey: ['training-user-profile'] });
      queryClient.invalidateQueries({ queryKey: ['training-users'] });
      showToast('Profile saved', 'success');
    },
    onError: () => showToast('Failed to save profile', 'error'),
  });

  const uploadPictureMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`/trainings/users/${currentUser.portal_user_id}/picture`, fd);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-user-editable'] });
      showToast('Picture uploaded', 'success');
    },
    onError: () => showToast('Failed to upload picture', 'error'),
  });

  const deletePictureMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/trainings/users/${currentUser.portal_user_id}/picture`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-user-editable'] });
      setFormData((prev) => (prev ? { ...prev, picture_url: null } : prev));
      showToast('Picture removed', 'success');
    },
    onError: () => showToast('Failed to remove picture', 'error'),
  });

  const uploadVideoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`/trainings/users/${currentUser.portal_user_id}/video`, fd);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-user-editable'] });
      showToast('Video uploaded', 'success');
    },
    onError: () => showToast('Failed to upload video', 'error'),
  });

  const deleteVideoMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/trainings/users/${currentUser.portal_user_id}/video`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-user-editable'] });
      setFormData((prev) => (prev ? { ...prev, video_url: null } : prev));
      showToast('Video removed', 'success');
    },
    onError: () => showToast('Failed to remove video', 'error'),
  });

  const handleSaveProfile = useCallback(() => {
    if (!formData) return;
    const { picture_url: _p, video_url: _v, ...payload } = formData;
    saveProfileMutation.mutate(payload);
  }, [formData, saveProfileMutation]);

  const sectionCls =
    'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm';
  const sectionHeadingCls =
    'text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide';
  const labelCls = 'text-xs font-medium text-gray-500 dark:text-gray-400';
  const valueCls = 'text-sm text-gray-900 dark:text-gray-100';
  const actionBtnCls =
    'px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40';
  const fieldInputCls =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500';
  const fieldLabelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  const hasPortal = !!currentUser.portal_user_id;
  const tabCls = (tab: DetailTab) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      detailTab === tab
        ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
    }`;

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

      {profileLoading ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">Loading profile...</div>
      ) : profileError || !profile ? (
        <div className="text-center py-12 text-red-500 dark:text-red-400">
          Failed to load user profile.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header */}
          <div className={sectionCls}>
            <div className="px-6 py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-lg">
                  {profile.first_name.charAt(0)}
                  {profile.last_name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {profile.first_name} {profile.last_name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email}</p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <span
                    className={`inline-flex px-2.5 py-1 rounded text-xs font-semibold ${STATUS_COLORS[profile.status] ?? ''}`}
                  >
                    {profile.status === 'parked' ? 'Parked' : 'Active'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              type="button"
              className={tabCls('profile')}
              onClick={() => setDetailTab('profile')}
            >
              Profile
            </button>
            <button
              type="button"
              className={tabCls('registrations')}
              onClick={() => setDetailTab('registrations')}
            >
              Registrations
              {profile.registrations.length > 0 && (
                <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">
                  ({profile.registrations.length})
                </span>
              )}
            </button>
          </div>

          {/* Profile Tab */}
          {detailTab === 'profile' && (
            <div className="space-y-4">
              {!hasPortal ? (
                <div className={sectionCls}>
                  <div className="px-6 py-5">
                    <div className="flex items-center gap-3 mb-4 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <span className="text-amber-600 dark:text-amber-400 text-sm">
                        No portal account yet. Create one to enable profile editing and portal
                        access.
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await api.post(
                              `/trainings/users/create-for-attendee/${currentUser.id}`
                            );
                            showToast('Portal account created', 'success');
                            queryClient.invalidateQueries({
                              queryKey: ['training-user-profile'],
                            });
                            queryClient.invalidateQueries({ queryKey: ['training-users'] });
                            setCurrentUser({
                              ...currentUser,
                              portal_user_id: res.data.portal_user_id,
                            });
                          } catch {
                            showToast('Failed to create portal account', 'error');
                          }
                        }}
                        className="shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
                      >
                        Create Portal Account
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className={labelCls}>First Name</p>
                        <p className={`${valueCls} mt-0.5`}>{profile.first_name}</p>
                      </div>
                      <div>
                        <p className={labelCls}>Last Name</p>
                        <p className={`${valueCls} mt-0.5`}>{profile.last_name}</p>
                      </div>
                      <div>
                        <p className={labelCls}>Email</p>
                        <p className={`${valueCls} mt-0.5`}>{profile.email}</p>
                      </div>
                      <div>
                        <p className={labelCls}>Status</p>
                        <p className={`${valueCls} mt-0.5`}>{profile.status}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : editableLoading || !formData ? (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                  Loading profile form...
                </div>
              ) : (
                <>
                  {/* Editable Profile Form */}
                  <div className={sectionCls}>
                    <div className="px-6 py-6 space-y-6">
                      {/* Picture Upload */}
                      <div>
                        <label className={fieldLabelCls}>Profile Picture</label>
                        <div className="flex items-center gap-4 mt-1">
                          {formData.picture_url ? (
                            <img
                              src={formData.picture_url}
                              alt="Profile"
                              className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                            />
                          ) : (
                            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-500 text-2xl font-semibold">
                              {formData.first_name.charAt(0)}
                              {formData.last_name.charAt(0)}
                            </div>
                          )}
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => pictureInputRef.current?.click()}
                                disabled={uploadPictureMutation.isPending}
                                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-40"
                              >
                                {uploadPictureMutation.isPending ? 'Uploading...' : 'Choose file'}
                              </button>
                              {formData.picture_url && (
                                <button
                                  type="button"
                                  onClick={() => deletePictureMutation.mutate()}
                                  disabled={deletePictureMutation.isPending}
                                  className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-40"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              JPEG, PNG, WebP. Min 600x600px
                            </p>
                          </div>
                          <input
                            ref={pictureInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadPictureMutation.mutate(file);
                              e.target.value = '';
                            }}
                          />
                        </div>
                      </div>

                      {/* Video Upload */}
                      <div>
                        <label className={fieldLabelCls}>Profile Video</label>
                        <div className="flex items-center gap-4 mt-1">
                          {formData.video_url ? (
                            <video
                              src={formData.video_url}
                              className="w-32 h-20 rounded-md object-cover border border-gray-200 dark:border-gray-600 bg-black"
                              controls={false}
                            />
                          ) : (
                            <div className="w-32 h-20 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                              <svg
                                className="w-8 h-8 text-gray-400 dark:text-gray-500"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.5}
                                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                            </div>
                          )}
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => videoInputRef.current?.click()}
                                disabled={uploadVideoMutation.isPending}
                                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-40"
                              >
                                {uploadVideoMutation.isPending ? 'Uploading...' : 'Choose file'}
                              </button>
                              {formData.video_url && (
                                <button
                                  type="button"
                                  onClick={() => deleteVideoMutation.mutate()}
                                  disabled={deleteVideoMutation.isPending}
                                  className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-40"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              MP4, MOV, WebM, AVI, or MKV. Max 5MB.
                            </p>
                          </div>
                          <input
                            ref={videoInputRef}
                            type="file"
                            accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadVideoMutation.mutate(file);
                              e.target.value = '';
                            }}
                          />
                        </div>
                      </div>

                      {/* Form Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className={fieldLabelCls}>
                            First Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={formData.first_name}
                            onChange={(e) => updateField('first_name', e.target.value)}
                            className={fieldInputCls}
                            required
                          />
                        </div>
                        <div>
                          <label className={fieldLabelCls}>
                            Last Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={formData.last_name}
                            onChange={(e) => updateField('last_name', e.target.value)}
                            className={fieldInputCls}
                            required
                          />
                        </div>
                        <div>
                          <label className={fieldLabelCls}>Pronouns</label>
                          <select
                            value={formData.pronouns}
                            onChange={(e) => updateField('pronouns', e.target.value)}
                            className={fieldInputCls}
                          >
                            <option value="">— Select —</option>
                            <option value="He/Him">He/Him</option>
                            <option value="She/Her">She/Her</option>
                            <option value="They/Them">They/Them</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className={fieldLabelCls}>
                            Email <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => updateField('email', e.target.value)}
                            className={fieldInputCls}
                            required
                          />
                        </div>
                        <div>
                          <label className={fieldLabelCls}>Phone</label>
                          <input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => updateField('phone', e.target.value)}
                            className={fieldInputCls}
                          />
                        </div>
                        <div>
                          <label className={fieldLabelCls}>Title</label>
                          <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => updateField('title', e.target.value)}
                            className={fieldInputCls}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={fieldLabelCls}>Company</label>
                        <input
                          type="text"
                          value={formData.company}
                          onChange={(e) => updateField('company', e.target.value)}
                          className={fieldInputCls}
                        />
                      </div>

                      <div>
                        <label className={fieldLabelCls}>Bio</label>
                        <RichTextEditor
                          value={formData.bio}
                          onChange={(html) => updateField('bio', html)}
                          placeholder="Write a short bio..."
                          rows={4}
                          maxRows={10}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className={fieldLabelCls}>Address Line 1</label>
                          <input
                            type="text"
                            value={formData.address_line1}
                            onChange={(e) => updateField('address_line1', e.target.value)}
                            className={fieldInputCls}
                          />
                        </div>
                        <div>
                          <label className={fieldLabelCls}>Address Line 2</label>
                          <input
                            type="text"
                            value={formData.address_line2}
                            onChange={(e) => updateField('address_line2', e.target.value)}
                            className={fieldInputCls}
                          />
                        </div>
                        <div>
                          <label className={fieldLabelCls}>City</label>
                          <input
                            type="text"
                            value={formData.city}
                            onChange={(e) => updateField('city', e.target.value)}
                            className={fieldInputCls}
                          />
                        </div>
                        <div>
                          <label className={fieldLabelCls}>Postal Code</label>
                          <input
                            type="text"
                            value={formData.postal_code}
                            onChange={(e) => updateField('postal_code', e.target.value)}
                            className={fieldInputCls}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={fieldLabelCls}>Country</label>
                        <select
                          value={formData.country}
                          onChange={(e) => updateField('country', e.target.value)}
                          className={fieldInputCls}
                        >
                          <option value="">— Select country —</option>
                          {COUNTRIES_BY_CONTINENT.map((group) => (
                            <optgroup key={group.continent} label={group.continent}>
                              {group.countries.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={handleSaveProfile}
                          disabled={saveProfileMutation.isPending}
                          className="px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40 transition-colors"
                        >
                          {saveProfileMutation.isPending ? 'Saving...' : 'Save Profile'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Portal Account Section */}
                  <div className={sectionCls}>
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                      <h4 className={sectionHeadingCls}>Portal Account</h4>
                    </div>
                    {profile.portal_account ? (
                      <>
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                            <div>
                              <p className={labelCls}>Status</p>
                              <p className="mt-0.5">
                                {profile.portal_account.is_active ? (
                                  <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                    Active
                                  </span>
                                ) : (
                                  <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                                    Inactive
                                  </span>
                                )}
                              </p>
                            </div>
                            <div>
                              <p className={labelCls}>Password</p>
                              <p className={`${valueCls} mt-0.5`}>
                                {profile.portal_account.has_password ? 'Set' : 'Not set'}
                              </p>
                            </div>
                            <div>
                              <p className={labelCls}>Email Verified</p>
                              <p className={`${valueCls} mt-0.5`}>
                                {profile.portal_account.email_verified ? 'Yes' : 'No'}
                              </p>
                            </div>
                            <div>
                              <p className={labelCls}>Last Login</p>
                              <p className={`${valueCls} mt-0.5`}>
                                {formatDateTime(profile.portal_account.last_login_at)}
                              </p>
                            </div>
                            <div>
                              <p className={labelCls}>Created</p>
                              <p className={`${valueCls} mt-0.5`}>
                                {formatDateTime(profile.portal_account.created_at)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="px-6 py-4 flex flex-wrap gap-2">
                          <button
                            onClick={() => toggleAccessMutation.mutate(profile.portal_user_id!)}
                            disabled={toggleAccessMutation.isPending}
                            className={actionBtnCls}
                          >
                            {toggleAccessMutation.isPending ? '...' : 'Toggle Access'}
                          </button>
                          <button
                            onClick={() => resendInviteMutation.mutate(profile.portal_user_id!)}
                            disabled={resendInviteMutation.isPending}
                            className={actionBtnCls}
                          >
                            {resendInviteMutation.isPending ? '...' : 'Resend Invite'}
                          </button>
                          <button
                            onClick={() => resetPasswordMutation.mutate(profile.portal_user_id!)}
                            disabled={resetPasswordMutation.isPending}
                            className={actionBtnCls}
                          >
                            {resetPasswordMutation.isPending ? '...' : 'Reset Password'}
                          </button>
                          <button
                            onClick={() => impersonateMutation.mutate(profile.portal_user_id!)}
                            disabled={impersonateMutation.isPending}
                            className="px-3 py-1.5 text-xs font-medium border border-primary-300 dark:border-primary-700 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/20 text-primary-700 dark:text-primary-300 disabled:opacity-40"
                          >
                            {impersonateMutation.isPending ? '...' : 'Impersonate'}
                          </button>
                          <button
                            onClick={() => setMergeTarget(profile.portal_user_id)}
                            className="px-3 py-1.5 text-xs font-medium border border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                          >
                            Merge with...
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="px-6 py-5">
                        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                          No portal account linked.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Registrations Tab */}
          {detailTab === 'registrations' && (
            <div className="space-y-4">
              <div className={sectionCls}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h4 className={sectionHeadingCls}>
                    Registrations
                    {profile.registrations.length > 0 && (
                      <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                        ({profile.registrations.length})
                      </span>
                    )}
                  </h4>
                </div>
                {profile.registrations.length === 0 ? (
                  <div className="px-6 py-5">
                    <p className="text-sm text-gray-400 dark:text-gray-500">No registrations.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {[...profile.registrations]
                      .sort((a, b) => {
                        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
                        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
                        return db - da;
                      })
                      .map((reg) => (
                        <div key={reg.registration_id} className="px-6 py-4">
                          <div className="flex items-center gap-3 mb-3">
                            <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {reg.training_name}
                            </h5>
                            {reg.training_date && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {formatDate(reg.training_date)}
                              </span>
                            )}
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${REG_STATUS_COLORS[reg.status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
                            >
                              {reg.status.charAt(0).toUpperCase() + reg.status.slice(1)}
                            </span>
                            {reg.location_name && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {reg.location_name}
                                {reg.location_city ? `, ${reg.location_city}` : ''}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                            <div className="space-y-2">
                              {(reg.contact_first_name || reg.contact_last_name) && (
                                <div>
                                  <span className={labelCls}>Contact: </span>
                                  <span className="text-gray-900 dark:text-gray-100">
                                    {[reg.contact_first_name, reg.contact_last_name]
                                      .filter(Boolean)
                                      .join(' ')}
                                  </span>
                                </div>
                              )}
                              {reg.contact_email && (
                                <div>
                                  <span className={labelCls}>Email: </span>
                                  <span className="text-gray-900 dark:text-gray-100">
                                    {reg.contact_email}
                                  </span>
                                </div>
                              )}
                              {reg.contact_phone && (
                                <div>
                                  <span className={labelCls}>Phone: </span>
                                  <span className="text-gray-900 dark:text-gray-100">
                                    {reg.contact_phone}
                                  </span>
                                </div>
                              )}
                              {reg.company_name && (
                                <div>
                                  <span className={labelCls}>Company: </span>
                                  <span className="text-gray-900 dark:text-gray-100">
                                    {reg.company_name}
                                  </span>
                                </div>
                              )}
                              {(reg.street || reg.city) && (
                                <div>
                                  <span className={labelCls}>Address: </span>
                                  <span className="text-gray-900 dark:text-gray-100">
                                    {[
                                      reg.street,
                                      [reg.postal_code, reg.city].filter(Boolean).join(' '),
                                      reg.country,
                                    ]
                                      .filter(Boolean)
                                      .join(', ')}
                                  </span>
                                </div>
                              )}
                              {reg.vat_number && (
                                <div>
                                  <span className={labelCls}>VAT: </span>
                                  <span className="text-gray-900 dark:text-gray-100">
                                    {reg.vat_number}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              {reg.payment_method && (
                                <div>
                                  <span className={labelCls}>Payment: </span>
                                  <span className="text-gray-900 dark:text-gray-100">
                                    {reg.payment_method}
                                  </span>
                                </div>
                              )}
                              {reg.po_number && (
                                <div>
                                  <span className={labelCls}>PO Number: </span>
                                  <span className="text-gray-900 dark:text-gray-100">
                                    {reg.po_number}
                                  </span>
                                </div>
                              )}
                              {reg.discount_code && (
                                <div>
                                  <span className={labelCls}>Discount: </span>
                                  <span className="text-gray-900 dark:text-gray-100">
                                    {reg.discount_code}
                                  </span>
                                </div>
                              )}
                              {reg.total && (
                                <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
                                  <div className="flex justify-between">
                                    <span className={labelCls}>Subtotal</span>
                                    <span className="text-gray-900 dark:text-gray-100">
                                      {formatCurrency(reg.subtotal, reg.currency)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className={labelCls}>Tax</span>
                                    <span className="text-gray-900 dark:text-gray-100">
                                      {formatCurrency(reg.vat_amount, reg.currency)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between font-medium">
                                    <span className={labelCls}>Total</span>
                                    <span className="text-gray-900 dark:text-gray-100">
                                      {formatCurrency(reg.total, reg.currency)}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {reg.exam_mode && (
                            <div className="mt-3 flex flex-wrap gap-4 text-sm">
                              <div>
                                <span className={labelCls}>Exam: </span>
                                <span className="text-gray-900 dark:text-gray-100">
                                  {reg.exam_mode}
                                </span>
                              </div>
                              {reg.exam_language && (
                                <div>
                                  <span className={labelCls}>Language: </span>
                                  <span className="text-gray-900 dark:text-gray-100">
                                    {reg.exam_language}
                                  </span>
                                </div>
                              )}
                              {reg.extra_time && (
                                <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                  Extra Time
                                </span>
                              )}
                            </div>
                          )}

                          {reg.notes && (
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                              {reg.notes}
                            </p>
                          )}

                          {reg.created_at && (
                            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                              Registered {formatDate(reg.created_at)}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Offer Links */}
              {profile.offer_links.length > 0 && (
                <div className={sectionCls}>
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h4 className={sectionHeadingCls}>
                      Offer Links
                      <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                        ({profile.offer_links.length})
                      </span>
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                            Offer #
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                            Training
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                            Exam Mode
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                            Language
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                            Extra Time
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                            Certification
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {profile.offer_links.map((offer) => (
                          <tr key={offer.offer_number}>
                            <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">
                              {offer.offer_number}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {offer.training_name}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {offer.exam_mode ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {offer.exam_language ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {offer.extra_time ? 'Yes' : 'No'}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {offer.certification ? 'Yes' : 'No'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Activity History */}
              <div className={sectionCls}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h4 className={sectionHeadingCls}>Activity History</h4>
                </div>
                <div className="px-6 py-5">
                  {profile.history.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500">No history events.</p>
                  ) : (
                    <div className="relative pl-6 space-y-4">
                      <div className="absolute left-2 top-1 bottom-1 w-px bg-gray-200 dark:bg-gray-700" />
                      {profile.history.map((event) => (
                        <div key={event.id} className="relative">
                          <div
                            className={`absolute -left-4 top-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 ${
                              event.event_type === 'parked'
                                ? 'bg-amber-400'
                                : event.event_type === 'cancelled'
                                  ? 'bg-red-400'
                                  : 'bg-green-400'
                            }`}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm font-medium ${EVENT_COLORS[event.event_type] ?? 'text-gray-600 dark:text-gray-400'}`}
                              >
                                {EVENT_LABELS[event.event_type] ?? event.event_type}
                              </span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {formatDate(event.created_at)}
                              </span>
                            </div>
                            {event.training_name && event.training_name !== '—' && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                {event.training_name}
                              </p>
                            )}
                            {event.notes && (
                              <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5 italic">
                                {event.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
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
