import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDraggable } from '@dnd-kit/core';
import api from '../../../../config/api';
import type { Paper, ProgramSession, ProgramTimeSlot } from '../../../../types';

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

// eslint-disable-next-line react-refresh/only-export-components
export function computeSessionDurationMinutes(
  session: ProgramSession,
  slots: ProgramTimeSlot[]
): number {
  const sortedSlots = [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const startIdx = sortedSlots.findIndex((s) => s.id === session.start_slot_id);
  if (startIdx === -1) return 0;

  let totalMinutes = 0;
  for (let i = startIdx; i < startIdx + session.slot_span && i < sortedSlots.length; i++) {
    const slot = sortedSlots[i];
    const [sh, sm] = slot.start_time.split(':').map(Number);
    const [eh, em] = slot.end_time.split(':').map(Number);
    totalMinutes += eh * 60 + em - (sh * 60 + sm);
  }
  return totalMinutes;
}

// Draggable paper card component
function DraggablePaperCard({
  paper,
  selectedSession,
  selectedSessionDuration,
  selectedSessionId,
  onAssignPaper,
  isAdmin,
}: {
  paper: Paper;
  selectedSession: ProgramSession | null;
  selectedSessionDuration: number;
  selectedSessionId: string | null;
  onAssignPaper: (paperId: string, sessionId: string) => void;
  isAdmin: boolean;
}) {
  const canDrag = isAdmin;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `paper-${paper.id}`,
    data: { type: 'paper', paper },
    disabled: !canDrag,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const speakerName = paper.main_speaker
    ? `${paper.main_speaker.first_name || ''} ${paper.main_speaker.last_name || ''}`.trim()
    : null;

  const durationWarning =
    selectedSession &&
    paper.session_type_duration &&
    paper.session_type_duration > selectedSessionDuration;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(canDrag ? { ...attributes, ...listeners } : {})}
      className={`
        p-2 hover:bg-gray-50
        ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}
        ${isDragging ? 'opacity-50 z-50' : ''}
      `}
    >
      <h4 className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight">
        {paper.title}
      </h4>

      {speakerName && <p className="text-xs text-gray-500 mt-0.5 truncate">{speakerName}</p>}

      {durationWarning && (
        <div className="mt-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          Duration ({paper.session_type_duration} min) exceeds session ({selectedSessionDuration}{' '}
          min)
        </div>
      )}

      {isAdmin && (
        <div className="mt-1">
          {selectedSessionId ? (
            <button
              onClick={() => onAssignPaper(paper.id, selectedSessionId)}
              className="px-2 py-0.5 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700"
            >
              Assign
            </button>
          ) : (
            <span className="text-xs text-gray-400 italic">Drag to a session</span>
          )}
        </div>
      )}
    </div>
  );
}

// Assigned paper card (non-draggable)
function AssignedPaperCard({
  paper,
  session,
  onUnassignPaper,
}: {
  paper: Paper;
  session: ProgramSession;
  onUnassignPaper: (sessionId: string) => void;
}) {
  const speakerName = paper.main_speaker
    ? `${paper.main_speaker.first_name || ''} ${paper.main_speaker.last_name || ''}`.trim()
    : null;

  return (
    <div className="p-2 hover:bg-green-50/80">
      <h4 className="text-sm font-medium text-gray-900 line-clamp-1 leading-tight">
        {paper.title}
      </h4>
      {speakerName && <p className="text-xs text-gray-500 mt-0.5 truncate">{speakerName}</p>}
      <p className="text-xs text-green-700 mt-0.5 truncate">
        {session.session_type_name || session.title}
      </p>
      <button
        onClick={() => onUnassignPaper(session.id)}
        className="mt-1 px-2 py-0.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100"
      >
        Unassign
      </button>
    </div>
  );
}

// Drag overlay for paper being dragged
export function PaperCardOverlay({ paper }: { paper: Paper }) {
  const speakerName = paper.main_speaker
    ? `${paper.main_speaker.first_name || ''} ${paper.main_speaker.last_name || ''}`.trim()
    : null;

  return (
    <div className="p-2 bg-white border border-primary-300 rounded-md shadow-2xl opacity-90 max-w-[250px]">
      <h4 className="text-sm font-medium text-gray-900 line-clamp-1">{paper.title}</h4>
      {speakerName && <p className="text-xs text-gray-500 truncate">{speakerName}</p>}
      {paper.session_type_name && (
        <span className="inline-block mt-1 px-1.5 py-0.5 text-xs bg-primary-100 text-primary-700 rounded">
          {paper.session_type_name}
        </span>
      )}
    </div>
  );
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
    queryKey: ['papers', conferenceId, 'all'],
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
          className="p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50"
          title="Show accepted papers"
        >
          <svg
            className="w-5 h-5 text-gray-600"
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
    <div className="flex-shrink-0 w-72 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col max-h-[calc(100vh-200px)]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">
          Papers
          <span className="ml-1 text-xs font-normal text-gray-500">
            ({unassignedPapers.length} / {papers.length})
          </span>
        </h3>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
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
      <div className="p-2 border-b border-gray-100 space-y-1.5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search papers..."
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 bg-white"
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
              <div className="py-6 text-center text-sm text-gray-500">All papers assigned</div>
            )}
            {totalUnassignedShown === 0 && search.trim() && (
              <div className="py-6 text-center text-sm text-gray-500">
                No unassigned papers match
              </div>
            )}
            {groupedUnassigned.map((group) => (
              <div key={group.name}>
                <div className="px-2 py-1.5 bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {group.name}
                  </span>
                  <span className="ml-1 text-xs text-gray-400">({group.papers.length})</span>
                </div>
                <div className="divide-y divide-gray-100">
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
              <div className="border-t border-gray-200">
                <button
                  onClick={() => setShowAssigned(!showAssigned)}
                  className="w-full px-3 py-2 flex items-center justify-between bg-green-50 hover:bg-green-100 transition-colors"
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
                  <div className="divide-y divide-gray-100">
                    {filteredAssigned.map(({ paper, session }) => (
                      <AssignedPaperCard
                        key={paper.id}
                        paper={paper}
                        session={session}
                        onUnassignPaper={onUnassignPaper}
                      />
                    ))}
                    {filteredAssigned.length === 0 && search.trim() && (
                      <div className="py-4 text-center text-xs text-gray-500">
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
