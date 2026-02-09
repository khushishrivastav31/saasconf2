import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../../../config/api";
import { useAuthMedia } from "../../../../hooks/useAuthMedia";
import { validatePhone } from "../../../../utils/validators";
import { ACCEPTED_IMAGE_FORMATS, ACCEPTED_VIDEO_FORMATS, validateImage, validateVideo } from "../../../../utils/mediaValidation";
import RichTextEditor from "../../../../components/common/RichTextEditor";
import MediaPreviewModal from "../../../../components/MediaPreviewModal";
import { ErrorBanner } from "../../../../components/common/ErrorBanner";
import { DeleteIcon } from "../../../ConferenceDetail/icons";
import type { Applicant, PronounOption } from "../../../../types";
import { SPEAKER_SOCIAL_PLATFORMS } from "../../../../config/socialPlatforms";

export interface ApplicantFormData {
  first_name: string;
  last_name: string;
  pronouns: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  bio: string;
  password: string;
  allow_out_of_timeframe: boolean;
  social_links: Record<string, string>;
  needs_accessibility: boolean;
  accessibility_details: string;
  agrees_to_recording: boolean;
}

const emptyForm: ApplicantFormData = {
  first_name: "",
  last_name: "",
  pronouns: "",
  email: "",
  phone: "",
  title: "",
  company: "",
  bio: "",
  password: "",
  allow_out_of_timeframe: false,
  social_links: {},
  needs_accessibility: false,
  accessibility_details: "",
  agrees_to_recording: false,
};

// Convert ApplicantSocialLinks (with nullable values) to Record<string, string>
function convertSocialLinks(links: object | null | undefined): Record<string, string> {
  if (!links) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(links)) {
    if (value && typeof value === "string" && value.trim()) {
      result[key] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Inline form for creating or editing an applicant
// ---------------------------------------------------------------------------

export function ApplicantForm({
  applicant,
  onSave,
  onCancel,
  onDelete,
  isSaving,
  isDeleting,
  error,
  conferenceId,
}: {
  applicant: Applicant | null; // null = creating
  onSave: (data: ApplicantFormData, pictureFile: File | null, videoFile: File | null) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isSaving: boolean;
  isDeleting?: boolean;
  error: string | null;
  conferenceId?: string;
}) {
  const isEditing = !!applicant;
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: pronounOptions } = useQuery({
    queryKey: ["pronoun-options", conferenceId],
    queryFn: async () => {
      const response = await api.get<{ items: PronounOption[] }>(
        `/conferences/${conferenceId}/settings/pronouns`,
      );
      return response.data.items.filter((p) => p.is_active);
    },
    enabled: !!conferenceId,
  });

  const [formData, setFormData] = useState<ApplicantFormData>(
    applicant
      ? {
          first_name: applicant.first_name,
          last_name: applicant.last_name,
          pronouns: applicant.pronouns || "",
          email: applicant.email,
          phone: applicant.phone || "",
          title: applicant.title || "",
          company: applicant.company || "",
          bio: applicant.bio || "",
          password: "",
          allow_out_of_timeframe: applicant.allow_out_of_timeframe,
          social_links: convertSocialLinks(applicant.social_links),
          needs_accessibility: applicant.needs_accessibility,
          accessibility_details: applicant.accessibility_details || "",
          agrees_to_recording: applicant.agrees_to_recording,
        }
      : emptyForm,
  );
  const [addPlatform, setAddPlatform] = useState("");
  const [customPlatformName, setCustomPlatformName] = useState("");
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Media preview modal state
  const [mediaPreview, setMediaPreview] = useState<{
    open: boolean;
    src: string | null;
    type: "image" | "video";
  }>({ open: false, src: null, type: "image" });

  const existingPictureSrc = useAuthMedia(applicant?.picture_url ?? null);
  const existingVideoSrc = useAuthMedia(applicant?.video_url ?? null);
  const picturePreviewSrc = picturePreview || existingPictureSrc;
  const videoPreviewSrc = videoPreview || existingVideoSrc;

  // Reset form when the applicant changes (switching between applicants in sidebar)
  useEffect(() => {
    setFormData(
      applicant
        ? {
            first_name: applicant.first_name,
            last_name: applicant.last_name,
            pronouns: applicant.pronouns || "",
            email: applicant.email,
            phone: applicant.phone || "",
            title: applicant.title || "",
            company: applicant.company || "",
            bio: applicant.bio || "",
            password: "",
            allow_out_of_timeframe: applicant.allow_out_of_timeframe,
            social_links: convertSocialLinks(applicant.social_links),
            needs_accessibility: applicant.needs_accessibility,
            accessibility_details: applicant.accessibility_details || "",
            agrees_to_recording: applicant.agrees_to_recording,
          }
        : emptyForm,
    );
    setPictureFile(null);
    if (picturePreview) URL.revokeObjectURL(picturePreview);
    setPicturePreview(null);
    setPictureError(null);
    setVideoFile(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null);
    setVideoError(null);
    setPhoneError(null);
    setAddPlatform("");
    setCustomPlatformName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant?.id]);

  useEffect(() => {
    return () => {
      if (picturePreview) URL.revokeObjectURL(picturePreview);
      if (videoPreview) URL.revokeObjectURL(videoPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setPictureError(null);

    if (picturePreview) {
      URL.revokeObjectURL(picturePreview);
      setPicturePreview(null);
    }

    if (!file) {
      setPictureFile(null);
      return;
    }

    const validationError = await validateImage(file);
    if (validationError) {
      setPictureError(validationError);
      setPictureFile(null);
      e.target.value = "";
      return;
    }

    setPictureFile(file);
    setPicturePreview(URL.createObjectURL(file));
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setVideoError(null);

    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
      setVideoPreview(null);
    }

    if (!file) {
      setVideoFile(null);
      return;
    }

    const validationError = validateVideo(file, 5);
    if (validationError) {
      setVideoError(validationError);
      setVideoFile(null);
      e.target.value = "";
      return;
    }

    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.first_name.trim() || !formData.last_name.trim() || !formData.email.trim()) return;
    if (!isEditing && !formData.password.trim()) return;
    if (pictureError || videoError || phoneError) return;

    setSaveStatus("saving");
    onSave(formData, pictureFile, videoFile);
  };

  // Track save completion based on isSaving prop changes and error
  useEffect(() => {
    if (saveStatus === "saving" && !isSaving) {
      if (error) {
        setSaveStatus("error");
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("saved");
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      }
    }
  }, [isSaving, error, saveStatus]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <ErrorBanner message={error} />

      {/* Picture */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Picture
        </label>
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => {
              if (picturePreviewSrc) {
                setMediaPreview({ open: true, src: picturePreviewSrc, type: "image" });
              }
            }}
            disabled={!picturePreviewSrc}
            className={`w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden flex-shrink-0 bg-gray-50 ${
              picturePreviewSrc ? "cursor-pointer hover:border-primary-400 hover:shadow-md transition-all" : ""
            }`}
            title={picturePreviewSrc ? "Click to view full size" : undefined}
          >
            {picturePreviewSrc ? (
              <img src={picturePreviewSrc} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
          </button>
          <div className="flex-1">
            <input
              type="file"
              accept={ACCEPTED_IMAGE_FORMATS}
              onChange={handlePictureChange}
              className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />
            <p className="mt-1 text-xs text-gray-400">
              JPEG, PNG, WebP, TIFF, or BMP. Min 600×600px (300 DPI).
            </p>
            {pictureError && <p className="mt-1 text-xs text-red-600">{pictureError}</p>}
          </div>
        </div>
      </div>

      {/* Video */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Video
        </label>
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => {
              if (videoPreviewSrc) {
                setMediaPreview({ open: true, src: videoPreviewSrc, type: "video" });
              }
            }}
            disabled={!videoPreviewSrc}
            className={`w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden flex-shrink-0 bg-gray-50 relative ${
              videoPreviewSrc ? "cursor-pointer hover:border-primary-400 hover:shadow-md transition-all" : ""
            }`}
            title={videoPreviewSrc ? "Click to play video" : undefined}
          >
            {videoPreviewSrc ? (
              <>
                <video
                  src={videoPreviewSrc}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
                {/* Play icon overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                    <svg className="w-4 h-4 text-gray-700 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
          </button>
          <div className="flex-1">
            <input
              type="file"
              accept={ACCEPTED_VIDEO_FORMATS}
              onChange={handleVideoChange}
              className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />
            <p className="mt-1 text-xs text-gray-400">
              MP4, MOV, WebM, AVI, or MKV. Max 5MB.
            </p>
            {videoError && <p className="mt-1 text-xs text-red-600">{videoError}</p>}
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.first_name}
            onChange={(e) => setFormData((d) => ({ ...d, first_name: e.target.value }))}
            className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.last_name}
            onChange={(e) => setFormData((d) => ({ ...d, last_name: e.target.value }))}
            className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pronouns
          </label>
          <select
            value={formData.pronouns}
            onChange={(e) => setFormData((d) => ({ ...d, pronouns: e.target.value }))}
            className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Select pronouns...</option>
            {pronounOptions?.map((opt) => (
              <option key={opt.id} value={opt.name}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData((d) => ({ ...d, email: e.target.value }))}
            className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => {
              const value = e.target.value;
              setFormData((d) => ({ ...d, phone: value }));
              setPhoneError(validatePhone(value));
            }}
            className={`w-full border rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              phoneError ? "border-red-300" : "border-gray-300"
            }`}
            placeholder="+491234545 or 00491234566"
          />
          {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData((d) => ({ ...d, title: e.target.value }))}
            className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="e.g. Senior Developer"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company
          </label>
          <input
            type="text"
            value={formData.company}
            onChange={(e) => setFormData((d) => ({ ...d, company: e.target.value }))}
            className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password{" "}
            {isEditing ? (
              <span className="text-gray-400 font-normal">(leave blank to keep current)</span>
            ) : (
              <span className="text-red-500">*</span>
            )}
          </label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData((d) => ({ ...d, password: e.target.value }))}
            className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            required={!isEditing}
            minLength={6}
          />
        </div>
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Short Bio
        </label>
        <RichTextEditor
          value={formData.bio}
          onChange={(html) => setFormData((d) => ({ ...d, bio: html }))}
          placeholder="Brief biography..."
          rows={4}
        />
      </div>

      {/* Social Media Links - Dynamic Add/Remove */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Social Media Profiles
        </label>

        {/* Existing social links */}
        {(() => {
          const knownKeys = new Set(SPEAKER_SOCIAL_PLATFORMS.map((p) => p.key));
          const allEntries: { key: string; label: string; placeholder: string }[] = [];

          // First add known platforms that are present
          for (const p of SPEAKER_SOCIAL_PLATFORMS) {
            if (formData.social_links[p.key] !== undefined) {
              allEntries.push(p);
            }
          }
          // Then add custom keys
          for (const key of Object.keys(formData.social_links)) {
            if (!knownKeys.has(key)) {
              allEntries.push({
                key,
                label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
                placeholder: "Enter URL...",
              });
            }
          }

          const availablePlatforms = SPEAKER_SOCIAL_PLATFORMS.filter(
            (p) => formData.social_links[p.key] === undefined,
          );

          const handleAddPlatform = () => {
            const key =
              addPlatform === "__custom__"
                ? customPlatformName.trim().toLowerCase().replace(/\s+/g, "_")
                : addPlatform;
            if (!key || formData.social_links[key] !== undefined) return;
            setFormData((d) => ({
              ...d,
              social_links: { ...d.social_links, [key]: "" },
            }));
            setAddPlatform("");
            setCustomPlatformName("");
          };

          const handleDeletePlatform = (key: string) => {
            setFormData((d) => {
              const newLinks = { ...d.social_links };
              delete newLinks[key];
              return { ...d, social_links: newLinks };
            });
          };

          return (
            <>
              {allEntries.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {allEntries.map((platform) => (
                    <div key={platform.key} className="flex items-center gap-2">
                      <label className="block text-xs text-gray-500 w-24 flex-shrink-0">
                        {platform.label}
                      </label>
                      <input
                        type="url"
                        placeholder={platform.placeholder}
                        className="flex-1 border border-gray-300 rounded-md py-1.5 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        value={formData.social_links[platform.key] || ""}
                        onChange={(e) =>
                          setFormData((d) => ({
                            ...d,
                            social_links: {
                              ...d.social_links,
                              [platform.key]: e.target.value,
                            },
                          }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() => handleDeletePlatform(platform.key)}
                        className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title={`Remove ${platform.label}`}
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-sm text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200 mb-3">
                  No social media links added yet.
                </div>
              )}

              {/* Add new social link */}
              <div className="flex items-center gap-2">
                <select
                  value={addPlatform}
                  onChange={(e) => {
                    setAddPlatform(e.target.value);
                    if (e.target.value !== "__custom__") setCustomPlatformName("");
                  }}
                  className="border border-gray-300 rounded-md py-1.5 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select platform...</option>
                  {availablePlatforms.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                  <option value="__custom__">Custom...</option>
                </select>
                {addPlatform === "__custom__" && (
                  <input
                    type="text"
                    placeholder="Platform name"
                    value={customPlatformName}
                    onChange={(e) => setCustomPlatformName(e.target.value)}
                    className="border border-gray-300 rounded-md py-1.5 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-32"
                  />
                )}
                <button
                  type="button"
                  onClick={handleAddPlatform}
                  disabled={
                    !addPlatform ||
                    (addPlatform === "__custom__" && !customPlatformName.trim())
                  }
                  className="inline-flex items-center px-2.5 py-1.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  <svg
                    className="w-4 h-4 mr-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add
                </button>
              </div>
            </>
          );
        })()}
      </div>

      {/* Needs Accessibility */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="needs_accessibility"
            checked={formData.needs_accessibility}
            onChange={(e) => {
              const checked = e.target.checked;
              setFormData((d) => ({
                ...d,
                needs_accessibility: checked,
                accessibility_details: checked ? d.accessibility_details : "",
              }));
            }}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="needs_accessibility" className="flex-1">
            <span className="block text-sm font-medium text-gray-700">
              Needs accessibility accommodations
            </span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Check if this user requires accessibility accommodations for the conference.
            </span>
          </label>
        </div>

        {/* Accessibility Details - shown when checkbox is checked */}
        {formData.needs_accessibility && (
          <div className="ml-7">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Please describe your accessibility needs
            </label>
            <textarea
              value={formData.accessibility_details}
              onChange={(e) =>
                setFormData((d) => ({ ...d, accessibility_details: e.target.value }))
              }
              placeholder="e.g., wheelchair access, sign language interpreter, dietary requirements, etc."
              rows={3}
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        )}
      </div>

      {/* Agrees to Recording */}
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="agrees_to_recording"
          checked={formData.agrees_to_recording}
          onChange={(e) => setFormData((d) => ({ ...d, agrees_to_recording: e.target.checked }))}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="agrees_to_recording" className="flex-1">
          <span className="block text-sm font-medium text-gray-700">
            Agrees to session recording
          </span>
          <span className="block text-xs text-gray-500 mt-0.5">
            The user agrees that any selected session from them can be recorded and shared publicly.
          </span>
        </label>
      </div>

      {/* Allow Out-of-Timeframe Submissions */}
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="allow_out_of_timeframe"
          checked={formData.allow_out_of_timeframe}
          onChange={(e) => setFormData((d) => ({ ...d, allow_out_of_timeframe: e.target.checked }))}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="allow_out_of_timeframe" className="flex-1">
          <span className="block text-sm font-medium text-gray-700">
            Allow out-of-timeframe submissions
          </span>
          <span className="block text-xs text-gray-500 mt-0.5">
            Allow this user to submit papers even outside the CFP open/close dates.
          </span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <div>
          {isEditing && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <DeleteIcon />
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || !!pictureError || !!videoError || !!phoneError}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 transition-all duration-300 inline-flex items-center gap-2 ${
              saveStatus === "saved"
                ? "bg-green-600 hover:bg-green-700"
                : saveStatus === "error"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-primary-600 hover:bg-primary-700"
            }`}
          >
            {saveStatus === "saving" && (
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {saveStatus === "saved" && (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {saveStatus === "error" && (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "saved"
                ? "Saved!"
                : saveStatus === "error"
                  ? "Error"
                  : isEditing
                    ? "Save Changes"
                    : "Create User"}
          </button>
        </div>
      </div>

      {/* Media Preview Modal */}
      <MediaPreviewModal
        open={mediaPreview.open}
        onClose={() => setMediaPreview({ open: false, src: null, type: "image" })}
        src={mediaPreview.src}
        type={mediaPreview.type}
        alt="Applicant media"
      />
    </form>
  );
}
