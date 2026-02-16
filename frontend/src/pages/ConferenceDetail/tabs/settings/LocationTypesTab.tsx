import { useState, useEffect } from "react";
import type {
  Conference,
  TenantLocationType,
  TenantLocationTypeCreate,
  TenantLocationTypeUpdate,
} from "../../../../types";
import RichTextEditor from "../../../../components/common/RichTextEditor";
import RichTextDisplay from "../../../../components/common/RichTextDisplay";
import StatusBadge from "../../../../components/common/StatusBadge";
import { ErrorBanner } from "../../../../components/common/ErrorBanner";
import ModalFooter from "../../../../components/common/ModalFooter";
import CRUDSettingsTab, { type ColumnConfig, type DeleteConfig } from "./CRUDSettingsTab";

// --- Column definitions -----------------------------------------------------

const columns: ColumnConfig<TenantLocationType>[] = [
  {
    key: "name",
    label: "Name",
    render: (lt) => (
      <div className="text-sm font-medium text-gray-900">{lt.name}</div>
    ),
  },
  {
    key: "slug",
    label: "Slug",
    render: (lt) => (
      <div className="text-sm text-gray-500">{lt.slug}</div>
    ),
  },
  {
    key: "description",
    label: "Description",
    cellClassName: "",
    render: (lt) => (
      <RichTextDisplay content={lt.description} truncate className="text-sm text-gray-500 max-w-xs" />
    ),
  },
  {
    key: "is_active",
    label: "Active",
    render: (lt) => <StatusBadge isActive={lt.is_active} />,
  },
  {
    key: "usage_count",
    label: "Usage Count",
    render: (lt) => (
      <div className="text-sm text-gray-900">{lt.usage_count}</div>
    ),
  },
];

// --- Delete configuration ---------------------------------------------------

const deleteConfig: DeleteConfig<TenantLocationType> = {
  canDelete: (lt) => lt.usage_count === 0,
  disabledTitle: (lt) =>
    `Cannot delete: this type is used by ${lt.usage_count} location(s)`,
  enabledTitle: "Delete this location type",
};

// --- Modal form body --------------------------------------------------------

function LocationTypeForm({
  item,
  onSubmit,
  onClose,
  isLoading,
  error,
}: {
  item: TenantLocationType | null;
  onSubmit: (data: TenantLocationTypeCreate) => void;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<TenantLocationTypeCreate>({
    name: "",
    slug: "",
    description: "",
    is_active: true,
  });

  useEffect(() => {
    setFormData({
      name: item?.name || "",
      slug: item?.slug || "",
      description: item?.description || "",
      is_active: item?.is_active ?? true,
    });
  }, [item]);

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s_]/g, "")
      .replace(/[\s]+/g, "_")
      .replace(/^[^a-z]/, "")
      .replace(/_+/g, "_")
      .replace(/_$/, "");
  };

  const handleNameChange = (name: string) => {
    const updates: Partial<TenantLocationTypeCreate> = { name };
    // Auto-generate slug only when creating (not editing)
    if (!item) {
      updates.slug = generateSlug(name);
    }
    setFormData({ ...formData, ...updates });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="px-6 py-4 space-y-4">
        <ErrorBanner message={error} />

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Name *
          </label>
          <input
            type="text"
            required
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            value={formData.name}
            onChange={(e) => handleNameChange(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Slug *
          </label>
          <input
            type="text"
            required
            pattern="^[a-z][a-z0-9_]*$"
            title="Must start with a lowercase letter and contain only lowercase letters, numbers, and underscores"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            value={formData.slug}
            onChange={(e) =>
              setFormData({
                ...formData,
                slug: e.target.value.toLowerCase(),
              })
            }
          />
          <p className="mt-1 text-xs text-gray-500">
            Lowercase letters, numbers, and underscores only. Must start with
            a letter.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <RichTextEditor
            value={formData.description || ""}
            onChange={(html) =>
              setFormData({ ...formData, description: html })
            }
            rows={3}
          />
        </div>

        <div className="flex items-center">
          <input
            id="conf-location-type-active"
            type="checkbox"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            checked={formData.is_active ?? true}
            onChange={(e) =>
              setFormData({ ...formData, is_active: e.target.checked })
            }
          />
          <label
            htmlFor="conf-location-type-active"
            className="ml-2 block text-sm text-gray-900"
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

function ConferenceLocationTypesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  return (
    <CRUDSettingsTab<TenantLocationType, TenantLocationTypeCreate, TenantLocationTypeUpdate>
      conference={conference}
      isAdmin={isAdmin}
      endpoint="location-types"
      queryKey="location-types"
      title="Location Types"
      description="Define the types of locations available for this conference"
      entityName="Location Type"
      addButtonLabel="Add Type"
      columns={columns}
      deleteConfig={deleteConfig}
      renderForm={(ctx) => (
        <LocationTypeForm
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

export default ConferenceLocationTypesTab;
