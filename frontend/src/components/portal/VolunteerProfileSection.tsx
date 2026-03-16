import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';
import type { VolunteerProfile, VolunteerProfileUpdate } from '../../types/volunteer';
import { useToast } from '../Toast';

/**
 * Volunteer profile section shown on the portal Profile page.
 * Displays volunteer-specific fields per conference where the user has the Volunteer role.
 */
export default function VolunteerProfileSection() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['portal-volunteer-profiles'],
    queryFn: async () => {
      const res = await portalApi.get<VolunteerProfile[]>('/portal/me/volunteer-profiles');
      return res.data;
    },
  });

  if (isLoading || !profiles || profiles.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
        Volunteer Information
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Update your volunteer-specific details for each conference you are volunteering at.
      </p>
      <div className="space-y-4">
        {profiles.map((profile) => (
          <VolunteerProfileCard
            key={`${profile.conference_id}`}
            profile={profile}
            onSaved={() =>
              queryClient.invalidateQueries({ queryKey: ['portal-volunteer-profiles'] })
            }
            showToast={showToast}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single conference volunteer profile card
// ---------------------------------------------------------------------------

function VolunteerProfileCard({
  profile,
  onSaved,
  showToast,
}: {
  profile: VolunteerProfile;
  onSaved: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tshirtSize, setTshirtSize] = useState(profile.tshirt_size ?? '');
  const [emergencyName, setEmergencyName] = useState(profile.emergency_contact_name ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(profile.emergency_contact_phone ?? '');
  const [skills, setSkills] = useState(profile.skills?.join(', ') ?? '');
  const [notes, setNotes] = useState(profile.notes ?? '');

  // Reset form when profile data changes
  useEffect(() => {
    setTshirtSize(profile.tshirt_size ?? '');
    setEmergencyName(profile.emergency_contact_name ?? '');
    setEmergencyPhone(profile.emergency_contact_phone ?? '');
    setSkills(profile.skills?.join(', ') ?? '');
    setNotes(profile.notes ?? '');
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: async (data: VolunteerProfileUpdate) => {
      const res = await portalApi.put<VolunteerProfile>(
        `/portal/me/volunteer-profiles/${profile.conference_id}`,
        data
      );
      return res.data;
    },
    onSuccess: () => {
      showToast('Volunteer profile updated', 'success');
      setIsEditing(false);
      onSaved();
    },
    onError: () => {
      showToast('Failed to update volunteer profile', 'error');
    },
  });

  const handleSave = useCallback(() => {
    updateMutation.mutate({
      tshirt_size: tshirtSize || null,
      emergency_contact_name: emergencyName || null,
      emergency_contact_phone: emergencyPhone || null,
      skills: skills
        ? skills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      notes: notes || null,
    });
  }, [updateMutation, tshirtSize, emergencyName, emergencyPhone, skills, notes]);

  const inputClass =
    'w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  if (!isEditing) {
    // Collapsed summary view
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {profile.tshirt_size && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  {profile.tshirt_size}
                </span>
              )}
              {profile.emergency_contact_name && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  Emergency contact set
                </span>
              )}
              {profile.skills && profile.skills.length > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {profile.skills.length} skill{profile.skills.length !== 1 ? 's' : ''}
                </span>
              )}
              {!profile.tshirt_size && !profile.emergency_contact_name && (
                <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                  No details filled in yet
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="ml-3 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  // Expanded edit view
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>T-Shirt Size</label>
          <select
            value={tshirtSize}
            onChange={(e) => setTshirtSize(e.target.value)}
            className={inputClass}
          >
            <option value="">— Not set —</option>
            <option value="XS">XS</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
            <option value="XXL">XXL</option>
            <option value="XXXL">XXXL</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Skills</label>
          <input
            type="text"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="e.g. languages, customer service"
            className={inputClass}
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Comma-separated</p>
        </div>

        <div>
          <label className={labelClass}>Emergency Contact Name</label>
          <input
            type="text"
            value={emergencyName}
            onChange={(e) => setEmergencyName(e.target.value)}
            placeholder="Full name"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Emergency Contact Phone</label>
          <input
            type="text"
            value={emergencyPhone}
            onChange={(e) => setEmergencyPhone(e.target.value)}
            placeholder="+49 170 1234567"
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything we should know..."
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
