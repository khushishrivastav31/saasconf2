import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useIsAdmin } from '../../../../hooks/useIsAdmin';
import type {
  Paper,
  PaperAssignment,
  PaperAssignmentListResponse,
  CommitteeMember,
  Conference,
  CallForPapers,
  AutoAssignResponse,
} from '../../../../types';
import { parseApiError } from '../../../../utils/apiError';
import { PAPER_STATUS_COLORS } from '../../../../config/statusColors';
import Modal from '../../../../components/Modal';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import { PaperDetailModal } from './PaperDetailModal';

interface PaperListResponse {
  items: Paper[];
  total: number;
}

interface CommitteeMemberListResponse {
  items: CommitteeMember[];
  total: number;
}

interface ConferenceListResponse {
  items: Conference[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// Drag handle icon (6-dot grid)
function DragHandle({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-4 h-4 text-gray-300'} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

interface CFPAssignmentsProps {
  conferenceId?: string;
  isAdmin?: boolean;
}

export default function CFPAssignments({
  conferenceId,
  isAdmin: isAdminProp,
}: CFPAssignmentsProps = {}) {
  const isAdminFallback = useIsAdmin();
  const isAdmin = isAdminProp ?? isAdminFallback;
  const queryClient = useQueryClient();
  const [selectedConferenceId, setSelectedConferenceId] = useState<string>(conferenceId ?? '');
  const [search, setSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'none' | 'partial' | 'complete'>('all');
  const [paperStatusFilter, setPaperStatusFilter] = useState<string>('all');
  const [reviewerFilter, setReviewerFilter] = useState<string>('all');
  const [showAutoAssign, setShowAutoAssign] = useState(false);
  const [autoAssignOnlySubmitted, setAutoAssignOnlySubmitted] = useState(true);
  const [autoAssignResult, setAutoAssignResult] = useState<AutoAssignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);

  // Drag state — tracks what is being dragged and what is being hovered
  const [dragType, setDragType] = useState<'member' | 'paper' | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverPaperId, setDragOverPaperId] = useState<string | null>(null);
  const [dragOverMemberId, setDragOverMemberId] = useState<string | null>(null);

  // ─── Data queries ──────────────────────────────────────────────────────────

  const { data: conferencesData } = useQuery({
    queryKey: ['conferences-for-assignments'],
    queryFn: async () => {
      const res = await api.get<ConferenceListResponse>('/conferences?page_size=100');
      return res.data;
    },
    enabled: !conferenceId,
  });
  const conferences = conferencesData?.items ?? [];

  interface CFPListResponse {
    items: CallForPapers[];
    total: number;
    page: number;
    page_size: number;
    pages: number;
  }
  const { data: cfpData } = useQuery({
    queryKey: ['conference-cfp', selectedConferenceId],
    queryFn: async () => {
      const res = await api.get<CFPListResponse>(
        `/cfp?conference_id=${selectedConferenceId}&page_size=1`
      );
      return res.data.items[0] ?? null;
    },
    enabled: !!selectedConferenceId,
  });
  const cfpSettings = cfpData
    ? {
        is_anonymous_review: cfpData.is_anonymous_review,
        reviewers_per_paper: cfpData.reviewers_per_paper,
      }
    : { is_anonymous_review: false, reviewers_per_paper: 3 };

  const { data: papersData, isLoading: papersLoading } = useQuery({
    queryKey: ['assignment-papers', selectedConferenceId],
    queryFn: async () => {
      const res = await api.get<PaperListResponse>(
        `/cfp/papers?conference_id=${selectedConferenceId}&page_size=500`
      );
      return res.data;
    },
    enabled: !!selectedConferenceId,
    refetchInterval: 15000,
  });
  const papers = (papersData?.items ?? []).filter((p) => p.status !== 'draft');

  const { data: allAssignmentsData } = useQuery({
    queryKey: ['conference-assignments', selectedConferenceId],
    queryFn: async () => {
      const res = await api.get<PaperAssignmentListResponse>(
        `/cfp/paper-assignments?conference_id=${selectedConferenceId}`
      );
      return res.data;
    },
    enabled: !!selectedConferenceId,
    refetchInterval: 15000,
  });
  const allAssignments = useMemo(
    () => allAssignmentsData?.items ?? [],
    [allAssignmentsData?.items]
  );

  const { data: membersData } = useQuery({
    queryKey: ['assignment-committee-members', selectedConferenceId],
    queryFn: async () => {
      const res = await api.get<CommitteeMemberListResponse>(
        `/cfp/committee-members?conference_id=${selectedConferenceId}`
      );
      return res.data;
    },
    enabled: !!selectedConferenceId,
  });
  const members = useMemo(() => membersData?.items ?? [], [membersData?.items]);

  // ─── Derived data ─────────────────────────────────────────────────────────

  const assignmentsByPaper = useMemo(() => {
    const map = new Map<string, PaperAssignment[]>();
    for (const a of allAssignments) {
      const list = map.get(a.paper_id) || [];
      list.push(a);
      map.set(a.paper_id, list);
    }
    return map;
  }, [allAssignments]);

  const assignmentsByMember = useMemo(() => {
    const map = new Map<string, PaperAssignment[]>();
    for (const a of allAssignments) {
      const list = map.get(a.committee_member_id) || [];
      list.push(a);
      map.set(a.committee_member_id, list);
    }
    return map;
  }, [allAssignments]);

  const paperStatuses = useMemo(() => {
    const set = new Set<string>([
      'submitted',
      'in_evaluation',
      'final_consideration',
      'accepted',
      'rejected',
    ]);
    for (const p of papers) set.add(p.status);
    return Array.from(set).sort();
  }, [papers]);

  const filteredPapers = useMemo(() => {
    let result = papers;
    if (paperStatusFilter !== 'all') {
      result = result.filter((p) => p.status === paperStatusFilter);
    }
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(lower) ||
          `${p.main_speaker?.first_name ?? ''} ${p.main_speaker?.last_name ?? ''}`
            .trim()
            .toLowerCase()
            .includes(lower)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter((p) => {
        const count = (assignmentsByPaper.get(p.id) || []).length;
        if (statusFilter === 'none') return count === 0;
        if (statusFilter === 'complete') return count >= cfpSettings.reviewers_per_paper;
        return count > 0 && count < cfpSettings.reviewers_per_paper;
      });
    }
    if (reviewerFilter !== 'all') {
      result = result.filter((p) => {
        const assigns = assignmentsByPaper.get(p.id) || [];
        return assigns.some((a) => a.committee_member_id === reviewerFilter);
      });
    }
    return result.sort((a, b) => {
      const aCount = (assignmentsByPaper.get(a.id) || []).length;
      const bCount = (assignmentsByPaper.get(b.id) || []).length;
      if (aCount !== bCount) return aCount - bCount;
      return a.title.localeCompare(b.title);
    });
  }, [
    papers,
    search,
    statusFilter,
    paperStatusFilter,
    reviewerFilter,
    assignmentsByPaper,
    cfpSettings.reviewers_per_paper,
  ]);

  const filteredMembers = useMemo(() => {
    const sorted = [...members].sort((a, b) =>
      `${a.first_name} ${a.last_name}`.trim().localeCompare(`${b.first_name} ${b.last_name}`.trim())
    );
    if (!memberSearch) return sorted;
    const lower = memberSearch.toLowerCase();
    return sorted.filter(
      (m) =>
        `${m.first_name} ${m.last_name}`.trim().toLowerCase().includes(lower) ||
        m.email?.toLowerCase().includes(lower) ||
        m.role?.toLowerCase().includes(lower)
    );
  }, [members, memberSearch]);

  // ─── Conflict / eligibility checks ─────────────────────────────────────────

  const canAssignMemberToPaper = useCallback(
    (memberId: string, paperId: string) => {
      const paperAssigns = assignmentsByPaper.get(paperId) || [];
      if (paperAssigns.some((a) => a.committee_member_id === memberId)) return false;

      const member = members.find((m) => m.id === memberId);
      const paper = papers.find((p) => p.id === paperId);
      if (!member || !paper) return false;

      if (paper.main_speaker_id === member.applicant_id) return false;
      for (const cs of paper.cospeakers ?? []) {
        if (cs.applicant?.id === member.applicant_id) return false;
      }

      // member.topics = topics the member CANNOT review (exclusion list)
      if (member.topics && member.topics.length > 0 && paper.topics && paper.topics.length > 0) {
        const excludedTopicIds = new Set(member.topics.map((t) => t.id));
        if (paper.topics.some((t) => excludedTopicIds.has(t.id))) return false;
      }

      return true;
    },
    [assignmentsByPaper, members, papers]
  );

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const assignMutation = useMutation({
    mutationFn: async (data: { paper_id: string; committee_member_id: string }) => {
      await api.post('/cfp/paper-assignments', {
        ...data,
        is_anonymous: cfpSettings.is_anonymous_review,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conference-assignments', selectedConferenceId] });
      queryClient.invalidateQueries({ queryKey: ['paper-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-papers'] });
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const unassignMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      await api.delete(`/cfp/paper-assignments/${assignmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conference-assignments', selectedConferenceId] });
      queryClient.invalidateQueries({ queryKey: ['paper-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-papers'] });
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const autoAssignMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<AutoAssignResponse>('/cfp/paper-assignments/auto-assign', {
        conference_id: selectedConferenceId,
        reviewers_per_paper: cfpSettings.reviewers_per_paper,
        is_anonymous: cfpSettings.is_anonymous_review,
        only_submitted: autoAssignOnlySubmitted,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setAutoAssignResult(data);
      queryClient.invalidateQueries({ queryKey: ['conference-assignments', selectedConferenceId] });
      queryClient.invalidateQueries({ queryKey: ['paper-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-papers'] });
    },
    onError: (err) => setError(parseApiError(err)),
  });

  // ─── Drag & Drop ──────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, type: 'member' | 'paper', id: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type, id }));
    e.dataTransfer.effectAllowed = 'copy';
    setDragType(type);
    setDragId(id);
  };

  const handleDragEnd = () => {
    setDragType(null);
    setDragId(null);
    setDragOverPaperId(null);
    setDragOverMemberId(null);
  };

  // Drop on a paper card (expects a member being dragged)
  const handlePaperDragOver = (e: React.DragEvent, paperId: string) => {
    if (dragType !== 'member' || !dragId) return;
    e.preventDefault();
    if (canAssignMemberToPaper(dragId, paperId)) {
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
    setDragOverPaperId(paperId);
  };

  const handlePaperDrop = (e: React.DragEvent, paperId: string) => {
    e.preventDefault();
    setDragOverPaperId(null);
    if (!isAdmin) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'member' && canAssignMemberToPaper(data.id, paperId)) {
        assignMutation.mutate({ paper_id: paperId, committee_member_id: data.id });
      }
    } catch {
      // ignore
    }
    handleDragEnd();
  };

  // Drop on a member card (expects a paper being dragged)
  const handleMemberDragOver = (e: React.DragEvent, memberId: string) => {
    if (dragType !== 'paper' || !dragId) return;
    e.preventDefault();
    if (canAssignMemberToPaper(memberId, dragId)) {
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
    setDragOverMemberId(memberId);
  };

  const handleMemberDrop = (e: React.DragEvent, memberId: string) => {
    e.preventDefault();
    setDragOverMemberId(null);
    if (!isAdmin) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'paper' && canAssignMemberToPaper(memberId, data.id)) {
        assignMutation.mutate({ paper_id: data.id, committee_member_id: memberId });
      }
    } catch {
      // ignore
    }
    handleDragEnd();
  };

  const handleDragLeave = (setter: (v: null) => void) => () => setter(null);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Paper Assignments</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Drag members onto papers or papers onto members to assign
          </p>
        </div>
        {isAdmin && selectedConferenceId && (
          <button
            onClick={() => {
              setAutoAssignResult(null);
              setShowAutoAssign(true);
            }}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
          >
            Auto-Assign
          </button>
        )}
      </div>

      <ErrorBanner message={error} />

      {!conferenceId && (
        <div className="mb-6">
          <select
            value={selectedConferenceId}
            onChange={(e) => setSelectedConferenceId(e.target.value)}
            className="w-full sm:w-80 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">Select a conference...</option>
            {conferences.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.abbreviation ? ` (${c.abbreviation})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedConferenceId && (
        <div
          className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6"
          style={{ minHeight: 'calc(100vh - 300px)' }}
        >
          {/* ── Left: Committee Members ────────────────────────────────── */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Committee Members
                <span className="ml-1.5 text-gray-400 dark:text-gray-500 font-normal">
                  ({members.length})
                </span>
              </h2>
            </div>
            <div className="mb-3">
              <input
                type="text"
                placeholder="Search members..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5">
              {members.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                  No committee members found.
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                  No members match your search.
                </div>
              ) : (
                filteredMembers.map((member) => {
                  const memberAssigns = assignmentsByMember.get(member.id) || [];
                  const isDragging = dragType === 'member' && dragId === member.id;
                  const isDropTarget = dragType === 'paper' && dragId;
                  const isOver = dragOverMemberId === member.id;
                  const canDrop =
                    isDropTarget && dragId ? canAssignMemberToPaper(member.id, dragId) : false;

                  return (
                    <div
                      key={member.id}
                      draggable={isAdmin}
                      onDragStart={(e) => handleDragStart(e, 'member', member.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleMemberDragOver(e, member.id)}
                      onDragLeave={handleDragLeave(setDragOverMemberId)}
                      onDrop={(e) => handleMemberDrop(e, member.id)}
                      className={`bg-white rounded-md shadow-sm border px-2.5 py-1.5 transition-all ${
                        isAdmin && !isDropTarget ? 'cursor-grab active:cursor-grabbing' : ''
                      } ${
                        isDragging
                          ? 'opacity-40 border-primary-300 bg-primary-50'
                          : isOver && canDrop
                            ? 'border-primary-400 ring-2 ring-primary-200 bg-primary-50'
                            : isOver && !canDrop
                              ? 'border-red-300 bg-red-50'
                              : isDropTarget
                                ? canDrop
                                  ? 'border-dashed border-gray-300'
                                  : 'border-gray-200 opacity-50'
                                : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {isAdmin && !isDropTarget && (
                          <DragHandle className="w-3 h-3 text-gray-300 flex-shrink-0" />
                        )}
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate min-w-0 flex-1">
                          {`${member.first_name} ${member.last_name}`.trim()}
                        </p>
                        <span
                          className={`text-xs font-medium flex-shrink-0 ${
                            memberAssigns.length > 0 ? 'text-primary-600' : 'text-gray-400'
                          }`}
                        >
                          {memberAssigns.length}
                        </span>
                      </div>
                      {isDropTarget && canDrop && isOver && (
                        <p className="text-[11px] text-primary-500 italic mt-0.5 ml-4">
                          Drop to assign
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Right: Papers ──────────────────────────────────────────── */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Papers
                <span className="ml-1.5 text-gray-400 dark:text-gray-500 font-normal">
                  ({filteredPapers.length})
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <select
                  value={paperStatusFilter}
                  onChange={(e) => setPaperStatusFilter(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="all">All statuses</option>
                  {paperStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
                <select
                  value={reviewerFilter}
                  onChange={(e) => setReviewerFilter(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="all">All reviewers</option>
                  {[...members]
                    .sort((a, b) =>
                      `${a.first_name} ${a.last_name}`
                        .trim()
                        .localeCompare(`${b.first_name} ${b.last_name}`.trim())
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {`${m.first_name} ${m.last_name}`.trim()}
                      </option>
                    ))}
                </select>
                <div className="flex items-center gap-1">
                  {[
                    { value: 'all' as const, label: 'All', dot: '' },
                    { value: 'none' as const, label: 'None', dot: 'bg-gray-300' },
                    { value: 'partial' as const, label: 'Partial', dot: 'bg-yellow-500' },
                    { value: 'complete' as const, label: 'Complete', dot: 'bg-green-500' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setStatusFilter(opt.value)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                        statusFilter === opt.value
                          ? 'bg-primary-100 text-primary-700'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {opt.dot && (
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${opt.dot}`} />
                      )}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mb-3">
              <input
                type="text"
                placeholder="Search papers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5">
              {papersLoading ? (
                <LoadingSpinner />
              ) : filteredPapers.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 px-4 py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
                  {papers.length === 0
                    ? 'No papers found for this conference.'
                    : 'No papers match your search.'}
                </div>
              ) : (
                filteredPapers.map((paper) => {
                  const paperAssigns = assignmentsByPaper.get(paper.id) || [];
                  const isDragging = dragType === 'paper' && dragId === paper.id;
                  const isDropTarget = dragType === 'member' && dragId;
                  const isOver = dragOverPaperId === paper.id;
                  const canDrop =
                    isDropTarget && dragId ? canAssignMemberToPaper(dragId, paper.id) : false;

                  return (
                    <div
                      key={paper.id}
                      draggable={isAdmin}
                      onDragStart={(e) => handleDragStart(e, 'paper', paper.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handlePaperDragOver(e, paper.id)}
                      onDragLeave={handleDragLeave(setDragOverPaperId)}
                      onDrop={(e) => handlePaperDrop(e, paper.id)}
                      className={`bg-white rounded-lg shadow-sm border transition-all ${
                        isAdmin && !isDropTarget ? 'cursor-grab active:cursor-grabbing' : ''
                      } ${
                        isDragging
                          ? 'opacity-40 border-primary-300 bg-primary-50'
                          : isOver && canDrop
                            ? 'border-primary-400 ring-2 ring-primary-200 bg-primary-50'
                            : isOver && !canDrop
                              ? 'border-red-300 bg-red-50'
                              : isDropTarget
                                ? canDrop
                                  ? 'border-dashed border-gray-300'
                                  : 'border-gray-200 opacity-50'
                                : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          {isAdmin && !isDropTarget && (
                            <DragHandle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            {/* Paper header */}
                            <div className="flex items-start justify-between">
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPaperId(paper.id);
                                  }}
                                  className="text-sm font-medium text-primary-700 hover:text-primary-800 hover:underline leading-tight text-left"
                                >
                                  {paper.title}
                                </button>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  {`${paper.main_speaker?.first_name ?? ''} ${paper.main_speaker?.last_name ?? ''}`.trim() ||
                                    'Unknown speaker'}
                                  {paper.cospeakers && paper.cospeakers.length > 0 && (
                                    <span className="text-gray-400 dark:text-gray-500">
                                      {' '}
                                      + {paper.cospeakers.length} co-speaker
                                      {paper.cospeakers.length > 1 ? 's' : ''}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div className="ml-2 flex items-center gap-1.5 flex-shrink-0">
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${PAPER_STATUS_COLORS[paper.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
                                >
                                  {paper.status}
                                </span>
                                <span
                                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                                    paperAssigns.length >= cfpSettings.reviewers_per_paper
                                      ? 'bg-green-500'
                                      : paperAssigns.length > 0
                                        ? 'bg-yellow-500'
                                        : 'bg-gray-300'
                                  }`}
                                  title={`${paperAssigns.length}/${cfpSettings.reviewers_per_paper} reviewers`}
                                />
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                  {paperAssigns.length}/{cfpSettings.reviewers_per_paper}
                                </span>
                              </div>
                            </div>

                            {/* Topics */}
                            {paper.topics && paper.topics.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {paper.topics.map((t) => (
                                  <span
                                    key={t.id}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                                  >
                                    {t.name}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Assigned reviewers as chips */}
                            {paperAssigns.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {paperAssigns.map((a) => (
                                  <span
                                    key={a.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary-50 text-primary-700 border border-primary-200"
                                  >
                                    <span>
                                      {`${a.committee_member_first_name} ${a.committee_member_last_name}`.trim()}
                                    </span>
                                    {a.is_anonymous && (
                                      <span className="px-1 rounded text-[9px] bg-yellow-100 text-yellow-700">
                                        anon
                                      </span>
                                    )}
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          unassignMutation.mutate(a.id);
                                        }}
                                        className="flex-shrink-0 text-primary-400 hover:text-red-500 transition-colors"
                                        title={`Remove ${`${a.committee_member_first_name} ${a.committee_member_last_name}`.trim()}`}
                                      >
                                        <svg
                                          className="w-3 h-3"
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
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Drop hint */}
                            {isDropTarget && canDrop && isOver && (
                              <p className="text-[11px] text-primary-500 italic mt-1">
                                Drop to assign reviewer
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Paper Detail Modal */}
      {selectedPaperId && (
        <PaperDetailModal
          paper={papers.find((p) => p.id === selectedPaperId) ?? null}
          assignments={assignmentsByPaper.get(selectedPaperId) || []}
          isAnonymous={cfpSettings.is_anonymous_review}
          reviewersPerPaper={cfpSettings.reviewers_per_paper}
          onClose={() => setSelectedPaperId(null)}
        />
      )}

      {/* Auto-Assign Dialog */}
      <Modal
        open={showAutoAssign}
        onClose={() => setShowAutoAssign(false)}
        title="Auto-Assign Papers"
      >
        <div className="p-6 space-y-4">
          {autoAssignResult ? (
            <div className="space-y-3">
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md p-4">
                <h4 className="text-sm font-medium text-green-800 dark:text-green-300 mb-2">
                  Auto-assignment complete
                </h4>
                <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
                  <li>Papers processed: {autoAssignResult.papers_processed}</li>
                  <li>Assignments created: {autoAssignResult.assignments_created}</li>
                  {autoAssignResult.papers_skipped > 0 && (
                    <li className="text-yellow-700">
                      Papers with insufficient reviewers: {autoAssignResult.papers_skipped}
                    </li>
                  )}
                </ul>
              </div>
              {autoAssignResult.skipped_details.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
                  <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-2">
                    Details
                  </h4>
                  <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                    {autoAssignResult.skipped_details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end">
                <button
                  onClick={() => setShowAutoAssign(false)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm hover:bg-primary-700"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 space-y-1">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Reviewers per paper:</span>{' '}
                  {cfpSettings.reviewers_per_paper}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Review mode:</span>{' '}
                  {cfpSettings.is_anonymous_review ? 'Anonymous' : 'Non-anonymous'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  These settings are configured in the CFP settings.
                </p>
              </div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={autoAssignOnlySubmitted}
                  onChange={(e) => setAutoAssignOnlySubmitted(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Only submitted papers
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Papers will be matched to committee members based on shared topics. Members who are
                speakers or co-speakers on a paper will be excluded from reviewing that paper.
              </p>
              <div className="flex justify-end gap-3 pt-2 border-t">
                <button
                  onClick={() => setShowAutoAssign(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => autoAssignMutation.mutate()}
                  disabled={autoAssignMutation.isPending}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  {autoAssignMutation.isPending ? 'Assigning...' : 'Run Auto-Assign'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
