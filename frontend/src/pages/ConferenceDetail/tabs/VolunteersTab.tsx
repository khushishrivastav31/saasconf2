import { useState } from 'react';
import { useSaveStatus } from '../../../hooks/useSaveStatus';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { queryKeys } from '../../../config/queryKeys';
import { validatePhone, validateEmail } from '../../../utils/validators';
import type {
  Conference,
  Volunteer,
  VolunteerCreate,
  VolunteerUpdate,
  VolunteerStatus,
  PaginatedResponse,
} from '../../../types';
import { parseApiError } from '../../../utils/apiError';
import Modal from '../../../components/Modal';
import ConfirmDialog from '../../../components/ConfirmDialog';
import RichTextEditor from '../../../components/common/RichTextEditor';
import AttachmentList from '../../../components/AttachmentList';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import { EditIcon, DeleteIcon } from '../icons';

function ConferenceVolunteersTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createPhoneError, setCreatePhoneError] = useState<string | null>(null);
  const [createEmailError, setCreateEmailError] = useState<string | null>(null);
  const [editPhoneError, setEditPhoneError] = useState<string | null>(null);
  const [editEmailError, setEditEmailError] = useState<string | null>(null);
  const [editEmergencyPhoneError, setEditEmergencyPhoneError] = useState<string | null>(null);
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null);
  const [deleteVolunteerTarget, setDeleteVolunteerTarget] = useState<Volunteer | null>(null);
  const [editForm, setEditForm] = useState<VolunteerUpdate>({});
  const [createForm, setCreateForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    tshirt_size: '',
    notes: '',
  });
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();

  // Fetch linked volunteers
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.volunteers.byConference(conference.id),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Volunteer>>(
        `/conferences/${conference.id}/volunteers`
      );
      return response.data;
    },
  });

  // Fetch all tenant volunteers for linking
  const { data: allVolunteers } = useQuery({
    queryKey: queryKeys.volunteers.allList,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Volunteer>>(`/volunteers?page_size=100`);
      return response.data;
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (volunteerId: string) => {
      await api.post(`/conferences/${conference.id}/volunteers`, {
        id: volunteerId,
      });
    },
    onSuccess: () => {
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: queryKeys.volunteers.byConference(conference.id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.allList });
    },
    onError: (error: unknown) => {
      setLinkError(parseApiError(error, 'Failed to link volunteer'));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: VolunteerCreate) => {
      await api.post('/volunteers', data);
    },
    onSuccess: () => {
      setLinkError(null);
      setShowCreateForm(false);
      setCreatePhoneError(null);
      setCreateEmailError(null);
      setCreateForm({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        tshirt_size: '',
        notes: '',
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.volunteers.byConference(conference.id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.allList });
    },
    onError: (error: unknown) => {
      setLinkError(parseApiError(error, 'Failed to create volunteer'));
    },
  });

  const volunteerUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: VolunteerUpdate }) => {
      await api.put(`/volunteers/${id}`, data);
    },
    onSuccess: () => {
      setSaved();
      setEditingVolunteer(null);
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: queryKeys.volunteers.byConference(conference.id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.allList });
    },
    onError: (error: unknown) => {
      setSaveError();
      setLinkError(parseApiError(error, 'Failed to update volunteer'));
    },
  });

  const volunteerDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/volunteers/${id}?conference_id=${conference.id}`);
    },
    onSuccess: () => {
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: queryKeys.volunteers.byConference(conference.id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.allList });
    },
    onError: (error: unknown) => {
      setLinkError(parseApiError(error, 'Failed to remove volunteer'));
    },
  });

  const openEditVolunteer = (volunteer: Volunteer) => {
    setEditingVolunteer(volunteer);
    setEditPhoneError(null);
    setEditEmailError(null);
    setEditEmergencyPhoneError(null);
    setEditForm({
      first_name: volunteer.first_name,
      last_name: volunteer.last_name,
      email: volunteer.email,
      phone: volunteer.phone || '',
      status: volunteer.status,
      tshirt_size: volunteer.tshirt_size || '',
      notes: volunteer.notes || '',
      emergency_contact_name: volunteer.emergency_contact_name || '',
      emergency_contact_phone: volunteer.emergency_contact_phone || '',
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVolunteer) return;
    if (editPhoneError || editEmailError || editEmergencyPhoneError) return;
    setSaving();
    volunteerUpdateMutation.mutate({ id: editingVolunteer.id, data: editForm });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createPhoneError || createEmailError) return;
    createMutation.mutate({
      ...createForm,
      conference_id: conference.id,
    });
  };

  const linkedIds = new Set(data?.items?.map((v) => v.id) || []);
  const unlinkableVolunteers = allVolunteers?.items?.filter((v) => !linkedIds.has(v.id)) || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Linked Volunteers ({data?.total || 0})
        </h4>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {unlinkableVolunteers.length > 0 && (
              <select
                className="border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    linkMutation.mutate(e.target.value);
                    e.target.value = '';
                  }
                }}
              >
                <option value="">Link existing...</option>
                {unlinkableVolunteers.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.full_name} ({v.email})
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
            >
              {showCreateForm ? 'Cancel' : 'Create New'}
            </button>
          </div>
        )}
      </div>

      <ErrorBanner message={linkError} />

      {showCreateForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                First Name *
              </label>
              <input
                type="text"
                required
                value={createForm.first_name}
                onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Last Name *
              </label>
              <input
                type="text"
                required
                value={createForm.last_name}
                onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Email *
              </label>
              <input
                type="email"
                required
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                onBlur={(e) => setCreateEmailError(validateEmail(e.target.value))}
                className={`mt-1 block w-full border rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${createEmailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
              />
              {createEmailError && <p className="mt-1 text-xs text-red-600">{createEmailError}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Phone
              </label>
              <input
                type="tel"
                value={createForm.phone}
                onChange={(e) => {
                  const value = e.target.value;
                  setCreateForm({ ...createForm, phone: value });
                  setCreatePhoneError(validatePhone(value));
                }}
                className={`mt-1 block w-full border rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${createPhoneError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
                placeholder="+491234545 or 00491234566"
              />
              {createPhoneError && <p className="mt-1 text-xs text-red-600">{createPhoneError}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                T-Shirt Size
              </label>
              <select
                value={createForm.tshirt_size}
                onChange={(e) => setCreateForm({ ...createForm, tshirt_size: e.target.value })}
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select size</option>
                {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div></div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Comments
            </label>
            <RichTextEditor
              value={createForm.notes}
              onChange={(html) => setCreateForm({ ...createForm, notes: html })}
              placeholder="Any notes or comments about this volunteer..."
              rows={2}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createMutation.isPending || !!createPhoneError || !!createEmailError}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Volunteer'}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        </div>
      ) : data?.items && data.items.length > 0 ? (
        <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </th>
                {isAdmin && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {data.items.map((volunteer) => (
                <tr key={volunteer.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {volunteer.full_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {volunteer.email}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        volunteer.status === 'active'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : volunteer.status === 'approved'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : volunteer.status === 'pending'
                              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {volunteer.status}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditVolunteer(volunteer)}
                          className="text-gray-400 dark:text-gray-500 hover:text-primary-600 p-1 rounded transition-colors"
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={() => setDeleteVolunteerTarget(volunteer)}
                          disabled={volunteerDeleteMutation.isPending}
                          className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          No volunteers linked to this conference yet.
        </div>
      )}

      {/* Edit Volunteer Modal */}
      <Modal
        open={!!editingVolunteer}
        onClose={() => setEditingVolunteer(null)}
        title="Edit Volunteer"
      >
        {editingVolunteer && (
          <form onSubmit={handleEditSubmit}>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    First Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.first_name || ''}
                    onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Last Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.last_name || ''}
                    onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={editForm.email || ''}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    onBlur={(e) => setEditEmailError(validateEmail(e.target.value))}
                    className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${editEmailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
                  />
                  {editEmailError && <p className="mt-1 text-xs text-red-600">{editEmailError}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={editForm.phone || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditForm({ ...editForm, phone: value });
                      setEditPhoneError(validatePhone(value));
                    }}
                    className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${editPhoneError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
                    placeholder="+491234545 or 00491234566"
                  />
                  {editPhoneError && <p className="mt-1 text-xs text-red-600">{editPhoneError}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Status
                  </label>
                  <select
                    value={editForm.status || 'pending'}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        status: e.target.value as VolunteerStatus,
                      })
                    }
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  >
                    {(['pending', 'approved', 'active', 'inactive', 'rejected'] as const).map(
                      (s) => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    T-Shirt Size
                  </label>
                  <select
                    value={editForm.tshirt_size || ''}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        tshirt_size: e.target.value,
                      })
                    }
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Select size</option>
                    {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Notes
                </label>
                <RichTextEditor
                  value={editForm.notes || ''}
                  onChange={(html) => setEditForm({ ...editForm, notes: html })}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Emergency Contact Name
                  </label>
                  <input
                    type="text"
                    value={editForm.emergency_contact_name || ''}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        emergency_contact_name: e.target.value,
                      })
                    }
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Emergency Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={editForm.emergency_contact_phone || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditForm({
                        ...editForm,
                        emergency_contact_phone: value,
                      });
                      setEditEmergencyPhoneError(validatePhone(value));
                    }}
                    className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${editEmergencyPhoneError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
                    placeholder="+491234545 or 00491234566"
                  />
                  {editEmergencyPhoneError && (
                    <p className="mt-1 text-xs text-red-600">{editEmergencyPhoneError}</p>
                  )}
                </div>
              </div>

              <AttachmentList entityType="volunteer" entityId={editingVolunteer.id} />
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingVolunteer(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  volunteerUpdateMutation.isPending ||
                  !!editPhoneError ||
                  !!editEmailError ||
                  !!editEmergencyPhoneError
                }
                className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md disabled:opacity-50 transition-colors duration-200 ${
                  saveStatus === 'saved'
                    ? 'bg-green-600'
                    : saveStatus === 'error'
                      ? 'bg-red-600'
                      : 'bg-primary-600 hover:bg-primary-700'
                }`}
              >
                {saveStatus === 'saving' ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline"
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
                    Saving...
                  </>
                ) : saveStatus === 'saved' ? (
                  <>
                    <svg
                      className="-ml-1 mr-2 h-4 w-4 text-white inline"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Saved!
                  </>
                ) : saveStatus === 'error' ? (
                  'Error'
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteVolunteerTarget}
        title="Remove Volunteer"
        message={`Are you sure you want to remove "${deleteVolunteerTarget?.full_name}" from this conference? If they are linked to other conferences, they will only be unlinked from this one.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (deleteVolunteerTarget) volunteerDeleteMutation.mutate(deleteVolunteerTarget.id);
          setDeleteVolunteerTarget(null);
        }}
        onCancel={() => setDeleteVolunteerTarget(null)}
      />
    </div>
  );
}

export default ConferenceVolunteersTab;
