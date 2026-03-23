import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useSaveStatus } from '../../../hooks/useSaveStatus';
import type { Training } from '../../../types/training';
import type { TeamMember } from '../../../types/conference';
import { validateEmail, validatePhone } from '../../../utils/validators';
import { parseApiError } from '../../../utils/apiError';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import ConfirmDialog from '../../../components/ConfirmDialog';

function EditIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

interface Props {
  training?: Training;
  onUpdate?: () => void;
}

export default function TrainingTeamTab({ training, onUpdate }: Props) {
  const queryClient = useQueryClient();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(training?.team_members || []);
  const [newMember, setNewMember] = useState<TeamMember>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: '',
    is_manager: false,
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TeamMember>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: '',
    is_manager: false,
  });
  const [editPhoneError, setEditPhoneError] = useState<string | null>(null);
  const [editEmailError, setEditEmailError] = useState<string | null>(null);
  const [newPhoneError, setNewPhoneError] = useState<string | null>(null);
  const [newEmailError, setNewEmailError] = useState<string | null>(null);
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();
  const [userError, setUserError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ index: number; member: TeamMember } | null>(
    null
  );

  useEffect(() => {
    setTeamMembers(training?.team_members || []);
  }, [training?.team_members]);

  const updateMutation = useMutation({
    mutationFn: async (members: TeamMember[]) => {
      const response = await api.put<Training>(`/trainings/${training!.id}`, {
        team_members: members,
      });
      return response.data;
    },
    onMutate: () => setSaving(),
    onSuccess: (updatedTraining) => {
      setSaved();
      setTeamMembers(updatedTraining.team_members || []);
      queryClient.setQueryData(['training', training!.id], updatedTraining);
      queryClient.invalidateQueries({ queryKey: ['trainings'] });
      onUpdate?.();
    },
    onError: (error) => {
      setSaveError();
      setUserError(parseApiError(error));
    },
  });

  if (!training) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select a training first to manage its team.
        </p>
      </div>
    );
  }

  const addMember = () => {
    if (!newMember.first_name.trim() || !newMember.last_name.trim()) return;
    setUserError(null);
    const memberToAdd: TeamMember = {
      first_name: newMember.first_name.trim(),
      last_name: newMember.last_name.trim(),
      email: newMember.email?.trim() || '',
      phone: newMember.phone?.trim() || '',
      role: newMember.role?.trim() || '',
      is_manager: newMember.is_manager,
    };
    const newMembers = [...teamMembers, memberToAdd];
    setTeamMembers(newMembers);
    setNewMember({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      role: '',
      is_manager: false,
    });
    setNewPhoneError(null);
    setNewEmailError(null);
    updateMutation.mutate(newMembers);
  };

  const confirmRemoveMember = () => {
    if (removeTarget === null) return;
    const newMembers = teamMembers.filter((_, i) => i !== removeTarget.index);
    setTeamMembers(newMembers);
    updateMutation.mutate(newMembers);
    setRemoveTarget(null);
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditForm({ ...teamMembers[index] });
    setEditPhoneError(null);
    setEditEmailError(null);
    setUserError(null);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditPhoneError(null);
    setEditEmailError(null);
    setUserError(null);
  };

  const saveEdit = () => {
    if (editingIndex === null || !editForm.first_name.trim() || !editForm.last_name.trim()) return;
    setUserError(null);
    const updatedMember: TeamMember = {
      first_name: editForm.first_name.trim(),
      last_name: editForm.last_name.trim(),
      email: editForm.email?.trim() || '',
      phone: editForm.phone?.trim() || '',
      role: editForm.role?.trim() || '',
      is_manager: editForm.is_manager,
    };
    const newMembers = [...teamMembers];
    newMembers[editingIndex] = updatedMember;
    setTeamMembers(newMembers);
    setEditingIndex(null);
    updateMutation.mutate(newMembers);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Training Team — {training.name}
          </h4>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Team members for this training. For login access, add users in the Team page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-md">
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
          )}
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-md">
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
          )}
          {saveStatus === 'error' && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded-md">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Save failed
            </span>
          )}
        </div>
      </div>

      {/* Existing Team Members */}
      {teamMembers.length > 0 && (
        <div className="mb-4 space-y-2">
          {teamMembers.map((member, index) =>
            editingIndex === index ? (
              <div
                key={index}
                className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
              >
                <h5 className="text-sm font-medium text-blue-900 mb-3">Edit Team Member</h5>
                <ErrorBanner message={userError} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm"
                      value={editForm.first_name}
                      onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm"
                      value={editForm.last_name}
                      onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Role
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Lead Trainer"
                      className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm"
                      value={editForm.role || ''}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      className={`w-full border ${editEmailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm`}
                      value={editForm.email || ''}
                      onChange={(e) => {
                        setEditForm({ ...editForm, email: e.target.value });
                        if (editEmailError) setEditEmailError(validateEmail(e.target.value));
                      }}
                      onBlur={(e) => setEditEmailError(validateEmail(e.target.value))}
                    />
                    {editEmailError && (
                      <p className="mt-1 text-xs text-red-600">{editEmailError}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      placeholder="+491234545"
                      className={`w-full border ${editPhoneError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm`}
                      value={editForm.phone || ''}
                      onChange={(e) => {
                        setEditForm({ ...editForm, phone: e.target.value });
                        if (editPhoneError) setEditPhoneError(null);
                      }}
                      onBlur={(e) => setEditPhoneError(validatePhone(e.target.value))}
                    />
                    {editPhoneError && (
                      <p className="mt-1 text-xs text-red-600">{editPhoneError}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id={`edit_member_manager_${index}`}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                      checked={editForm.is_manager}
                      onChange={(e) => setEditForm({ ...editForm, is_manager: e.target.checked })}
                    />
                    <label
                      htmlFor={`edit_member_manager_${index}`}
                      className="ml-2 block text-sm text-gray-700 dark:text-gray-300"
                    >
                      Training Manager
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={
                        !editForm.first_name.trim() ||
                        !editForm.last_name.trim() ||
                        !!editPhoneError ||
                        !!editEmailError
                      }
                      className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={index}
                className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {[member.first_name, member.last_name].filter(Boolean).join(' ')}
                      </span>
                      {member.role && (
                        <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                          {member.role}
                        </span>
                      )}
                      {member.is_manager && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                          Manager
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 space-x-3">
                      {member.email && <span>{member.email}</span>}
                      {member.phone && <span>{member.phone}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEditing(index)}
                      className="text-gray-400 dark:text-gray-500 hover:text-primary-600 p-1 rounded transition-colors"
                      title="Edit"
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoveTarget({ index, member })}
                      className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1 rounded transition-colors"
                      title="Remove"
                    >
                      <DeleteIcon />
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Add Team Member */}
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h5 className="text-sm font-medium text-blue-900 mb-3">Add Team Member</h5>
        {editingIndex === null && <ErrorBanner message={userError} />}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              First Name *
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm"
              value={newMember.first_name}
              onChange={(e) => setNewMember({ ...newMember, first_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Last Name *
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm"
              value={newMember.last_name}
              onChange={(e) => setNewMember({ ...newMember, last_name: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Role
            </label>
            <input
              type="text"
              placeholder="e.g., Lead Trainer"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm"
              value={newMember.role}
              onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              className={`w-full border ${newEmailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm`}
              value={newMember.email}
              onChange={(e) => {
                setNewMember({ ...newMember, email: e.target.value });
                if (newEmailError) setNewEmailError(validateEmail(e.target.value));
              }}
              onBlur={(e) => setNewEmailError(validateEmail(e.target.value))}
            />
            {newEmailError && <p className="mt-1 text-xs text-red-600">{newEmailError}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Phone
            </label>
            <input
              type="tel"
              placeholder="+491234545"
              className={`w-full border ${newPhoneError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm`}
              value={newMember.phone}
              onChange={(e) => {
                setNewMember({ ...newMember, phone: e.target.value });
                if (newPhoneError) setNewPhoneError(null);
              }}
              onBlur={(e) => setNewPhoneError(validatePhone(e.target.value))}
            />
            {newPhoneError && <p className="mt-1 text-xs text-red-600">{newPhoneError}</p>}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="new_member_manager"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
              checked={newMember.is_manager}
              onChange={(e) => setNewMember({ ...newMember, is_manager: e.target.checked })}
            />
            <label
              htmlFor="new_member_manager"
              className="ml-2 block text-sm text-gray-700 dark:text-gray-300"
            >
              Training Manager
            </label>
          </div>
          <button
            type="button"
            onClick={addMember}
            disabled={
              !newMember.first_name.trim() ||
              !newMember.last_name.trim() ||
              !!newPhoneError ||
              !!newEmailError
            }
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Member
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove Team Member"
        message={
          removeTarget
            ? `Are you sure you want to remove "${[removeTarget.member.first_name, removeTarget.member.last_name].filter(Boolean).join(' ')}" from this training's team?`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={confirmRemoveMember}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
