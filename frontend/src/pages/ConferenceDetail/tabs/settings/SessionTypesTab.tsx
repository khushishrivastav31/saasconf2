import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  Conference,
  SessionType,
  SessionTypeCreate,
  SessionTypeUpdate,
  UserRole,
} from '../../../../types';
import api from '../../../../config/api';
import StatusBadge from '../../../../components/common/StatusBadge';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import ModalFooter from '../../../../components/common/ModalFooter';
import CRUDSettingsTab, { type ColumnConfig } from './CRUDSettingsTab';
import { slugifyHyphen } from '../../../../utils/validators';

// --- Column definitions -----------------------------------------------------

function buildColumns(roleNameById: Map<string, string>): ColumnConfig<SessionType>[] {
  return [
    {
      key: 'name',
      label: 'Name',
      render: (st) => (
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{st.name}</div>
      ),
    },
    {
      key: 'slug',
      label: 'Slug',
      render: (st) => (
        <code className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
          {st.slug}
        </code>
      ),
    },
    {
      key: 'duration_minutes',
      label: 'Duration',
      render: (st) => (
        <span className="text-sm text-gray-900 dark:text-gray-100">{st.duration_minutes} min</span>
      ),
    },
    {
      key: 'cfp_eligible',
      label: 'CFP Eligible',
      render: (st) => (
        <span
          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
            st.cfp_eligible
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
          }`}
        >
          {st.cfp_eligible ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'separately_bookable',
      label: 'Bookable',
      render: (st) => (
        <span
          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
            st.separately_bookable
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
          }`}
        >
          {st.separately_bookable ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'max_attendees',
      label: 'Max Attendees',
      render: (st) => (
        <span className="text-sm text-gray-900 dark:text-gray-100">
          {st.separately_bookable ? (st.max_attendees ? st.max_attendees : 'Unlimited') : '—'}
        </span>
      ),
    },
    {
      key: 'user_role_id',
      label: 'Speaker Role',
      render: (st) => (
        <span className="text-sm text-gray-900 dark:text-gray-100">
          {st.user_role_id ? roleNameById.get(st.user_role_id) || '—' : '—'}
        </span>
      ),
    },
    {
      key: 'is_active',
      label: 'Active',
      render: (st) => <StatusBadge isActive={st.is_active} />,
    },
  ];
}

// --- Modal form body --------------------------------------------------------

function SessionTypeForm({
  item,
  onSubmit,
  onClose,
  isLoading,
  error,
  roles,
}: {
  item: SessionType | null;
  onSubmit: (data: SessionTypeCreate) => void;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
  roles: UserRole[];
}) {
  const [formData, setFormData] = useState<SessionTypeCreate>({
    name: '',
    slug: '',
    duration_minutes: 30,
    cfp_eligible: true,
    separately_bookable: false,
    max_attendees: null,
    is_active: true,
    user_role_id: null,
  });
  const [autoSlug, setAutoSlug] = useState(true);

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name,
        slug: item.slug,
        duration_minutes: item.duration_minutes,
        cfp_eligible: item.cfp_eligible,
        separately_bookable: item.separately_bookable,
        max_attendees: item.max_attendees,
        is_active: item.is_active,
        user_role_id: item.user_role_id,
      });
      setAutoSlug(false);
    } else {
      setFormData({
        name: '',
        slug: '',
        duration_minutes: 30,
        cfp_eligible: true,
        separately_bookable: false,
        max_attendees: null,
        is_active: true,
        user_role_id: null,
      });
      setAutoSlug(true);
    }
  }, [item]);

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: autoSlug ? slugifyHyphen(name) : prev.slug,
    }));
  };

  const handleSlugChange = (slug: string) => {
    setAutoSlug(false);
    setFormData((prev) => ({ ...prev, slug }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="px-6 py-4 space-y-4">
        {error && <ErrorBanner message={error} />}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Name *
          </label>
          <input
            type="text"
            required
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={formData.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g., Keynote Speech"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Slug *
          </label>
          <input
            type="text"
            required
            pattern="^[-a-z0-9_]+$"
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm font-mono dark:bg-gray-800 dark:text-gray-100"
            value={formData.slug}
            onChange={(e) => handleSlugChange(e.target.value.toLowerCase())}
            placeholder="e.g., keynote"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Lowercase letters, numbers, hyphens, and underscores only
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Duration (minutes) *
          </label>
          <input
            type="number"
            required
            min={1}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={formData.duration_minutes}
            onChange={(e) =>
              setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 0 })
            }
          />
        </div>

        <div className="flex items-center">
          <input
            id="cfp-eligible"
            type="checkbox"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
            checked={formData.cfp_eligible ?? true}
            onChange={(e) => setFormData({ ...formData, cfp_eligible: e.target.checked })}
          />
          <label
            htmlFor="cfp-eligible"
            className="ml-2 block text-sm text-gray-900 dark:text-gray-100"
          >
            CFP Eligible
          </label>
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
            (can be selected for Call for Papers submissions)
          </span>
        </div>

        <div className="flex items-center">
          <input
            id="separately-bookable"
            type="checkbox"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
            checked={formData.separately_bookable ?? false}
            onChange={(e) => setFormData({ ...formData, separately_bookable: e.target.checked })}
          />
          <label
            htmlFor="separately-bookable"
            className="ml-2 block text-sm text-gray-900 dark:text-gray-100"
          >
            Separately Bookable
          </label>
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
            (session can be booked individually by attendees)
          </span>
        </div>

        {formData.separately_bookable && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Max Attendees
            </label>
            <input
              type="number"
              min={1}
              placeholder="Leave empty for unlimited"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formData.max_attendees || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  max_attendees: e.target.value ? parseInt(e.target.value) : null,
                })
              }
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Leave empty for unlimited capacity. Once this limit is reached, the session will no
              longer appear as available for booking.
            </p>
          </div>
        )}

        <div>
          <label
            htmlFor="session-type-user-role"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Speaker Role
          </label>
          <select
            id="session-type-user-role"
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={formData.user_role_id ?? ''}
            onChange={(e) => setFormData({ ...formData, user_role_id: e.target.value || null })}
          >
            <option value="">— None —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            When set, accepted CFP-paper speakers with this session type are auto-assigned to the
            chosen role (drives the per-category Speakers tabs — Tutorials, Bonus Sessions, etc.).
          </p>
        </div>

        <div className="flex items-center">
          <input
            id="session-type-active"
            type="checkbox"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
            checked={formData.is_active ?? true}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
          />
          <label
            htmlFor="session-type-active"
            className="ml-2 block text-sm text-gray-900 dark:text-gray-100"
          >
            Active
          </label>
        </div>
      </div>

      <ModalFooter onCancel={onClose} isLoading={isLoading} />
    </form>
  );
}

// --- Tab component ----------------------------------------------------------

function ConferenceSessionTypesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const { data: rolesData } = useQuery({
    queryKey: ['user-roles', conference.id],
    queryFn: async () => {
      const resp = await api.get<{ items: UserRole[] }>(
        `/conferences/${conference.id}/settings/user-roles`
      );
      return resp.data;
    },
    staleTime: 60_000,
  });
  // ``rolesData`` is the full ``{ items, total }`` envelope so this
  // shares the cache shape with ``RoleMembers.tsx`` (same queryKey).
  const roles = rolesData?.items ?? [];
  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const columns = buildColumns(roleNameById);

  return (
    <CRUDSettingsTab<SessionType, SessionTypeCreate, SessionTypeUpdate>
      conference={conference}
      isAdmin={isAdmin}
      endpoint="session-types"
      queryKey="session-types"
      title="Session Types"
      description="Define the types of sessions available for the conference"
      entityName="Session Type"
      columns={columns}
      renderForm={(ctx) => (
        <SessionTypeForm
          item={ctx.item}
          onSubmit={ctx.onSubmit}
          onClose={ctx.onClose}
          isLoading={ctx.isLoading}
          error={ctx.error}
          roles={roles}
        />
      )}
    />
  );
}

export default ConferenceSessionTypesTab;
