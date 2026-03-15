import { useState, useEffect } from 'react';
import type { Conference, UserRole, UserRoleCreate, UserRoleUpdate } from '../../../../types';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import RichTextDisplay from '../../../../components/common/RichTextDisplay';
import StatusBadge from '../../../../components/common/StatusBadge';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import ModalFooter from '../../../../components/common/ModalFooter';
import CRUDSettingsTab, { type ColumnConfig } from './CRUDSettingsTab';

// --- Column definitions -----------------------------------------------------

const columns: ColumnConfig<UserRole>[] = [
  {
    key: 'name',
    label: 'Name',
    render: (role) => (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{role.name}</span>
        {role.is_system && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            System
          </span>
        )}
      </div>
    ),
  },
  {
    key: 'description',
    label: 'Description',
    cellClassName: '',
    render: (role) => (
      <RichTextDisplay
        content={role.description}
        truncate
        className="text-sm text-gray-500 dark:text-gray-400 max-w-xs"
      />
    ),
  },
  {
    key: 'assignment_count',
    label: 'Assigned',
    render: (role) => (
      <span className="text-sm text-gray-600 dark:text-gray-300">{role.assignment_count}</span>
    ),
  },
  {
    key: 'is_active',
    label: 'Active',
    render: (role) => <StatusBadge isActive={role.is_active} />,
  },
];

// --- Modal form body --------------------------------------------------------

function UserRoleForm({
  item,
  onSubmit,
  onClose,
  isLoading,
  error,
}: {
  item: UserRole | null;
  onSubmit: (data: UserRoleCreate) => void;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<UserRoleCreate>({
    name: '',
    description: '',
    is_active: true,
  });

  const isSystemRole = item?.is_system ?? false;

  useEffect(() => {
    setFormData({
      name: item?.name || '',
      description: item?.description || '',
      is_active: item?.is_active ?? true,
    });
  }, [item]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="px-6 py-4 space-y-4">
        <ErrorBanner message={error} />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Name *
          </label>
          <input
            type="text"
            required
            disabled={isSystemRole}
            className={`mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100 ${isSystemRole ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : ''}`}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          {isSystemRole && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              System role names cannot be changed
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Description
          </label>
          <RichTextEditor
            value={formData.description || ''}
            onChange={(html) => setFormData({ ...formData, description: html })}
            rows={3}
          />
        </div>

        <div className="flex items-center">
          <input
            id="user-role-active"
            type="checkbox"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
            checked={formData.is_active ?? true}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
          />
          <label
            htmlFor="user-role-active"
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

function ConferenceUserRolesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  return (
    <CRUDSettingsTab<UserRole, UserRoleCreate, UserRoleUpdate>
      conference={conference}
      isAdmin={isAdmin}
      endpoint="user-roles"
      queryKey="user-roles"
      title="User Roles"
      description="Define roles for conference participants. Assign roles to users in the CFP Applicants section."
      entityName="Role"
      columns={columns}
      deleteConfig={{
        canDelete: (role) => !role.is_system,
        disabledTitle: () => 'System roles cannot be deleted',
      }}
      renderForm={(ctx) => (
        <UserRoleForm
          item={ctx.item}
          onSubmit={ctx.onSubmit}
          onClose={ctx.onClose}
          isLoading={ctx.isLoading}
          error={ctx.error}
        />
      )}
    />
  );
}

export default ConferenceUserRolesTab;
