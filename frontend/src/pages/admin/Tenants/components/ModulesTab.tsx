import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../../config/api";
import Modal from "../../../../components/Modal";
import type {
  Module,
  TenantModule,
  TenantModuleAssign,
  TenantModuleUpdate,
  PaginatedResponse,
  PlatformCurrency,
} from "../../../../types";

export default function ModulesTab({
  tenantId,
  onAssignModule,
}: {
  tenantId: string;
  onAssignModule: () => void;
}) {
  const queryClient = useQueryClient();
  const [editingModule, setEditingModule] = useState<TenantModule | null>(null);

  const { data: modules, isLoading } = useQuery({
    queryKey: ["tenant-modules", tenantId],
    queryFn: async () => {
      const response = await api.get<TenantModule[]>(
        `/admin/tenants/${tenantId}/modules`,
      );
      return response.data;
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (moduleId: string) => {
      await api.delete(`/admin/tenants/${tenantId}/modules/${moduleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-modules", tenantId] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">Assigned Modules</h4>
        <button
          onClick={onAssignModule}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-primary-600 hover:bg-primary-700"
        >
          Assign Module
        </button>
      </div>

      {modules && modules.length > 0 ? (
        <div className="space-y-3">
          {modules.map((tm) => (
            <div key={tm.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h5 className="font-medium text-gray-900">
                      {tm.module_name}
                    </h5>
                    <span
                      className={`px-2 text-xs font-semibold rounded-full ${
                        tm.is_active_subscription
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {tm.is_active_subscription ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{tm.module_code}</p>

                  <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Start:</span>{" "}
                      {tm.start_date
                        ? new Date(tm.start_date).toLocaleDateString()
                        : "Not set"}
                    </div>
                    <div>
                      <span className="text-gray-500">End:</span>{" "}
                      {tm.end_date
                        ? new Date(tm.end_date).toLocaleDateString()
                        : "No expiry"}
                    </div>
                    <div>
                      <span className="text-gray-500">Price:</span>{" "}
                      {tm.price ? `${tm.price} ${tm.currency}` : "Free"}
                    </div>
                  </div>

                  {/* Show the relevant resource limit based on module code */}
                  {(() => {
                    const code = tm.module_code?.toLowerCase();
                    let limitLabel = "";
                    let limitValue: number | null = null;

                    if (code === "cfp" && tm.max_papers) {
                      limitLabel = "Max Papers";
                      limitValue = tm.max_papers;
                    } else if (code === "speakers" && tm.max_speakers) {
                      limitLabel = "Max Speakers";
                      limitValue = tm.max_speakers;
                    } else if (code === "attendees" && tm.max_attendees) {
                      limitLabel = "Max Attendees";
                      limitValue = tm.max_attendees;
                    } else if (code === "volunteers" && tm.max_volunteers) {
                      limitLabel = "Max Volunteers";
                      limitValue = tm.max_volunteers;
                    }

                    return limitValue ? (
                      <div className="mt-2">
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {limitLabel}: {limitValue}
                        </span>
                      </div>
                    ) : null;
                  })()}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditingModule(tm)}
                    className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                    title="Edit"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => revokeMutation.mutate(tm.module_id)}
                    disabled={revokeMutation.isPending}
                    className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                    title="Revoke"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-center py-8">
          No modules assigned yet.
        </p>
      )}

      {/* Edit Module Modal */}
      {editingModule && (
        <EditModuleModal
          tenantId={tenantId}
          module={editingModule}
          onClose={() => {
            setEditingModule(null);
            queryClient.invalidateQueries({
              queryKey: ["tenant-modules", tenantId],
            });
          }}
        />
      )}
    </div>
  );
}

function AssignModuleModal({
  tenantId,
  onClose,
}: {
  tenantId: string;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState<TenantModuleAssign>({
    module_id: "",
    config: {},
    start_date: "",
    end_date: "",
    price: undefined,
    currency: "EUR",
    max_papers: undefined,
    max_speakers: undefined,
    max_attendees: undefined,
    max_volunteers: undefined,
  });

  const { data: availableModules } = useQuery({
    queryKey: ["modules"],
    queryFn: async () => {
      const response =
        await api.get<PaginatedResponse<Module>>("/admin/modules");
      return response.data;
    },
  });

  const { data: platformCurrencies } = useQuery({
    queryKey: ["platform-currencies"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        "/admin/settings/currencies",
        { params: { page_size: 100, is_active: true } },
      );
      return response.data;
    },
  });

  const { data: assignedModules } = useQuery({
    queryKey: ["tenant-modules", tenantId],
    queryFn: async () => {
      const response = await api.get<TenantModule[]>(
        `/admin/tenants/${tenantId}/modules`,
      );
      return response.data;
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (data: TenantModuleAssign) => {
      // Convert date strings to ISO datetime format for the backend
      const payload = {
        module_id: data.module_id,
        config: data.config || {},
        start_date: data.start_date
          ? new Date(data.start_date).toISOString()
          : null,
        end_date: data.end_date ? new Date(data.end_date).toISOString() : null,
        price: data.price ?? null,
        currency: data.currency || "USD",
        max_papers: data.max_papers ?? null,
        max_speakers: data.max_speakers ?? null,
        max_attendees: data.max_attendees ?? null,
        max_volunteers: data.max_volunteers ?? null,
      };
      await api.post(`/admin/tenants/${tenantId}/modules`, payload);
    },
    onSuccess: () => {
      onClose();
    },
    onError: (error: Error) => {
      console.error("Failed to assign module:", error);
      alert("Failed to assign module. Please try again.");
    },
  });

  const assignedModuleIds = assignedModules?.map((m) => m.module_id) || [];
  const unassignedModules =
    availableModules?.items.filter((m) => !assignedModuleIds.includes(m.id)) ||
    [];

  // Get the selected module's code
  const selectedModule = unassignedModules.find(
    (m) => m.id === formData.module_id,
  );
  const selectedModuleCode = selectedModule?.code?.toLowerCase();

  // Determine which resource limit to show based on module code
  const showMaxPapers = selectedModuleCode === "cfp";
  const showMaxSpeakers = selectedModuleCode === "speakers";
  const showMaxAttendees = selectedModuleCode === "attendees";
  const showMaxVolunteers = selectedModuleCode === "volunteers";
  const showResourceLimits =
    showMaxPapers || showMaxSpeakers || showMaxAttendees || showMaxVolunteers;

  // Get the appropriate label for the resource limit
  const getResourceLimitLabel = () => {
    if (showMaxPapers) return "Max Papers";
    if (showMaxSpeakers) return "Max Speakers";
    if (showMaxAttendees) return "Max Attendees";
    if (showMaxVolunteers) return "Max Volunteers";
    return "";
  };

  const getResourceLimitValue = () => {
    if (showMaxPapers) return formData.max_papers;
    if (showMaxSpeakers) return formData.max_speakers;
    if (showMaxAttendees) return formData.max_attendees;
    if (showMaxVolunteers) return formData.max_volunteers;
    return undefined;
  };

  const setResourceLimitValue = (value: number | undefined) => {
    if (showMaxPapers) setFormData({ ...formData, max_papers: value });
    else if (showMaxSpeakers) setFormData({ ...formData, max_speakers: value });
    else if (showMaxAttendees)
      setFormData({ ...formData, max_attendees: value });
    else if (showMaxVolunteers)
      setFormData({ ...formData, max_volunteers: value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    assignMutation.mutate(formData);
  };

  // Reset resource limits when module changes
  const handleModuleChange = (moduleId: string) => {
    setFormData({
      ...formData,
      module_id: moduleId,
      config: {},
      max_papers: undefined,
      max_speakers: undefined,
      max_attendees: undefined,
      max_volunteers: undefined,
    });
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Assign Module"
      size="max-w-lg"
      zIndex="z-[60]"
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Module
            </label>
            <select
              required
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.module_id}
              onChange={(e) => handleModuleChange(e.target.value)}
            >
              <option value="">Select a module</option>
              {unassignedModules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <input
                type="date"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.start_date}
                onChange={(e) =>
                  setFormData({ ...formData, start_date: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                End Date
              </label>
              <input
                type="date"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.end_date}
                onChange={(e) =>
                  setFormData({ ...formData, end_date: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Price
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.price || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    price: e.target.value
                      ? parseFloat(e.target.value)
                      : undefined,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Currency
              </label>
              <select
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.currency}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value })
                }
              >
                {platformCurrencies?.items.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} - {c.name} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showResourceLimits && (
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                Resource Limit
              </h4>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {getResourceLimitLabel()}
                </label>
                <input
                  type="number"
                  min="0"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={getResourceLimitValue() || ""}
                  onChange={(e) =>
                    setResourceLimitValue(
                      e.target.value ? parseInt(e.target.value) : undefined,
                    )
                  }
                  placeholder={`Enter maximum number of ${getResourceLimitLabel().toLowerCase().replace("max ", "")}`}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Leave empty for unlimited
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={assignMutation.isPending || !formData.module_id}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {assignMutation.isPending ? "Assigning..." : "Assign"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditModuleModal({
  tenantId,
  module,
  onClose,
}: {
  tenantId: string;
  module: TenantModule;
  onClose: () => void;
}) {
  // Helper to format date for input
  const formatDateForInput = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toISOString().split("T")[0];
  };

  const [formData, setFormData] = useState<TenantModuleUpdate>({
    is_enabled: module.is_enabled,
    start_date: formatDateForInput(module.start_date),
    end_date: formatDateForInput(module.end_date),
    price: module.price ?? undefined,
    currency: module.currency || "EUR",
    max_papers: module.max_papers ?? undefined,
    max_speakers: module.max_speakers ?? undefined,
    max_attendees: module.max_attendees ?? undefined,
    max_volunteers: module.max_volunteers ?? undefined,
  });

  const { data: platformCurrencies } = useQuery({
    queryKey: ["platform-currencies"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        "/admin/settings/currencies",
        { params: { page_size: 100, is_active: true } },
      );
      return response.data;
    },
  });

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveTimeout, setSaveTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const updateMutation = useMutation({
    mutationFn: async (data: TenantModuleUpdate) => {
      const payload = {
        ...data,
        start_date: data.start_date
          ? new Date(data.start_date).toISOString()
          : null,
        end_date: data.end_date ? new Date(data.end_date).toISOString() : null,
        price: data.price ?? null,
        max_papers: data.max_papers ?? null,
        max_speakers: data.max_speakers ?? null,
        max_attendees: data.max_attendees ?? null,
        max_volunteers: data.max_volunteers ?? null,
      };
      await api.put(
        `/admin/tenants/${tenantId}/modules/${module.module_id}`,
        payload,
      );
    },
    onMutate: () => {
      setSaveStatus("saving");
    },
    onSuccess: () => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  const handleFieldChange = <K extends keyof TenantModuleUpdate>(
    field: K,
    value: TenantModuleUpdate[K],
  ) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);

    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Set new timeout for auto-save (500ms debounce)
    const timeout = setTimeout(() => {
      updateMutation.mutate(newFormData);
    }, 500);
    setSaveTimeout(timeout);
  };

  // Determine which resource limit to show based on module code
  const moduleCode = module.module_code?.toLowerCase();
  const showMaxPapers = moduleCode === "cfp";
  const showMaxSpeakers = moduleCode === "speakers";
  const showMaxAttendees = moduleCode === "attendees";
  const showMaxVolunteers = moduleCode === "volunteers";
  const showResourceLimits =
    showMaxPapers || showMaxSpeakers || showMaxAttendees || showMaxVolunteers;

  const getResourceLimitLabel = () => {
    if (showMaxPapers) return "Max Papers";
    if (showMaxSpeakers) return "Max Speakers";
    if (showMaxAttendees) return "Max Attendees";
    if (showMaxVolunteers) return "Max Volunteers";
    return "";
  };

  const getResourceLimitValue = () => {
    if (showMaxPapers) return formData.max_papers;
    if (showMaxSpeakers) return formData.max_speakers;
    if (showMaxAttendees) return formData.max_attendees;
    if (showMaxVolunteers) return formData.max_volunteers;
    return undefined;
  };

  const setResourceLimitValue = (value: number | undefined) => {
    if (showMaxPapers) handleFieldChange("max_papers", value);
    else if (showMaxSpeakers) handleFieldChange("max_speakers", value);
    else if (showMaxAttendees) handleFieldChange("max_attendees", value);
    else if (showMaxVolunteers) handleFieldChange("max_volunteers", value);
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`Edit Module: ${module.module_name}`}
      size="max-w-lg"
      zIndex="z-[60]"
    >
      <div className="px-6 pb-2 -mt-2 flex justify-between items-center">
        <p className="text-sm text-gray-500">{module.module_code}</p>
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-md">
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-md">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
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
          {saveStatus === "error" && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-md">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Save failed
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* Enabled Toggle */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            Module Enabled
          </label>
          <button
            type="button"
            onClick={() =>
              handleFieldChange("is_enabled", !formData.is_enabled)
            }
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
              formData.is_enabled ? "bg-primary-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                formData.is_enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Start Date
            </label>
            <input
              type="date"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.start_date || ""}
              onChange={(e) =>
                handleFieldChange("start_date", e.target.value || undefined)
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              End Date
            </label>
            <input
              type="date"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.end_date || ""}
              onChange={(e) =>
                handleFieldChange("end_date", e.target.value || undefined)
              }
            />
          </div>
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Price
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.price ?? ""}
              onChange={(e) =>
                handleFieldChange(
                  "price",
                  e.target.value ? parseFloat(e.target.value) : undefined,
                )
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Currency
            </label>
            <select
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.currency || "EUR"}
              onChange={(e) => handleFieldChange("currency", e.target.value)}
            >
              {platformCurrencies?.items.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name} ({c.symbol})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Resource Limits */}
        {showResourceLimits && (
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">
              Resource Limit
            </h4>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {getResourceLimitLabel()}
              </label>
              <input
                type="number"
                min="0"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={getResourceLimitValue() ?? ""}
                onChange={(e) =>
                  setResourceLimitValue(
                    e.target.value ? parseInt(e.target.value) : undefined,
                  )
                }
                placeholder={`Enter maximum number of ${getResourceLimitLabel().toLowerCase().replace("max ", "")}`}
              />
              <p className="mt-1 text-xs text-gray-500">
                Leave empty for unlimited
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

export { AssignModuleModal, EditModuleModal };
