import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import portalApi from "../../config/portalApi";
import { usePortalBasePath } from "../../hooks/usePortalBasePath";
import { formatDate } from "../../utils/formatDate";
import type { PortalPaperListResponse, PortalPaper } from "../../types/portal";
import PaperStatusLifeline from "../../components/PaperStatusLifeline";

interface ConferenceGroup {
  conferenceId: string | null;
  conferenceName: string;
  papers: PortalPaper[];
}

function DashboardPage() {
  const basePath = usePortalBasePath();
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["portal-papers"],
    queryFn: async () => {
      const res =
        await portalApi.get<PortalPaperListResponse>("/portal/papers");
      return res.data;
    },
  });

  const papers = useMemo(() => data?.items || [], [data?.items]);
  const paperCount = papers.length;

  const filteredPapers = useMemo(() => {
    if (!searchQuery.trim()) return papers;
    const q = searchQuery.toLowerCase();
    return papers.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.conference_name && p.conference_name.toLowerCase().includes(q)) ||
        (p.cfp_title && p.cfp_title.toLowerCase().includes(q)) ||
        (p.session_type_name && p.session_type_name.toLowerCase().includes(q)),
    );
  }, [papers, searchQuery]);

  const groupedByConference = useMemo(() => {
    const groups = new Map<string, ConferenceGroup>();

    for (const paper of filteredPapers) {
      const key = paper.conference_id || "__none__";
      if (!groups.has(key)) {
        groups.set(key, {
          conferenceId: paper.conference_id,
          conferenceName: paper.conference_name || "Other",
          papers: [],
        });
      }
      groups.get(key)!.papers.push(paper);
    }

    // Sort papers within each group: by submitted_at desc, then created_at desc
    for (const group of groups.values()) {
      group.papers.sort((a, b) => {
        const dateA = a.submitted_at || a.created_at;
        const dateB = b.submitted_at || b.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
    }

    // Sort groups by conference name
    return Array.from(groups.values()).sort((a, b) =>
      a.conferenceName.localeCompare(b.conferenceName),
    );
  }, [filteredPapers]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            My Papers
            {paperCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                {paperCount}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500">
            View and manage your paper submissions.
          </p>
        </div>
        <Link
          to={`${basePath}/papers/new`}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
        >
          + Submit Paper
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Search */}
          {papers.length > 0 && (
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, conference, or session type..."
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Grouped papers */}
          {groupedByConference.length > 0 ? (
            <div className="space-y-5">
              {groupedByConference.map((group) => (
                <div key={group.conferenceId || "__none__"}>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    {group.conferenceName}
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      ({group.papers.length})
                    </span>
                  </h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {group.papers.map((paper) => (
                      <Link
                        key={paper.id}
                        to={`${basePath}/papers/${paper.id}`}
                        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {paper.title}
                            </p>
                            {!paper.is_main_speaker && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 flex-shrink-0">
                                Co-speaker
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            {paper.cfp_title && (
                              <span>{paper.cfp_title}</span>
                            )}
                            {paper.cospeakers.length > 0 && (
                              <span className="text-gray-400">
                                {paper.cfp_title ? " · " : ""}
                                {paper.cospeakers.length} co-speaker
                                {paper.cospeakers.length > 1 ? "s" : ""}
                                {paper.cospeakers.some(
                                  (c) => c.invitation_status === "pending",
                                ) && <span className="text-amber-500"> (pending)</span>}
                              </span>
                            )}
                            {paper.submitted_at && (
                              <span className="text-gray-400">
                                {paper.cfp_title || paper.cospeakers.length > 0 ? " · " : ""}
                                Submitted {formatDate(paper.submitted_at)}
                              </span>
                            )}
                          </p>
                          {!paper.is_main_speaker && (paper.main_speaker_first_name || paper.main_speaker_last_name) && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Main speaker: {`${paper.main_speaker_first_name || ""} ${paper.main_speaker_last_name || ""}`.trim()}
                            </p>
                          )}
                          {paper.session_type_name && (
                            <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">
                              {paper.session_type_name}
                            </span>
                          )}
                        </div>
                        <div className="flex-shrink-0 w-48">
                          <PaperStatusLifeline status={paper.status} compact />
                        </div>
                        <svg
                          className="w-4 h-4 text-gray-300 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : papers.length > 0 ? (
            <div className="text-center py-6 text-sm text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              No papers match "{searchQuery}"
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              No papers yet. Click "+ Submit Paper" to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
