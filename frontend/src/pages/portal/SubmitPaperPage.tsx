import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePortalBasePath } from "../../hooks/usePortalBasePath";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import portalApi from "../../config/portalApi";
import { useApplicantAuth } from "../../hooks/useApplicantAuth";
import RichTextEditor from "../../components/common/RichTextEditor";
import type {
  PortalConferenceSummary,
  PortalConferenceDetail,
  PortalPaper,
  PortalPaperCreateRequest,
} from "../../types/portal";
import { parseApiError } from "../../utils/apiError";

function SubmitPaperPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { applicant } = useApplicantAuth();
  const basePath = usePortalBasePath();

  const [selectedConferenceId, setSelectedConferenceId] = useState("");
  const [selectedCfpId, setSelectedCfpId] = useState("");
  const [sessionTypeId, setSessionTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [abstractShort, setAbstractShort] = useState("");
  const [abstractLong, setAbstractLong] = useState("");
  const [level, setLevel] = useState("");
  const [learningObjectives, setLearningObjectives] = useState("");
  const [importance, setImportance] = useState("");
  const [cospeakerEmails, setCospeakerEmails] = useState<string[]>([]);
  const [cospeakerInput, setCospeakerInput] = useState("");
  const [error, setError] = useState("");

  // Load conferences
  const { data: conferences } = useQuery({
    queryKey: ["portal-conferences"],
    queryFn: async () => {
      const res = await portalApi.get<PortalConferenceSummary[]>(
        "/portal/conferences",
      );
      return res.data;
    },
  });

  // Load conference detail (session types) when a conference is selected
  const { data: conferenceDetail } = useQuery({
    queryKey: ["portal-conference-detail", selectedConferenceId],
    queryFn: async () => {
      const res = await portalApi.get<PortalConferenceDetail>(
        `/portal/conferences/${selectedConferenceId}`,
      );
      return res.data;
    },
    enabled: !!selectedConferenceId,
  });

  const selectedConference = conferences?.find(
    (c) => c.id === selectedConferenceId,
  );
  const availableCfps = selectedConference?.cfps.filter(
    (cfp) => cfp.status === "open",
  );
  const selectedCfp = availableCfps?.find((c) => c.id === selectedCfpId);
  const requiredPaperFields = selectedCfp?.required_paper_fields || [];
  const requiredSpeakerFields = selectedCfp?.required_speaker_fields || [];

  const isRequired = (field: string) => requiredPaperFields.includes(field);

  // Check missing speaker profile fields
  const missingSpeakerFields = requiredSpeakerFields.filter((field) => {
    if (!applicant) return true;
    if (field === "bio") return !applicant.bio;
    if (field === "phone") return !applicant.phone;
    if (field === "title") return !applicant.title;
    if (field === "company") return !applicant.company;
    if (field === "picture") return !applicant.picture_url;
    if (field === "video") return !applicant.video_url;
    return false;
  });

  const speakerFieldLabels: Record<string, string> = {
    bio: "Short Bio",
    picture: "Picture",
    video: "Video",
    phone: "Phone",
    title: "Title / Position",
    company: "Company / Organization",
  };

  const createMutation = useMutation({
    mutationFn: async (payload: PortalPaperCreateRequest) => {
      const res = await portalApi.post<PortalPaper>("/portal/papers", payload);
      return res.data;
    },
    onSuccess: (paper) => {
      queryClient.invalidateQueries({ queryKey: ["portal-papers"] });
      navigate(`${basePath}/papers/${paper.id}`);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, "Failed to create paper. Please try again."));
    },
  });

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

  const handleRemoveCospeaker = (email: string) => {
    setCospeakerEmails(cospeakerEmails.filter((e) => e !== email));
  };

  const handleSubmit = () => {
    if (!selectedCfpId || !title.trim()) {
      setError("Please select a CFP and provide a title");
      return;
    }
    setError("");

    const payload: PortalPaperCreateRequest = {
      cfp_id: selectedCfpId,
      title: title.trim(),
      ...(sessionTypeId ? { session_type_id: sessionTypeId } : {}),
      ...(abstractShort ? { abstract_short: abstractShort } : {}),
      ...(abstractLong ? { abstract_long: abstractLong } : {}),
      ...(level ? { level } : {}),
      ...(learningObjectives ? { learning_objectives: learningObjectives } : {}),
      ...(importance ? { importance } : {}),
      ...(cospeakerEmails.length > 0
        ? { cospeaker_emails: cospeakerEmails }
        : {}),
    };

    createMutation.mutate(payload);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Submit New Paper</h2>
          <p className="text-sm text-gray-500">Fill in the details to create a new paper submission.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-4">
          {error}
        </div>
      )}

      {selectedCfpId && missingSpeakerFields.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm mb-4">
          <strong>Missing required profile fields:</strong>{" "}
          {missingSpeakerFields.map((f) => speakerFieldLabels[f] || f).join(", ")}.
          Please update your{" "}
          <a href={`${basePath}/profile`} className="underline font-medium">
            profile
          </a>{" "}
          before submitting.
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
        {/* Conference Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Conference
          </label>
          <select
            value={selectedConferenceId}
            onChange={(e) => {
              setSelectedConferenceId(e.target.value);
              setSelectedCfpId("");
              setSessionTypeId("");
            }}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Select a conference</option>
            {conferences?.map((conf) => (
              <option key={conf.id} value={conf.id}>
                {conf.name}
                {conf.abbreviation ? ` (${conf.abbreviation})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* CFP Selection */}
        {selectedConferenceId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Call for Papers
            </label>
            {availableCfps && availableCfps.length > 0 ? (
              <select
                value={selectedCfpId}
                onChange={(e) => setSelectedCfpId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select a CFP</option>
                {availableCfps.map((cfp) => (
                  <option key={cfp.id} value={cfp.id}>
                    {cfp.title}
                    {cfp.close_date
                      ? ` (closes ${new Date(cfp.close_date).toLocaleDateString()})`
                      : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-500">
                No open CFPs for this conference.
              </p>
            )}
          </div>
        )}

        {/* Session Type */}
        {conferenceDetail &&
          conferenceDetail.session_types.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Session Type{isRequired("session_type") && <span className="text-red-500"> *</span>}
              </label>
              <select
                value={sessionTypeId}
                onChange={(e) => setSessionTypeId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select a session type</option>
                {conferenceDetail.session_types.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.duration_minutes} min)
                  </option>
                ))}
              </select>
            </div>
          )}

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title *
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            placeholder="Your paper title"
          />
        </div>

        {/* Short Abstract */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Short Abstract{isRequired("abstract_short") && <span className="text-red-500"> *</span>}
          </label>
          <RichTextEditor
            value={abstractShort}
            onChange={(html) => setAbstractShort(html)}
            placeholder="Brief summary of your talk..."
            rows={3}
            maxLength={800}
          />
        </div>

        {/* Long Abstract */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Detailed Abstract{isRequired("abstract_long") && <span className="text-red-500"> *</span>}
          </label>
          <RichTextEditor
            value={abstractLong}
            onChange={(html) => setAbstractLong(html)}
            placeholder="Detailed description of your paper..."
            rows={6}
            maxLength={8000}
          />
        </div>

        {/* Level */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Level{isRequired("level") && <span className="text-red-500"> *</span>}
          </label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Select level</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
            <option value="all_levels">All Levels</option>
          </select>
        </div>

        {/* Learning Objectives */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Learning Objectives{isRequired("learning_objectives") && <span className="text-red-500"> *</span>}
          </label>
          <RichTextEditor
            value={learningObjectives}
            onChange={(html) => setLearningObjectives(html)}
            placeholder="What will attendees learn?"
            rows={3}
            maxLength={600}
          />
        </div>

        {/* Importance */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Why is this important?{isRequired("importance") && <span className="text-red-500"> *</span>}
          </label>
          <RichTextEditor
            value={importance}
            onChange={(html) => setImportance(html)}
            placeholder="Why should this talk be selected?"
            rows={3}
            maxLength={600}
          />
        </div>

        {/* Co-speakers */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Co-speakers (max 3)
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
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
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
              {cospeakerEmails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-200"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => handleRemoveCospeaker(email)}
                    className="text-primary-400 hover:text-primary-600"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Co-speakers must be registered on this platform. They will receive an invitation.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => navigate(`${basePath}/dashboard`)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 transition-colors"
          >
            {createMutation.isPending ? "Saving..." : "Save as Draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SubmitPaperPage;
