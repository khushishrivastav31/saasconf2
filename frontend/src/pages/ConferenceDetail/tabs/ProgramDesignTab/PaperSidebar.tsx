import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type { Paper, ProgramSession, ProgramTimeSlot } from '../../../../types';
import { DraggablePaperCard, AssignedPaperCard } from './PaperCards';
import { computeSessionDurationMinutes } from './paperSidebarUtils';

export { PaperCardOverlay } from './PaperCards';

interface PaperListResponse {
  items: Paper[];
  total: number;
}

interface PaperSidebarProps {
  conferenceId: string;
  sessions: ProgramSession[];
  slots: ProgramTimeSlot[];
  onAssignPaper: (paperId: string, sessionId: string) => void;
  onUnassignPaper: (sessionId: string) => void;
  selectedSessionId: string | null;
  isAdmin: boolean;
}

export default function PaperSidebar({
  conferenceId,
  sessions,
  slots,
  onAssignPaper,
  onUnassignPaper,
  selectedSessionId,
  isAdmin,
}: PaperSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showAssigned, setShowAssigned] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.cfp.papersForDesign(conferenceId, 'all'),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('conference_id', conferenceId);
      params.append('page_size', '500');
      const response = await api.get<PaperListResponse>(`/cfp/papers?${params.toString()}`);
      return response.data;
    },
  });

  const papers = useMemo(() => data?.items ?? [], [data?.items]);

  const paperSessionMap = useMemo(() => {
    const map = new Map<string, ProgramSession>();
    for (const session of sessions) {
      if (session.paper_id) {
        map.set(session.paper_id, session);
      }
    }
    return map;
  }, [sessions]);

  const selectedSession = useMemo(
    () => (selectedSessionId ? sessions.find((s) => s.id === selectedSessionId) || null : null),
    [sessions, selectedSessionId]
  );

  const selectedSessionDuration = useMemo(
    () => (selectedSession ? computeSessionDurationMinutes(selectedSession, slots) : 0),
    [selectedSession, slots]
  );

  // Split papers into unassigned and assigned
  const { unassignedPapers, assignedPapers } = useMemo(() => {
    const unassigned: Paper[] = [];
    const assigned: { paper: Paper; session: ProgramSession }[] = [];
    for (const paper of papers) {
      const session = paperSessionMap.get(paper.id);
      if (session) {
        assigned.push({ paper, session });
      } else {
        unassigned.push(paper);
      }
    }
    return { unassignedPapers: unassigned, assignedPapers: assigned };
  }, [papers, paperSessionMap]);

  // Collect available session types for the filter dropdown
  const sessionTypes = useMemo(() => {
    const types = new Map<string, string>();
    for (const paper of unassignedPapers) {
      if (paper.session_type_id && paper.session_type_name) {
        types.set(paper.session_type_id, paper.session_type_name);
      }
    }
    return Array.from(types.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [unassignedPapers]);

  // Group unassigned papers by session type
  const groupedUnassigned = useMemo(() => {
    const groups = new Map<string, { name: string; papers: Paper[] }>();
    const noType: Paper[] = [];

    for (const paper of unassignedPapers) {
      // Apply search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const title = paper.title.toLowerCase();
        const speaker = paper.main_speaker
          ? `${paper.main_speaker.first_name || ''} ${paper.main_speaker.last_name || ''}`.toLowerCase()
          : '';
        if (!title.includes(q) && !speaker.includes(q)) continue;
      }

      // Apply session type filter
      if (filterType !== 'all') {
        if (filterType === 'none' && paper.session_type_id) continue;
        if (filterType !== 'none' && paper.session_type_id !== filterType) continue;
      }

      if (paper.session_type_id && paper.session_type_name) {
        const group = groups.get(paper.session_type_id);
        if (group) {
          group.papers.push(paper);
        } else {
          groups.set(paper.session_type_id, {
            name: paper.session_type_name,
            papers: [paper],
          });
        }
      } else {
        noType.push(paper);
      }
    }

    const result = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (noType.length > 0) {
      result.push({ name: 'No Session Type', papers: noType });
    }
    return result;
  }, [unassignedPapers, search, filterType]);

  // Filter assigned papers by search
  const filteredAssigned = useMemo(() => {
    if (!search.trim()) return assignedPapers;
    const q = search.toLowerCase();
    return assignedPapers.filter((a) => {
      const title = a.paper.title.toLowerCase();
      const speaker = a.paper.main_speaker
        ? `${a.paper.main_speaker.first_name || ''} ${a.paper.main_speaker.last_name || ''}`.toLowerCase()
        : '';
      return title.includes(q) || speaker.includes(q);
    });
  }, [assignedPapers, search]);

  const totalUnassignedShown = groupedUnassigned.reduce((sum, g) => sum + g.papers.length, 0);

  if (collapsed) {
    return (
      <div className="flex-shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          title="Show accepted papers"
        >
          <svg
            className="w-5 h-5 text-gray-600 dark:text-gray-300"
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
        </button>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm flex flex-col max-h-[calc(100vh-200px)]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Papers
          <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
            ({unassignedPapers.length} / {papers.length})
          </span>
        </h3>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          title="Collapse sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 5l7 7-7 7M5 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Search & Filter */}
      <div className="p-2 border-b border-gray-100 dark:border-gray-700 space-y-1.5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search papers..."
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-gray-100"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 dark:text-gray-100"
        >
          <option value="all">All session types</option>
          {sessionTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="none">No session type</option>
        </select>
      </div>

      {/* Selected session indicator */}
      {selectedSession && (
        <div className="px-2 py-1.5 bg-primary-50 border-b border-primary-100">
          <p className="text-xs text-primary-700">
            <span className="font-medium">Target:</span> {selectedSession.title}
            <span className="text-primary-500 ml-1">({selectedSessionDuration} min)</span>
          </p>
        </div>
      )}

      {/* Paper list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Unassigned papers grouped by session type */}
            {totalUnassignedShown === 0 && !search.trim() && (
              <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                All papers assigned
              </div>
            )}
            {totalUnassignedShown === 0 && search.trim() && (
              <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No unassigned papers match
              </div>
            )}
            {groupedUnassigned.map((group) => (
              <div key={group.name}>
                <div className="px-2 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-10">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                    {group.name}
                  </span>
                  <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                    ({group.papers.length})
                  </span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {group.papers.map((paper) => (
                    <DraggablePaperCard
                      key={paper.id}
                      paper={paper}
                      selectedSession={selectedSession}
                      selectedSessionDuration={selectedSessionDuration}
                      selectedSessionId={selectedSessionId}
                      onAssignPaper={onAssignPaper}
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Assigned papers section */}
            {assignedPapers.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowAssigned(!showAssigned)}
                  className="w-full px-3 py-2 flex items-center justify-between bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                >
                  <span className="text-xs font-semibold text-green-800 uppercase tracking-wide">
                    Assigned ({assignedPapers.length})
                  </span>
                  <svg
                    className={`w-4 h-4 text-green-600 transition-transform ${showAssigned ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {showAssigned && (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredAssigned.map(({ paper, session }) => (
                      <AssignedPaperCard
                        key={paper.id}
                        paper={paper}
                        session={session}
                        onUnassignPaper={onUnassignPaper}
                      />
                    ))}
                    {filteredAssigned.length === 0 && search.trim() && (
                      <div className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                        No assigned papers match
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
