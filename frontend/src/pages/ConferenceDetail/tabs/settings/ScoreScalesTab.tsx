import { useState, useEffect } from "react";
import type {
  Conference,
  ReviewScoreScale,
  ReviewScoreScaleCreate,
  ReviewScoreScaleUpdate,
  ReviewScaleOption,
} from "../../../../types";
import { parseApiError } from "../../../../utils/apiError";
import Modal from "../../../../components/Modal";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import { useIsAdmin } from "../../../../hooks/useIsAdmin";
import StatusBadge from "../../../../components/common/StatusBadge";
import { ErrorBanner } from "../../../../components/common/ErrorBanner";
import { LoadingSpinner } from "../../../../components/common/LoadingSpinner";
import ModalFooter from "../../../../components/common/ModalFooter";
import { useSettingsCrud } from "../../../../hooks/useSettingsCrud";
import { EditIcon, DeleteIcon } from "../../icons";

// --- Score Scales Tab --------------------------------------------------------

function ConferenceScoreScalesTab({
  conference,
}: {
  conference: Conference;
}) {
  const isAdmin = useIsAdmin();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScale, setEditingScale] = useState<ReviewScoreScale | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReviewScoreScale | null>(null);

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
  } = useSettingsCrud<ReviewScoreScale, ReviewScoreScaleCreate, ReviewScoreScaleUpdate>({
    conferenceId: conference.id,
    endpoint: "score-scales",
    queryKey: "score-scales",
    onCreateSuccess: () => { setIsModalOpen(false); },
    onUpdateSuccess: () => { setEditingScale(null); setIsModalOpen(false); },
  });

  const handleEdit = (scale: ReviewScoreScale) => {
    setEditingScale(scale);
    setIsModalOpen(true);
    setError(null);
  };

  const handleDelete = (scale: ReviewScoreScale) => {
    setDeleteTarget(scale);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingScale(null);
    setError(null);
  };

  const handleSubmit = (formData: ReviewScoreScaleCreate) => {
    if (editingScale) {
      updateMutation.mutate({ id: editingScale.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900">
            Score Scales
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Define reusable scoring scales with configurable options for review questions
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setEditingScale(null);
              setIsModalOpen(true);
              setError(null);
            }}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            Add Scale
          </button>
        )}
      </div>

      {!isModalOpen && <ErrorBanner message={error} />}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorBanner message={`Failed to load score scales: ${parseApiError(queryError)}`} />
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Options
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Active
                </th>
                {isAdmin && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.items.map((scale) => (
                <tr key={scale.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {scale.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {scale.scale_type}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {scale.options.length}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge isActive={scale.is_active} />
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(scale)}
                        className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors mr-2"
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        onClick={() => handleDelete(scale)}
                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                        title="Delete"
                      >
                        <DeleteIcon />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 5 : 4}
                    className="px-6 py-12 text-center text-sm text-gray-500"
                  >
                    No score scales defined yet. Click &quot;Add Scale&quot;
                    to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ScoreScaleModal
        open={isModalOpen}
        scale={editingScale}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
        error={error}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Score Scale"
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

// --- Score Scale Modal -------------------------------------------------------

type OptionRow = Omit<ReviewScaleOption, "id">;

function ScoreScaleModal({
  open,
  scale,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  open: boolean;
  scale: ReviewScoreScale | null;
  onClose: () => void;
  onSubmit: (data: ReviewScoreScaleCreate) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<{
    name: string;
    scale_type: "numeric_range" | "custom" | "binary";
    is_active: boolean;
    options: OptionRow[];
  }>({
    name: "",
    scale_type: "numeric_range",
    is_active: true,
    options: [],
  });

  useEffect(() => {
    if (open) {
      setFormData({
        name: scale?.name || "",
        scale_type: scale?.scale_type || "numeric_range",
        is_active: scale?.is_active ?? true,
        options: scale
          ? scale.options.map((o) => ({
              label: o.label,
              numeric_value: o.numeric_value,
              is_unsure: o.is_unsure,
              display_order: o.display_order,
            }))
          : [],
      });
    }
  }, [open, scale]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: formData.name,
      scale_type: formData.scale_type,
      is_active: formData.is_active,
      options: formData.options,
    });
  };

  const addOption = () => {
    setFormData({
      ...formData,
      options: [
        ...formData.options,
        {
          label: "",
          numeric_value: null,
          is_unsure: false,
          display_order: formData.options.length,
        },
      ],
    });
  };

  const removeOption = (index: number) => {
    setFormData({
      ...formData,
      options: formData.options.filter((_, i) => i !== index),
    });
  };

  const updateOption = (index: number, updates: Partial<OptionRow>) => {
    setFormData({
      ...formData,
      options: formData.options.map((opt, i) =>
        i === index ? { ...opt, ...updates } : opt,
      ),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={scale ? "Edit Score Scale" : "Add Score Scale"}
      size="max-w-2xl"
    >
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
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Scale Type
            </label>
            <select
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.scale_type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  scale_type: e.target.value as "numeric_range" | "custom" | "binary",
                })
              }
            >
              <option value="numeric_range">Numeric Range</option>
              <option value="custom">Custom</option>
              <option value="binary">Binary</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              id="score-scale-active"
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
            />
            <label
              htmlFor="score-scale-active"
              className="ml-2 block text-sm text-gray-900"
            >
              Active
            </label>
          </div>

          {/* Options list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Options
              </label>
              <button
                type="button"
                onClick={addOption}
                className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Add Option
              </button>
            </div>

            {formData.options.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                No options added yet. Click &quot;Add Option&quot; to add one.
              </p>
            ) : (
              <div className="space-y-3">
                {formData.options.map((option, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 border border-gray-200 rounded-md bg-gray-50"
                  >
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Label *
                        </label>
                        <input
                          type="text"
                          required
                          className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={option.label}
                          onChange={(e) =>
                            updateOption(index, { label: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Numeric Value
                        </label>
                        <input
                          type="number"
                          className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={option.numeric_value ?? ""}
                          onChange={(e) =>
                            updateOption(index, {
                              numeric_value:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center">
                        <input
                          id={`option-unsure-${index}`}
                          type="checkbox"
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                          checked={option.is_unsure}
                          onChange={(e) =>
                            updateOption(index, {
                              is_unsure: e.target.checked,
                            })
                          }
                        />
                        <label
                          htmlFor={`option-unsure-${index}`}
                          className="ml-2 block text-xs text-gray-700"
                        >
                          Is Unsure
                        </label>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Display Order
                        </label>
                        <input
                          type="number"
                          className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={option.display_order}
                          onChange={(e) =>
                            updateOption(index, {
                              display_order: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      className="mt-5 text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                      title="Remove option"
                    >
                      <DeleteIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <ModalFooter onCancel={onClose} isLoading={isLoading} />
      </form>
    </Modal>
  );
}

export default ConferenceScoreScalesTab;
