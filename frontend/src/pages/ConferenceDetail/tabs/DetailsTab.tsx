import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "../../../config/api";
import type { Conference, ConferenceUpdate } from "../../../types";
import RichTextEditor from "../../../components/common/RichTextEditor";

function ConferenceDetailsTab({
  conference,
  onUpdate,
  isAdmin,
}: {
  conference: Conference;
  onUpdate: () => void;
  isAdmin: boolean;
}) {
  const [formData, setFormData] = useState<ConferenceUpdate>({
    name: conference.name,
    abbreviation: conference.abbreviation || "",
    description: conference.description || "",
    website: conference.website || "",
    start_date: conference.start_date || "",
    end_date: conference.end_date || "",
    venue_name: conference.venue_name || "",
    venue_address: conference.venue_address || "",
    city: conference.city || "",
    country: conference.country || "",
    timezone: conference.timezone || "",
    venue_type: conference.venue_type,
    virtual_platform_url: conference.virtual_platform_url || "",
  });

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveTimeout, setSaveTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const updateMutation = useMutation({
    mutationFn: async (data: ConferenceUpdate) => {
      await api.put(`/conferences/${conference.id}`, data);
    },
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => {
      setSaveStatus("saved");
      onUpdate();
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  const handleFieldChange = (
    field: keyof ConferenceUpdate,
    value: string | boolean | undefined,
  ) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);

    if (saveTimeout) clearTimeout(saveTimeout);

    const timeout = setTimeout(() => {
      updateMutation.mutate(newFormData);
    }, 500);
    setSaveTimeout(timeout);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">
          Conference Details
        </h4>
        {isAdmin && <div className="flex items-center gap-2">
          {saveStatus === "saving" && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <svg
                className="animate-spin h-3 w-3"
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
            <span className="text-xs text-green-600 flex items-center gap-1">
              <svg
                className="h-3 w-3"
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
            <span className="text-xs text-red-600">Save failed</span>
          )}
        </div>}
      </div>

      <div className="space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Conference Name
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.name}
              onChange={(e) => handleFieldChange("name", e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Abbreviation
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.abbreviation}
              onChange={(e) =>
                handleFieldChange("abbreviation", e.target.value)
              }
              disabled={!isAdmin}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <RichTextEditor
            value={formData.description || ""}
            onChange={(html) => handleFieldChange("description", html)}
            rows={3}
            disabled={!isAdmin}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Website
          </label>
          <input
            type="text"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            value={formData.website}
            onChange={(e) => handleFieldChange("website", e.target.value)}
            disabled={!isAdmin}
          />
        </div>

        {/* Dates */}
        <div className="border-t pt-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Dates</h5>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <input
                type="date"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.start_date}
                onChange={(e) => {
                  const newStart = e.target.value;
                  const adjustEnd = formData.end_date && newStart && formData.end_date < newStart;
                  const newFormData = {
                    ...formData,
                    start_date: newStart,
                    ...(adjustEnd ? { end_date: newStart } : {}),
                  };
                  setFormData(newFormData);
                  if (saveTimeout) clearTimeout(saveTimeout);
                  const timeout = setTimeout(() => {
                    updateMutation.mutate(newFormData);
                  }, 500);
                  setSaveTimeout(timeout);
                }}
                disabled={!isAdmin}
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
                min={formData.start_date}
                onChange={(e) => handleFieldChange("end_date", e.target.value)}
                disabled={!isAdmin}
              />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="border-t pt-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Location</h5>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Venue Name
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.venue_name}
                onChange={(e) =>
                  handleFieldChange("venue_name", e.target.value)
                }
                disabled={!isAdmin}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Address
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.venue_address}
                onChange={(e) =>
                  handleFieldChange("venue_address", e.target.value)
                }
                disabled={!isAdmin}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  City
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.city}
                  onChange={(e) => handleFieldChange("city", e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Country
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.country}
                  onChange={(e) => handleFieldChange("country", e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Timezone
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="e.g., Europe/Berlin"
                  value={formData.timezone}
                  onChange={(e) =>
                    handleFieldChange("timezone", e.target.value)
                  }
                  disabled={!isAdmin}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700">
                Venue Type
              </label>
              <select
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.venue_type}
                onChange={(e) =>
                  handleFieldChange("venue_type", e.target.value)
                }
                disabled={!isAdmin}
              >
                <option value="onsite">Onsite</option>
                <option value="virtual">Virtual</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            {(formData.venue_type === "virtual" || formData.venue_type === "hybrid") && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Virtual Platform URL
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.virtual_platform_url}
                  onChange={(e) =>
                    handleFieldChange("virtual_platform_url", e.target.value)
                  }
                  disabled={!isAdmin}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConferenceDetailsTab;
