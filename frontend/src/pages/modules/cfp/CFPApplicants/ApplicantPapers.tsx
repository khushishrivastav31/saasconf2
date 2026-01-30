import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../../../config/api";
import { PAPER_STATUS_COLORS, PAPER_STATUS_LABELS } from "../../../../config/statusColors";
import type { Paper } from "../../../../types";

interface PaperListResponse {
  items: Paper[];
  total: number;
}

interface ConferenceGroup {
  conferenceName: string;
  papers: Paper[];
}

export function ApplicantPapers({ applicantId }: { applicantId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["cfp-applicant-papers", applicantId],
    queryFn: async () => {
      const response = await api.get<PaperListResponse>("/cfp/papers", {
        params: { applicant_id: applicantId },
      });
      return response.data;
    },
  });

  const grouped = useMemo(() => {
    if (!data?.items.length) return [];

    const groups = new Map<string, ConferenceGroup>();

    for (const paper of data.items) {
      const key = paper.conference_name || "Other";
      if (!groups.has(key)) {
        groups.set(key, { conferenceName: key, papers: [] });
      }
      groups.get(key)!.papers.push(paper);
    }

    // Sort papers within each group by submitted_at desc, then created_at desc
    for (const group of groups.values()) {
      group.papers.sort((a, b) => {
        const dateA = a.submitted_at || a.created_at;
        const dateB = b.submitted_at || b.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.conferenceName.localeCompare(b.conferenceName),
    );
  }, [data]);

  const totalPapers = data?.items.length || 0;

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <svg
            className="w-5 h-5 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900">Papers</h3>
          {totalPapers > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
              {totalPapers}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {totalPapers === 0 ? (
        <div className="px-5 py-8 text-center">
          <svg
            className="mx-auto w-8 h-8 text-gray-300 mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-sm text-gray-400">No papers submitted yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {grouped.map((group) => (
            <div key={group.conferenceName}>
              {/* Conference group header */}
              <div className="px-5 py-2.5 bg-gray-50/60 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  {group.conferenceName}
                </span>
                <span className="text-xs text-gray-400">
                  ({group.papers.length})
                </span>
              </div>

              {/* Papers in this group */}
              {group.papers.map((paper) => {
                const isCospeaker = paper.main_speaker_id !== applicantId;
                return (
                  <div
                    key={paper.id}
                    className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50/50 transition-colors"
                  >
                    {/* Status dot */}
                    <div className="pt-1.5 flex-shrink-0">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          paper.status === "accepted"
                            ? "bg-green-500"
                            : paper.status === "rejected"
                              ? "bg-red-500"
                              : paper.status === "submitted" ||
                                  paper.status === "in_evaluation" ||
                                  paper.status === "evaluated"
                                ? "bg-blue-500"
                                : "bg-gray-300"
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {paper.title}
                        </p>
                        {isCospeaker && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 flex-shrink-0">
                            Co-speaker
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        {paper.cfp_title && (
                          <span className="text-xs text-gray-500">
                            {paper.cfp_title}
                          </span>
                        )}
                        {paper.session_type_name && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">
                            {paper.session_type_name}
                          </span>
                        )}
                        {paper.submitted_at ? (
                          <span className="text-xs text-gray-400">
                            Submitted{" "}
                            {new Date(paper.submitted_at).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">
                            Created{" "}
                            {new Date(paper.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 mt-0.5 ${
                        PAPER_STATUS_COLORS[paper.status] ||
                        "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {PAPER_STATUS_LABELS[paper.status] ||
                        paper.status.replace("_", " ")}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
