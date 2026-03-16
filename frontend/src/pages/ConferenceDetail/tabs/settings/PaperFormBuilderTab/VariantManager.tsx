import { memo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { queryKeys } from '../../../../../config/queryKeys';
import { parseApiError } from '../../../../../utils/apiError';
import ConfirmDialog from '../../../../../components/ConfirmDialog';
import { useToast } from '../../../../../components/Toast';
import type {
  PaperFormVariant,
  PaperFormVariantCreate,
  PaperFormVariantUpdate,
  UserRole,
} from '../../../../../types';
import VariantFormBuilder from './VariantFormBuilder';

interface Props {
  conferenceId: string;
  variants: PaperFormVariant[];
  isAdmin: boolean;
}

/**
 * Manages role-based paper form variants.
 * Admin can create variants linked to user roles, toggle active state, and delete.
 */
function VariantManager({ conferenceId, variants, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingVariantBuilder, setEditingVariantBuilder] = useState<PaperFormVariant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaperFormVariant | null>(null);

  // Fetch available roles for creating variants
  const { data: rolesData } = useQuery({
    queryKey: ['user-roles', conferenceId],
    queryFn: async () => {
      const response = await api.get<{ items: UserRole[] }>(
        `/conferences/${conferenceId}/settings/user-roles`
      );
      return response.data;
    },
    enabled: showCreateForm,
  });

  // Roles that don't already have a variant
  const availableRoles = (rolesData?.items ?? []).filter(
    (role) => !variants.some((v) => v.user_role_id === role.id)
  );

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.settings.paperFormSchema(conferenceId),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.settings.paperFormVariants(conferenceId),
    });
  }, [queryClient, conferenceId]);

  const createMutation = useMutation({
    mutationFn: async (data: PaperFormVariantCreate) => {
      const response = await api.post<PaperFormVariant>(
        `/conferences/${conferenceId}/paper-form-schema/variants`,
        data
      );
      return response.data;
    },
    onSuccess: (data) => {
      invalidateAll();
      showToast(`Variant "${data.name}" created`, 'success');
      setShowCreateForm(false);
    },
    onError: (err: unknown) => {
      showToast(parseApiError(err, 'Failed to create variant'), 'error');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PaperFormVariantUpdate }) => {
      const response = await api.put<PaperFormVariant>(
        `/conferences/${conferenceId}/paper-form-schema/variants/${id}`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      invalidateAll();
      showToast('Variant updated', 'success');
    },
    onError: (err: unknown) => {
      showToast(parseApiError(err, 'Failed to update variant'), 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/paper-form-schema/variants/${id}`);
    },
    onSuccess: () => {
      invalidateAll();
      showToast('Variant deleted', 'success');
      setDeleteTarget(null);
    },
    onError: (err: unknown) => {
      showToast(parseApiError(err, 'Failed to delete variant'), 'error');
      setDeleteTarget(null);
    },
  });

  const handleToggleActive = useCallback(
    (variant: PaperFormVariant) => {
      toggleActiveMutation.mutate({
        id: variant.id,
        data: { is_active: !variant.is_active },
      });
    },
    [toggleActiveMutation]
  );

  if (!isAdmin) return null;

  // When editing a variant, find the latest version from props (updated after mutations)
  const activeBuilderVariant = editingVariantBuilder
    ? (variants.find((v) => v.id === editingVariantBuilder.id) ?? editingVariantBuilder)
    : null;

  // Show full form builder when editing a variant
  if (activeBuilderVariant) {
    return (
      <div className="mt-8">
        <VariantFormBuilder
          conferenceId={conferenceId}
          variant={activeBuilderVariant}
          isAdmin={isAdmin}
          onBack={() => setEditingVariantBuilder(null)}
        />
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">
            Role-Based Form Variants
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Create custom paper forms per role. Users with the assigned role will see the variant
            form instead of the standard form.
          </p>
        </div>
        {!showCreateForm && (
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
          >
            + Add Variant
          </button>
        )}
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <CreateVariantForm
          availableRoles={availableRoles}
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setShowCreateForm(false)}
          isPending={createMutation.isPending}
        />
      )}

      {/* Variant List */}
      {variants.length > 0 ? (
        <div className="space-y-3">
          {variants.map((variant) => (
            <VariantCard
              key={variant.id}
              variant={variant}
              onToggleActive={() => handleToggleActive(variant)}
              onEdit={() => setEditingVariantBuilder(variant)}
              onDelete={() => setDeleteTarget(variant)}
            />
          ))}
        </div>
      ) : (
        !showCreateForm && (
          <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
            No form variants created yet. Add one to customize the paper form for specific roles.
          </div>
        )
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Variant"
        message={`Are you sure you want to delete the variant "${deleteTarget?.name}"? This will also delete all custom fields in this variant. Papers already submitted with this variant will keep their data.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// --- Variant Card ---

const VariantCard = memo(function VariantCard({
  variant,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  variant: PaperFormVariant;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {variant.name}
              </h4>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                {variant.role_name}
              </span>
              {!variant.is_active && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                  Inactive
                </span>
              )}
            </div>
            {variant.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                {variant.description}
              </p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {variant.fields.length} custom field{variant.fields.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          <button
            type="button"
            onClick={onToggleActive}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
              variant.is_active
                ? 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/50'
                : 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
            }`}
          >
            {variant.is_active ? 'Active' : 'Inactive'}
          </button>
          <a
            href={`#variant-${variant.id}`}
            onClick={(e) => {
              e.preventDefault();
              onEdit();
            }}
            className="px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Edit
          </a>
          <button
            type="button"
            onClick={onDelete}
            className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
});

// --- Create Variant Form ---

function CreateVariantForm({
  availableRoles,
  onSubmit,
  onCancel,
  isPending,
}: {
  availableRoles: UserRole[];
  onSubmit: (data: PaperFormVariantCreate) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Auto-fill name when role selected
  const handleRoleChange = (roleId: string) => {
    setSelectedRoleId(roleId);
    const role = availableRoles.find((r) => r.id === roleId);
    if (role && !name) {
      setName(`${role.name} Form`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoleId || !name.trim()) return;
    onSubmit({
      user_role_id: selectedRoleId,
      name: name.trim(),
      description: description.trim() || undefined,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4"
    >
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
        Create Form Variant
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Role *
          </label>
          <select
            value={selectedRoleId}
            onChange={(e) => handleRoleChange(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
            required
          >
            <option value="">Select a role...</option>
            {availableRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          {availableRoles.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              All roles already have variants.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Keynote Form"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
            required
            maxLength={255}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending || !selectedRoleId || !name.trim()}
          className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {isPending ? 'Creating...' : 'Create Variant'}
        </button>
      </div>
    </form>
  );
}

export default VariantManager;
