import { useState, useEffect } from "react";
import type {
  Conference,
  ReviewScoreScale,
  ReviewScoreScaleCreate,
  ReviewScoreScaleUpdate,
  ReviewScaleOption,
} from "../../../../types";
import StatusBadge from "../../../../components/common/StatusBadge";
import { ErrorBanner } from "../../../../components/common/ErrorBanner";
import ModalFooter from "../../../../components/common/ModalFooter";
import { DeleteIcon } from "../../icons";
import CRUDSettingsTab, { type ColumnConfig } from "./CRUDSettingsTab";

// --- Column definitions -----------------------------------------------------

const columns: ColumnConfig<ReviewScoreScale>[] = [
  {
    key: "name",
    label: "Name",
    render: (scale) => (
      <div className="text-sm font-medium text-gray-900">{scale.name}</div>
    ),
  },
  {
    key: "scale_type",
    label: "Type",
    render: (scale) => (
      <div className="text-sm text-gray-500">{scale.scale_type}</div>
    ),
  },
  {
    key: "options",
    label: "Options",
    render: (scale) => (
      <div className="text-sm text-gray-500">{scale.options.length}</div>
    ),
  },
  {
    key: "is_active",
    label: "Active",
    render: (scale) => <StatusBadge isActive={scale.is_active} />,
  },
];

// --- Modal form body --------------------------------------------------------

type OptionRow = Omit<ReviewScaleOption, "id">;

function ScoreScaleForm({
  item,
  onSubmit,
  onClose,
  isLoading,
  error,
}: {
  item: ReviewScoreScale | null;
  onSubmit: (data: ReviewScoreScaleCreate) => void;
  onClose: () => void;
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
    setFormData({
      name: item?.name || "",
      scale_type: item?.scale_type || "numeric_range",
      is_active: item?.is_active ?? true,
      options: item
        ? item.options.map((o) => ({
            label: o.label,
            numeric_value: o.numeric_value,
            is_unsure: o.is_unsure,
            display_order: o.display_order,
          }))
        : [],
    });
  }, [item]);

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
  );
}

// --- Tab component ----------------------------------------------------------

function ConferenceScoreScalesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  return (
    <CRUDSettingsTab<ReviewScoreScale, ReviewScoreScaleCreate, ReviewScoreScaleUpdate>
      conference={conference}
      isAdmin={isAdmin}
      endpoint="score-scales"
      queryKey="score-scales"
      title="Score Scales"
      description="Define reusable scoring scales with configurable options for review questions"
      entityName="Score Scale"
      addButtonLabel="Add Scale"
      columns={columns}
      modalSize="max-w-2xl"
      renderForm={(ctx) => (
        <ScoreScaleForm
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

export default ConferenceScoreScalesTab;
