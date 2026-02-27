import { useState, useEffect } from 'react';
import type {
  Conference,
  CFPCommitteeRole,
  CFPCommitteeRoleCreate,
  CFPCommitteeRoleUpdate,
} from '../../../../types';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import RichTextDisplay from '../../../../components/common/RichTextDisplay';
import StatusBadge from '../../../../components/common/StatusBadge';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import ModalFooter from '../../../../components/common/ModalFooter';
import CRUDSettingsTab, { type ColumnConfig } from './CRUDSettingsTab';

// --- Column definitions -----------------------------------------------------

const columns: ColumnConfig<CFPCommitteeRole>[] = [
  {
    key: 'name',
    label: 'Name',
    render: (role) => (
      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{role.name}</div>
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
    key: 'is_active',
    label: 'Active',
    render: (role) => <StatusBadge isActive={role.is_active} />,
  },
];

// --- Modal form body --------------------------------------------------------

function CommitteeRoleForm({
  item,
  onSubmit,
  onClose,
  isLoading,
  error,
}: {
  item: CFPCommitteeRole | null;
  onSubmit: (data: CFPCommitteeRoleCreate) => void;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<CFPCommitteeRoleCreate>({
    name: '',
    description: '',
    is_active: true,
  });

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
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
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
            id="conf-committee-role-active"
            type="checkbox"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
            checked={formData.is_active ?? true}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
          />
          <label
            htmlFor="conf-committee-role-active"
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

function ConferenceCommitteeRolesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  return (
    <CRUDSettingsTab<CFPCommitteeRole, CFPCommitteeRoleCreate, CFPCommitteeRoleUpdate>
      conference={conference}
      isAdmin={isAdmin}
      endpoint="committee-roles"
      queryKey="committee-roles"
      title="Committee Roles"
      description="Define the roles available for program committee members"
      entityName="Role"
      columns={columns}
      renderForm={(ctx) => (
        <CommitteeRoleForm
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

export default ConferenceCommitteeRolesTab;
