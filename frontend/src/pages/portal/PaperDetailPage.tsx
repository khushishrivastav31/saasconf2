import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import portalApi from "../../config/portalApi";
import { useApplicantAuth } from "../../hooks/useApplicantAuth";
import { usePortalBasePath } from "../../hooks/usePortalBasePath";
import type {
  PortalPaper,
  PortalPaperUpdateRequest,
  PortalConferenceDetail,
  PortalSpeakerFeedbackListResponse,
} from "../../types/portal";
import RichTextEditor from "../../components/common/RichTextEditor";
import RichTextDisplay from "../../components/common/RichTextDisplay";
import { isAxiosError } from "axios";
import { parseApiError } from "../../utils/apiError";
import MediaPreviewModal from "../../components/MediaPreviewModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import PaperStatusLifeline from "../../components/PaperStatusLifeline";
import { INVITATION_STATUS_COLORS } from "../../config/statusColors";
import { ACCEPTED_VIDEO_FORMATS, validateVideo } from "../../utils/mediaValidation";
import { usePortalAuthMedia } from "../../hooks/usePortalAuthMedia";

function PaperDetailPage() {
  const { paperId } = useParams<{
    paperId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { applicant } = useApplicantAuth();
  const basePath = usePortalBasePath();

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editAbstractShort, setEditAbstractShort] = useState("");
  const [editAbstractLong, setEditAbstractLong] = useState("");
  const [editLevel, setEditLevel] = useState("");
  const [editSessionTypeId, setEditSessionTypeId] = useState("");
  const [editLearningObjectives, setEditLearningObjectives] = useState("");
  const [editImportance, setEditImportance] = useState("");
  const [cospeakerEmails, setCospeakerEmails] = useState<string[]>([]);
  const [cospeakerInput, setCospeakerInput] = useState("");
  const [error, setError] = useState("");

  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Media preview modal
  const [mediaPreview, setMediaPreview] = useState<{
    open: boolean;
    src: string | null;
  }>({ open: false, src: null });

  // Confirmation dialogs
  const [showUnsubmitConfirm, setShowUnsubmitConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: paper, isLoading } = useQuery({
    queryKey: ["portal-paper", paperId],
    queryFn: async () => {
      const res = await portalApi.get<PortalPaper>(
        `/portal/papers/${paperId}`,
      );
      return res.data;
    },
  });

  const { data: feedbackData } = useQuery({
    queryKey: ["portal-paper-feedback", paperId],
    queryFn: async () => {
      const res = await portalApi.get<PortalSpeakerFeedbackListResponse>(
        `/portal/papers/${paperId}/feedback`
      );
      return res.data;
    },
    enabled: !!paperId,
  });

  const existingVideoSrc = usePortalAuthMedia(paper?.video_url ?? null);
  const videoPreviewSrc = videoPreview || existingVideoSrc;

  // Load conference detail for session types when editing
  const { data: conferenceDetail } = useQuery({
    queryKey: ["portal-conference-detail", paper?.conference_id],
    queryFn: async () => {
      const res = await portalApi.get<PortalConferenceDetail>(
        `/portal/conferences/${paper!.conference_id}`,
      );
      return res.data;
    },
    enabled: !!paper?.conference_id && (isEditing || paper?.status === "draft"),
  });

  useEffect(() => {
    return () => {
      if (videoPreview) URL.revokeObjectURL(videoPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const validationError = validateVideo(file, 50);
    if (validationError) {
      setVideoError(validationError);
      setVideoFile(null);
      e.target.value = "";
      return;
    }
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const uploadVideo = async (paperId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("entity_type", "paper_video");
    form.append("entity_id", paperId);
    await portalApi.post("/portal/attachments", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  };

  const updateMutation = useMutation({
    mutationFn: async (payload: PortalPaperUpdateRequest) => {
      const res = await portalApi.put<PortalPaper>(
        `/portal/papers/${paperId}`,
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-paper", paperId] });
      queryClient.invalidateQueries({ queryKey: ["portal-papers"] });
      setIsEditing(false);
      setError("");
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, "Failed to update paper."));
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await portalApi.post<PortalPaper>(
        `/portal/papers/${paperId}/submit`,
      );
      return res.data;
    },
    onSuccess: () => {
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["portal-paper", paperId] });
      queryClient.invalidateQueries({ queryKey: ["portal-papers"] });
    },
    onError: (err: unknown) => {
      const detail = isAxiosError(err) ? err.response?.data?.detail : undefined;
      if (detail && typeof detail === "object" && "missing_fields" in detail) {
        const fieldLabels: Record<string, string> = {
          "paper:abstract_short": "Short Abstract",
          "paper:abstract_long": "Detailed Abstract",
          "paper:level": "Level",
          "paper:learning_objectives": "Learning Objectives",
          "paper:importance": "Why is this important?",
          "paper:session_type": "Session Type",
          "paper:topics": "Topics",
          "speaker:bio": "Speaker Bio",
          "speaker:picture": "Speaker Picture",
          "speaker:video": "Speaker Video",
          "speaker:phone": "Speaker Phone",
          "speaker:title": "Speaker Title",
          "speaker:company": "Speaker Company",
        };
        const missingFields = (detail as { missing_fields: string[] }).missing_fields;
        const names = missingFields.map(
          (f: string) => fieldLabels[f] || f,
        );
        setError(`Missing required fields: ${names.join(", ")}`);
      } else {
        setError(
          typeof detail === "string" ? detail : "Failed to submit paper.",
        );
      }
    },
  });

  const unsubmitMutation = useMutation({
    mutationFn: async () => {
      const res = await portalApi.post<PortalPaper>(
        `/portal/papers/${paperId}/unsubmit`,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-paper", paperId] });
      queryClient.invalidateQueries({ queryKey: ["portal-papers"] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, "Failed to revert paper to draft."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await portalApi.delete(`/portal/papers/${paperId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-papers"] });
      navigate(`${basePath}/dashboard`);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, "Failed to delete paper."));
    },
  });

  const startEditing = () => {
    if (!paper) return;
    setEditTitle(paper.title);
    setEditAbstractShort(paper.abstract_short || "");
    setEditAbstractLong(paper.abstract_long || "");
    setEditLevel(paper.level || "");
    setEditSessionTypeId(paper.session_type_id || "");
    setEditLearningObjectives(paper.learning_objectives || "");
    setEditImportance(paper.importance || "");
    setCospeakerEmails(paper.cospeakers.map((cs) => cs.email));
    setVideoFile(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null);
    setVideoError(null);
    setIsEditing(true);
    setError("");
  };

  // Auto-enter edit mode for draft papers
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (paper && paper.status === "draft" && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      startEditing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper]);

  const handleSave = async () => {
    if (videoError) return;

    const payload: PortalPaperUpdateRequest = {
      title: editTitle,
      abstract_short: editAbstractShort || undefined,
      abstract_long: editAbstractLong || undefined,
      level: editLevel || undefined,
      session_type_id: editSessionTypeId || undefined,
      learning_objectives: editLearningObjectives || undefined,
      importance: editImportance || undefined,
      ...(paper?.is_main_speaker ? { cospeaker_emails: cospeakerEmails } : {}),
    };

    try {
      await updateMutation.mutateAsync(payload);

      if (videoFile && paperId) {
        try {
          await uploadVideo(paperId, videoFile);
          setVideoFile(null);
          queryClient.invalidateQueries({
            queryKey: ["portal-paper", paperId],
          });
        } catch {
          // non-fatal
        }
      }
    } catch {
      // error handled by onError
    }
  };

  const handleAddCospeaker = () => {
    const email = cospeakerInput.trim().toLowerCase();
    if (!email) return;
    if (applicant && email === applicant.email.toLowerCase()) {
      setError("You cannot add yourself as a co-speaker");
      return;
    }
    if (cospeakerEmails.length >= 3) {
      setError("Maximum 3 co-speakers allowed");
      return;
    }
    if (cospeakerEmails.includes(email)) {
      setError("This email is already added");
      return;
    }
    setCospeakerEmails([...cospeakerEmails, email]);
    setCospeakerInput("");
    setError("");
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="text-center py-12 text-gray-500">Paper not found.</div>
    );
  }

  const isDraft = paper.status === "draft";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? "Edit Paper" : paper.title}
            {!paper.is_main_speaker && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 align-middle">
                Co-speaker
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500">
            {isEditing
              ? "Edit the paper details below."
              : "View paper details."}
            {!paper.is_main_speaker && (paper.main_speaker_first_name || paper.main_speaker_last_name) && (
              <span className="ml-2 text-gray-400">
                Main speaker: {`${paper.main_speaker_first_name || ""} ${paper.main_speaker_last_name || ""}`.trim()}
              </span>
            )}
          </p>
        </div>
        {isDraft && !isEditing && (
          <div className="flex gap-2">
            <button
              onClick={startEditing}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {submitMutation.isPending ? "Submitting..." : "Submit"}
            </button>
          </div>
        )}
        {paper.status === "submitted" && (
          <button
            onClick={() => setShowUnsubmitConfirm(true)}
            disabled={unsubmitMutation.isPending}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            {unsubmitMutation.isPending ? "Reverting..." : "Revert to Draft"}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {/* Status lifeline */}
        <div className="mb-6">
          <PaperStatusLifeline status={paper.status} />
          {paper.conference_name && (
            <p className="text-xs text-gray-500 mt-2">
              {paper.conference_name}
            </p>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-5">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={500}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Session Type */}
            {conferenceDetail &&
              conferenceDetail.session_types.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Session Type
                  </label>
                  <select
                    value={editSessionTypeId}
                    onChange={(e) => setEditSessionTypeId(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Select session type</option>
                    {conferenceDetail.session_types.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.duration_minutes} min)
                      </option>
                    ))}
                  </select>
                </div>
              )}

            {/* Level */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Level
              </label>
              <select
                value={editLevel}
                onChange={(e) => setEditLevel(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select level...</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="all_levels">All Levels</option>
              </select>
            </div>

            {/* Short Abstract */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Short Abstract
              </label>
              <RichTextEditor
                value={editAbstractShort}
                onChange={(html) => setEditAbstractShort(html)}
                placeholder="Brief summary of your talk..."
                rows={3}
                maxLength={800}
              />
            </div>

            {/* Long Abstract */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Detailed Abstract
              </label>
              <RichTextEditor
                value={editAbstractLong}
                onChange={(html) => setEditAbstractLong(html)}
                placeholder="Detailed description of your talk..."
                rows={6}
                maxLength={8000}
              />
            </div>

            {/* Learning Objectives */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Learning Objectives
              </label>
              <RichTextEditor
                value={editLearningObjectives}
                onChange={(html) => setEditLearningObjectives(html)}
                placeholder="What will attendees learn from this talk?"
                rows={4}
                maxLength={600}
              />
            </div>

            {/* Why Important */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Why is this talk important?
              </label>
              <RichTextEditor
                value={editImportance}
                onChange={(html) => setEditImportance(html)}
                placeholder="Explain why this topic matters..."
                rows={4}
                maxLength={600}
              />
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
                      setMediaPreview({
                        open: true,
                        src: videoPreviewSrc,
                      });
                    }
                  }}
                  disabled={!videoPreviewSrc}
                  className={`w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden flex-shrink-0 bg-gray-50 relative ${
                    videoPreviewSrc
                      ? "cursor-pointer hover:border-primary-400 hover:shadow-md transition-all"
                      : ""
                  }`}
                  title={
                    videoPreviewSrc ? "Click to play video" : undefined
                  }
                >
                  {videoPreviewSrc ? (
                    <>
                      <video
                        src={videoPreviewSrc}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                          <svg
                            className="w-4 h-4 text-gray-700 ml-0.5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <svg
                        className="w-8 h-8"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
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
                    MP4, MOV, WebM, AVI, or MKV. Max 50MB.
                  </p>
                  {videoError && (
                    <p className="mt-1 text-xs text-red-600">{videoError}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Co-speakers (only main speaker can manage) */}
            {paper.is_main_speaker && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Co-speakers{" "}
                  <span className="text-gray-400 font-normal">(max 3)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={cospeakerInput}
                    onChange={(e) => setCospeakerInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCospeaker();
                      }
                    }}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Co-speaker email"
                    disabled={cospeakerEmails.length >= 3}
                  />
                  <button
                    type="button"
                    onClick={handleAddCospeaker}
                    disabled={cospeakerEmails.length >= 3}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                {cospeakerEmails.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {cospeakerEmails.map((email) => {
                      const existing = paper.cospeakers.find(
                        (cs) => cs.email === email,
                      );
                      return (
                        <span
                          key={email}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-200"
                        >
                          {existing ? `${existing.first_name || ""} ${existing.last_name || ""}`.trim() || email : email}
                          {existing && (
                            <span
                              className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${INVITATION_STATUS_COLORS[existing.invitation_status] || "bg-gray-100 text-gray-600"}`}
                            >
                              {existing.invitation_status}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setCospeakerEmails(
                                cospeakerEmails.filter((e) => e !== email),
                              )
                            }
                            className="ml-0.5 text-primary-400 hover:text-primary-700"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                {cospeakerEmails.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    {cospeakerEmails.length}/3 co-speakers selected
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Co-speakers must be registered on this platform. They will
                  receive an invitation.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div>
                {paper.is_main_speaker && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deleteMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
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
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50 transition-colors"
                >
                  {submitMutation.isPending ? "Submitting..." : "Submit Paper"}
                </button>
                <button
                  onClick={handleSave}
                  disabled={
                    updateMutation.isPending || !!videoError
                  }
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 transition-colors"
                >
                  {updateMutation.isPending
                    ? "Saving..."
                    : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Read-only fields */}
            {paper.session_type_name && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase">
                  Session Type
                </dt>
                <dd className="text-sm text-gray-900 mt-0.5">
                  {paper.session_type_name}
                </dd>
              </div>
            )}

            {paper.level && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase">
                  Level
                </dt>
                <dd className="text-sm text-gray-900 mt-0.5 capitalize">
                  {paper.level.replace("_", " ")}
                </dd>
              </div>
            )}

            {paper.abstract_short && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase">
                  Short Abstract
                </dt>
                <dd
                  className="text-sm text-gray-900 mt-0.5 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(paper.abstract_short),
                  }}
                />
              </div>
            )}

            {paper.abstract_long && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase">
                  Detailed Abstract
                </dt>
                <dd
                  className="text-sm text-gray-900 mt-0.5 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(paper.abstract_long),
                  }}
                />
              </div>
            )}

            {paper.learning_objectives && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase">
                  Learning Objectives
                </dt>
                <dd
                  className="text-sm text-gray-900 mt-0.5 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(paper.learning_objectives),
                  }}
                />
              </div>
            )}

            {paper.importance && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase">
                  Importance
                </dt>
                <dd
                  className="text-sm text-gray-900 mt-0.5 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(paper.importance),
                  }}
                />
              </div>
            )}

            {/* Video (read-only display) */}
            {videoPreviewSrc && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Video
                </dt>
                <button
                  type="button"
                  onClick={() =>
                    setMediaPreview({
                      open: true,
                      src: videoPreviewSrc,
                    })
                  }
                  className="w-24 h-24 rounded-lg border-2 border-gray-300 overflow-hidden bg-gray-50 relative cursor-pointer hover:border-primary-400 hover:shadow-md transition-all"
                  title="Click to play video"
                >
                  <video
                    src={videoPreviewSrc}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-gray-700 ml-0.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* Co-speakers */}
            {paper.cospeakers.length > 0 && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Co-speakers
                </dt>
                <div className="flex flex-wrap gap-2">
                  {paper.cospeakers.map((cs) => (
                    <span
                      key={cs.applicant_id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-200"
                    >
                      <span>{`${cs.first_name || ""} ${cs.last_name || ""}`.trim()}</span>
                      <span className="text-primary-400 text-xs">
                        ({cs.email})
                      </span>
                      <span
                        className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${INVITATION_STATUS_COLORS[cs.invitation_status] || "bg-gray-100 text-gray-600"}`}
                      >
                        {cs.invitation_status}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {paper.submitted_at && (
              <div className="pt-4 border-t border-gray-100 text-xs text-gray-400">
                Submitted on{" "}
                {new Date(paper.submitted_at).toLocaleDateString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reviewer Feedback Section */}
      {feedbackData && feedbackData.items.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Reviewer Feedback
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Anonymous feedback from program committee reviewers.
          </p>
          <div className="space-y-4">
            {feedbackData.items.map((feedback, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-lg p-4 bg-gray-50"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Reviewer {index + 1}
                  </span>
                  {feedback.total_score != null && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
                      Score: {feedback.total_score.toFixed(1)}
                    </span>
                  )}
                </div>
                <RichTextDisplay
                  content={feedback.speaker_feedback}
                  className="text-sm text-gray-700"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => navigate(`${basePath}/dashboard`)}
        className="mt-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to My Papers
      </button>

      {/* Media Preview Modal */}
      <MediaPreviewModal
        open={mediaPreview.open}
        onClose={() => setMediaPreview({ open: false, src: null })}
        src={mediaPreview.src}
        type="video"
        alt="Paper video"
      />

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={showUnsubmitConfirm}
        title="Revert to Draft"
        message="Revert this paper to draft? You can edit and resubmit it afterwards."
        confirmLabel="Revert to Draft"
        variant="warning"
        onConfirm={() => {
          setShowUnsubmitConfirm(false);
          unsubmitMutation.mutate();
        }}
        onCancel={() => setShowUnsubmitConfirm(false)}
      />
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Draft"
        message="Are you sure you want to delete this draft? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          deleteMutation.mutate();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

export default PaperDetailPage;
