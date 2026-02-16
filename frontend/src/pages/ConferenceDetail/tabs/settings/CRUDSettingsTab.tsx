import { useState, useEffect, type ReactNode } from "react";
import { parseApiError } from "../../../../utils/apiError";
import Modal from "../../../../components/Modal";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import { ErrorBanner } from "../../../../components/common/ErrorBanner";
import { LoadingSpinner } from "../../../../components/common/LoadingSpinner";
import ModalFooter from "../../../../components/common/ModalFooter";
import { useSettingsCrud } from "../../../../hooks/useSettingsCrud";
import { EditIcon, DeleteIcon } from "../../icons";

// ---------------------------------------------------------------------------
// Column configuration
// ---------------------------------------------------------------------------

export interface ColumnConfig<T> {
  key: string;
  label: string;
  /** Override default cell rendering. Return a ReactNode. */
  render?: (item: T) => ReactNode;
  /** Header alignment class override (default: "text-left") */
  headerAlign?: string;
  /** Cell extra className (added to <td>) */
  cellClassName?: string;
}

// ---------------------------------------------------------------------------
// Form field configuration (for simple forms rendered automatically)
// ---------------------------------------------------------------------------

export type FormFieldType = "text" | "textarea" | "richtext" | "number" | "checkbox" | "select";

export interface SelectOption {
  value: string;
  label: string;
}

export interface FormFieldConfig {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  /** For number fields */
  min?: number;
  step?: string;
  /** For textarea fields */
  rows?: number;
  /** Placeholder text */
  placeholder?: string;
  /** Help text shown below the field */
  helpText?: string;
  /** For select fields */
  options?: SelectOption[];
  /** HTML pattern attribute for text inputs */
  pattern?: string;
  /** HTML title attribute for text inputs (shows on pattern mismatch) */
  title?: string;
  /** Checkbox id (for label association) */
  checkboxId?: string;
  /** Default value for new items */
  defaultValue?: unknown;
}

// ---------------------------------------------------------------------------
// Delete button configuration
// ---------------------------------------------------------------------------

export interface DeleteConfig<T> {
  /** Return false to disable the delete button for a specific item */
  canDelete?: (item: T) => boolean;
  /** Tooltip when delete is disabled */
  disabledTitle?: (item: T) => string;
  /** Tooltip when delete is enabled (defaults to "Delete") */
  enabledTitle?: string;
}

// ---------------------------------------------------------------------------
// CRUDSettingsTab props
// ---------------------------------------------------------------------------

export interface CRUDSettingsTabProps<
  TEntity extends { id: string; name: string },
  TCreate = Record<string, unknown>,
> {
  conference: { id: string };
  isAdmin: boolean;

  /** API path segment (e.g. "volunteer-roles") */
  endpoint: string;
  /** React Query cache key (e.g. "volunteer-roles") */
  queryKey: string;

  /** Plural display name for the heading (e.g. "Committee Roles") */
  title: string;
  /** Subtitle / description under the heading */
  description: string;
  /** Singular entity noun for modal titles and delete dialog (e.g. "Location Type") */
  entityName: string;
  /** Override the "Add" button label (defaults to "Add {entityName}") */
  addButtonLabel?: string;

  /** Table column definitions */
  columns: ColumnConfig<TEntity>[];

  // ---- Form rendering (pick ONE strategy) --------------------------------

  /**
   * Simple declarative form fields. The component will render a standard
   * modal form with these fields. Mutually exclusive with `renderForm`.
   */
  formFields?: FormFieldConfig[];

  /**
   * Render-prop for a fully custom modal form body.
   * Receives the current item (null for create) and helpers.
   * Must call `onSubmit` with the create/update payload.
   * Mutually exclusive with `formFields`.
   */
  renderForm?: (ctx: {
    item: TEntity | null;
    onSubmit: (data: TCreate) => void;
    onClose: () => void;
    isLoading: boolean;
    error: string | null;
  }) => ReactNode;

  /** Modal size class (default "max-w-lg") */
  modalSize?: string;

  /** Delete button configuration */
  deleteConfig?: DeleteConfig<TEntity>;

  /**
   * Build the initial form data for a new or editing item.
   * Required when using `formFields`.
   * For new items, `item` is null.
   */
  getInitialFormData?: (item: TEntity | null) => Record<string, unknown>;

  /**
   * Optional transform applied to formData before it is submitted.
   * Useful for stripping/transforming fields before sending to API.
   */
  transformSubmitData?: (formData: Record<string, unknown>) => TCreate;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CRUDSettingsTab<
  TEntity extends { id: string; name: string },
  TCreate = Record<string, unknown>,
  TUpdate = TCreate,
>(props: CRUDSettingsTabProps<TEntity, TCreate>) {
  const {
    conference,
    isAdmin,
    endpoint,
    queryKey,
    title,
    description,
    entityName,
    addButtonLabel,
    columns,
    formFields,
    renderForm,
    modalSize = "max-w-lg",
    deleteConfig,
    getInitialFormData,
    transformSubmitData,
  } = props;

  // -- Modal / editing state ------------------------------------------------

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TEntity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TEntity | null>(null);

  // -- CRUD hook ------------------------------------------------------------

  const {
    data,
    isLoading,
    isError,
    queryError,
    createMutation,
    updateMutation,
    deleteMutation,
    error,
    setError,
  } = useSettingsCrud<TEntity, TCreate, TUpdate>({
    conferenceId: conference.id,
    endpoint,
    queryKey,
    onCreateSuccess: () => {
      setIsModalOpen(false);
    },
    onUpdateSuccess: () => {
      setEditingItem(null);
      setIsModalOpen(false);
    },
  });

  // -- Handlers -------------------------------------------------------------

  const handleEdit = (item: TEntity) => {
    setEditingItem(item);
    setIsModalOpen(true);
    setError(null);
  };

  const handleDelete = (item: TEntity) => {
    setDeleteTarget(item);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setError(null);
  };

  const handleSubmit = (formData: TCreate) => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData as unknown as TUpdate });
    } else {
      createMutation.mutate(formData);
    }
  };

  // -- Column count (for colSpan on empty state) ----------------------------

  const totalColumns = columns.length + (isAdmin ? 1 : 0);

  // -- Render ---------------------------------------------------------------

  return (
    <div>
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setEditingItem(null);
              setIsModalOpen(true);
              setError(null);
            }}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            {addButtonLabel ?? `Add ${entityName}`}
          </button>
        )}
      </div>

      {/* Error (hidden while modal is open) */}
      {!isModalOpen && <ErrorBanner message={error} />}

      {/* Body */}
      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorBanner
          message={`Failed to load ${title.toLowerCase()}: ${parseApiError(queryError)}`}
        />
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-6 py-3 ${col.headerAlign ?? "text-left"} text-xs font-medium text-gray-500 uppercase tracking-wider`}
                  >
                    {col.label}
                  </th>
                ))}
                {isAdmin && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.items?.map((item) => (
                <tr key={item.id}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-6 py-4 ${col.cellClassName ?? "whitespace-nowrap"}`}
                    >
                      {col.render
                        ? col.render(item)
                        : (
                            <div className="text-sm text-gray-900">
                              {String((item as Record<string, unknown>)[col.key] ?? "")}
                            </div>
                          )}
                    </td>
                  ))}
                  {isAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(item)}
                        className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors mr-2"
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      {deleteConfig?.canDelete && !deleteConfig.canDelete(item) ? (
                        <button
                          disabled
                          className="text-gray-300 cursor-not-allowed p-1 rounded transition-colors"
                          title={deleteConfig.disabledTitle?.(item) ?? "Cannot delete"}
                        >
                          <DeleteIcon />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDelete(item)}
                          className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                          title={deleteConfig?.enabledTitle ?? "Delete"}
                        >
                          <DeleteIcon />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr>
                  <td
                    colSpan={totalColumns}
                    className="px-6 py-12 text-center text-sm text-gray-500"
                  >
                    No {title.toLowerCase()} defined yet. Click &quot;{addButtonLabel ?? `Add ${entityName}`}&quot; to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal ------------------------------------------------------------ */}
      {renderForm ? (
        <Modal
          key={editingItem?.id ?? "new"}
          open={isModalOpen}
          onClose={handleCloseModal}
          title={editingItem ? `Edit ${entityName}` : `Add ${entityName}`}
          size={modalSize}
        >
          {renderForm({
            item: editingItem,
            onSubmit: handleSubmit,
            onClose: handleCloseModal,
            isLoading: createMutation.isPending || updateMutation.isPending,
            error,
          })}
        </Modal>
      ) : (
        <DefaultFormModal<TEntity, TCreate>
          key={editingItem?.id ?? "new"}
          open={isModalOpen}
          item={editingItem}
          entityName={entityName}
          modalSize={modalSize}
          formFields={formFields ?? []}
          getInitialFormData={getInitialFormData}
          transformSubmitData={transformSubmitData}
          onClose={handleCloseModal}
          onSubmit={handleSubmit}
          isLoading={createMutation.isPending || updateMutation.isPending}
          error={error}
        />
      )}

      {/* Delete confirmation ---------------------------------------------- */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${entityName}`}
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default form modal (used when formFields are provided instead of renderForm)
// ---------------------------------------------------------------------------

function DefaultFormModal<
  TEntity extends { id: string; name: string },
  TCreate,
>({
  open,
  item,
  entityName,
  modalSize,
  formFields,
  getInitialFormData,
  transformSubmitData,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  open: boolean;
  item: TEntity | null;
  entityName: string;
  modalSize: string;
  formFields: FormFieldConfig[];
  getInitialFormData?: (item: TEntity | null) => Record<string, unknown>;
  transformSubmitData?: (data: Record<string, unknown>) => TCreate;
  onClose: () => void;
  onSubmit: (data: TCreate) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (open) {
      if (getInitialFormData) {
        setFormData(getInitialFormData(item));
      } else {
        // Fallback: build defaults from formFields
        const defaults: Record<string, unknown> = {};
        for (const field of formFields) {
          if (item) {
            defaults[field.key] = (item as Record<string, unknown>)[field.key] ?? field.defaultValue ?? "";
          } else {
            defaults[field.key] = field.defaultValue ?? (field.type === "checkbox" ? true : "");
          }
        }
        setFormData(defaults);
      }
    }
  }, [open, item]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = transformSubmitData ? transformSubmitData(formData) : (formData as unknown as TCreate);
    onSubmit(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? `Edit ${entityName}` : `Add ${entityName}`}
      size={modalSize}
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <ErrorBanner message={error} />

          {formFields.map((field) => {
            if (field.type === "checkbox") {
              return (
                <div key={field.key} className="flex items-center">
                  <input
                    id={field.checkboxId ?? `crud-field-${field.key}`}
                    type="checkbox"
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    checked={!!formData[field.key]}
                    onChange={(e) => setField(field.key, e.target.checked)}
                  />
                  <label
                    htmlFor={field.checkboxId ?? `crud-field-${field.key}`}
                    className="ml-2 block text-sm text-gray-900"
                  >
                    {field.label}
                  </label>
                </div>
              );
            }

            return (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700">
                  {field.label}
                  {field.required ? " *" : ""}
                </label>
                {field.type === "textarea" ? (
                  <textarea
                    required={field.required}
                    rows={field.rows ?? 3}
                    placeholder={field.placeholder}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={String(formData[field.key] ?? "")}
                    onChange={(e) => setField(field.key, e.target.value)}
                  />
                ) : field.type === "number" ? (
                  <input
                    type="number"
                    required={field.required}
                    min={field.min}
                    step={field.step}
                    placeholder={field.placeholder}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={String(formData[field.key] ?? "")}
                    onChange={(e) => setField(field.key, parseFloat(e.target.value) || 0)}
                  />
                ) : field.type === "select" ? (
                  <select
                    required={field.required}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={String(formData[field.key] ?? "")}
                    onChange={(e) => setField(field.key, e.target.value)}
                  >
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  /* text (default) */
                  <>
                    <input
                      type="text"
                      required={field.required}
                      pattern={field.pattern}
                      title={field.title}
                      placeholder={field.placeholder}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={String(formData[field.key] ?? "")}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                    {field.helpText && (
                      <p className="mt-1 text-xs text-gray-500">{field.helpText}</p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <ModalFooter onCancel={onClose} isLoading={isLoading} />
      </form>
    </Modal>
  );
}
