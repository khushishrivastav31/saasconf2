import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "../../../config/api";
import type { Conference, ConferenceUpdate } from "../../../types";
import RichTextEditor from "../../../components/common/RichTextEditor";
import ConferenceLogo from "../../../components/ConferenceLogo";
import { parseApiError } from "../../../utils/apiError";

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

  // Logo upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoStatus, setLogoStatus] = useState<"idle" | "uploading" | "deleting" | "error">("idle");
  const [logoError, setLogoError] = useState<string | null>(null);

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post(`/conferences/${conference.id}/logo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onMutate: () => {
      setLogoStatus("uploading");
      setLogoError(null);
    },
    onSuccess: () => {
      setLogoStatus("idle");
      onUpdate();
    },
    onError: (err) => {
      setLogoStatus("error");
      setLogoError(parseApiError(err));
      setTimeout(() => setLogoStatus("idle"), 3000);
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/conferences/${conference.id}/logo`);
    },
    onMutate: () => {
      setLogoStatus("deleting");
      setLogoError(null);
    },
    onSuccess: () => {
      setLogoStatus("idle");
      onUpdate();
    },
    onError: (err) => {
      setLogoStatus("error");
      setLogoError(parseApiError(err));
      setTimeout(() => setLogoStatus("idle"), 3000);
    },
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadLogoMutation.mutate(file);
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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
        </div>}
      </div>

      <div className="space-y-4">
        {/* Logo */}
        <div className="border-b pb-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Conference Logo</h5>
          <div className="flex items-start gap-4">
            {/* Logo preview - flexible container for various aspect ratios */}
            <div className="min-w-24 max-w-48 h-24 border border-gray-300 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center p-2">
              <ConferenceLogo logoUrl={conference.logo_url} />
            </div>

            {/* Upload/Delete controls */}
            {isAdmin && (
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleLogoUpload}
                  className="hidden"
                  id="logo-upload"
                />
                <label
                  htmlFor="logo-upload"
                  className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer ${
                    logoStatus === "uploading"
                      ? "bg-gray-100 text-gray-400 cursor-wait"
                      : "bg-primary-600 text-white hover:bg-primary-700"
                  }`}
                >
                  {logoStatus === "uploading" ? (
                    <>
                      <svg className="animate-spin h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {conference.logo_url ? "Replace Logo" : "Upload Logo"}
                    </>
                  )}
                </label>

                {conference.logo_url && (
                  <button
                    type="button"
                    onClick={() => deleteLogoMutation.mutate()}
                    disabled={logoStatus === "deleting"}
                    className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md ${
                      logoStatus === "deleting"
                        ? "bg-gray-100 text-gray-400 cursor-wait"
                        : "bg-white text-red-600 border border-red-300 hover:bg-red-50"
                    }`}
                  >
                    {logoStatus === "deleting" ? (
                      <>
                        <svg className="animate-spin h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Deleting...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete Logo
                      </>
                    )}
                  </button>
                )}

                {logoError && (
                  <p className="text-sm text-red-600">{logoError}</p>
                )}

                <p className="text-xs text-gray-500">
                  JPEG, PNG, WebP, or GIF. Max 10MB.
                </p>
              </div>
            )}
          </div>
        </div>

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
