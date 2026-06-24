import { useState, useMemo, useCallback, memo } from 'react';
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
  BulkAssignResponse,
  CFPTopic,
} from '../../../../types';
import { parseApiError } from '../../../../utils/apiError';
import { PAPER_STATUS_COLORS } from '../../../../config/statusColors';
import { COUNTRY_OPTIONS } from '../../../../config/countries';
import Modal from '../../../../components/Modal';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import { PaperDetailModal } from './PaperDetailModal';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AssignmentBlockReason =
  | 'is_speaker'
  | 'is_cospeaker'
  | 'already_assigned'
  | 'excluded_topic';

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

// ── Utilities ────────────────────────────────────────────────────────────────

const countryMap = new Map(COUNTRY_OPTIONS.map((c) => [c.code, c.name]));

function countryLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return countryMap.get(code) ?? code;
}

const REASON_LABELS: Record<AssignmentBlockReason, string> = {
  is_speaker: "Reviewer is this paper's speaker",
  is_cospeaker: 'Reviewer is a co-speaker on this paper',
  already_assigned: 'Already assigned to this paper',
  excluded_topic: 'Excluded topic — reviewer opted out of this topic',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function DragHandle({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'w-4 h-4 text-gray-300 dark:text-gray-600'}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

// ── PaperAssignmentCard ───────────────────────────────────────────────────────

interface PaperAssignmentCardProps {
  paper: Paper;
  paperAssigns: PaperAssignment[];
  reviewersPerPaper: number;
  isAdmin: boolean;
  isDragging: boolean;
  isOver: boolean;
  canDrop: boolean;
  blockReason: AssignmentBlockReason | null;
  isDropTarget: boolean;
  armedMemberId: string | null;
  armedMemberName: string | null;
  bulkPreview: 'assign' | 'skip' | null;
  bulkSkipReason: AssignmentBlockReason | null;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onOpenDetail: () => void;
  onUnassign: (assignmentId: string) => void;
}

const PaperAssignmentCard = memo(function PaperAssignmentCard({
  paper,
  paperAssigns,
  reviewersPerPaper,
  isAdmin,
  isDragging,
  isOver,
  canDrop,
  blockReason,
  isDropTarget,
  armedMemberId,
  armedMemberName,
  bulkPreview,
  bulkSkipReason,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpenDetail,
  onUnassign,
}: PaperAssignmentCardProps) {
  const borderClass = isDragging
    ? 'opacity-40 border-primary-300 bg-primary-50 dark:bg-primary-900/30'
    : isOver && canDrop
      ? 'border-primary-400 ring-2 ring-primary-200 dark:ring-primary-800 bg-primary-50 dark:bg-primary-900/30'
      : isOver && !canDrop
        ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30'
        : isDropTarget
          ? canDrop
            ? 'border-dashed border-gray-300 dark:border-gray-600'
            : 'border-gray-200 dark:border-gray-700 opacity-50'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600';

  const bulkStripe =
    bulkPreview === 'assign'
      ? 'shadow-[inset_3px_0_0_#22c55e]'
      : bulkPreview === 'skip'
        ? 'shadow-[inset_3px_0_0_#f59e0b] opacity-80'
        : '';

  return (
    <div
      draggable={isAdmin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border transition-all ${
        isAdmin && !isDropTarget ? 'cursor-grab active:cursor-grabbing' : ''
      } ${borderClass} ${bulkStripe}`}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2">
          {isAdmin && !isDropTarget && (
            <DragHandle className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            {/* Paper header row */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetail();
                  }}
                  className="text-sm font-medium text-primary-700 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 hover:underline leading-tight text-left"
                >
                  {paper.title}
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Session type badge */}
                {paper.session_type_name && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                    {paper.session_type_name}
                    {paper.session_type_duration != null
                      ? ` · ${paper.session_type_duration} min`
                      : ''}
                  </span>
                )}
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${PAPER_STATUS_COLORS[paper.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
                >
                  {paper.status}
                </span>
                <span
                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                    paperAssigns.length >= reviewersPerPaper
                      ? 'bg-green-500'
                      : paperAssigns.length > 0
                        ? 'bg-yellow-500'
                        : 'bg-gray-300'
                  }`}
                  title={`${paperAssigns.length}/${reviewersPerPaper} reviewers`}
                />
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {paperAssigns.length}/{reviewersPerPaper}
                </span>
              </div>
            </div>

            {/* Speaker + co-speakers */}
            <div className="mt-1 space-y-0.5">
              {/* Main speaker */}
              {paper.main_speaker && (
                <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                  <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 w-14 flex-shrink-0">
                    Speaker
                  </span>
                  <span className="font-medium">
                    {`${paper.main_speaker.first_name} ${paper.main_speaker.last_name}`.trim()}
                  </span>
                  {countryLabel(paper.main_speaker.country) && (
                    <span className="text-gray-400 dark:text-gray-500">
                      · {countryLabel(paper.main_speaker.country)}
                    </span>
                  )}
                </div>
              )}
              {/* Co-speakers */}
              {paper.cospeakers.map((cs) => {
                const name = `${cs.applicant.first_name} ${cs.applicant.last_name}`.trim();
                const country = countryLabel(cs.applicant.country);
                const statusDotClass =
                  cs.invitation_status === 'accepted'
                    ? 'bg-green-500'
                    : cs.invitation_status === 'declined'
                      ? 'bg-red-400'
                      : 'bg-gray-300';
                const statusLabel =
                  cs.invitation_status === 'accepted'
                    ? 'accepted'
                    : cs.invitation_status === 'declined'
                      ? 'declined'
                      : 'pending';
                return (
                  <div
                    key={cs.applicant.id}
                    className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400"
                  >
                    <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 w-14 flex-shrink-0">
                      Co-spkr
                    </span>
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClass}`}
                      title={`Invitation ${statusLabel}`}
                    />
                    <span className="font-medium">{name}</span>
                    {country && (
                      <span className="text-gray-400 dark:text-gray-500">· {country}</span>
                    )}
                    <span
                      className={`text-[9px] px-1 rounded ${
                        cs.invitation_status === 'accepted'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : cs.invitation_status === 'declined'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Topics */}
            {paper.topics && paper.topics.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
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

            {/* Assigned reviewers */}
            {paperAssigns.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {paperAssigns.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800"
                  >
                    <span>
                      {`${a.committee_member_first_name} ${a.committee_member_last_name}`.trim()}
                    </span>
                    {a.is_anonymous && (
                      <span className="px-1 rounded text-[9px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                        anon
                      </span>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnassign(a.id);
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

            {/* Drop hint or invalid reason */}
            {isDropTarget && isOver && (
              <p
                className={`text-[11px] italic mt-1 ${canDrop ? 'text-primary-500' : 'text-red-500'}`}
                role={!canDrop ? 'tooltip' : undefined}
              >
                {canDrop
                  ? 'Drop to assign reviewer'
                  : blockReason
                    ? REASON_LABELS[blockReason]
                    : 'Cannot assign'}
              </p>
            )}

            {/* Bulk preview label */}
            {armedMemberId && bulkPreview === 'skip' && bulkSkipReason && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 italic">
                Skip: {REASON_LABELS[bulkSkipReason]}
              </p>
            )}
            {armedMemberId && bulkPreview === 'assign' && (
              <p className="text-[10px] text-green-600 dark:text-green-400 mt-1 italic">
                Will assign to {armedMemberName}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

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
  const [sessionTypeFilter, setSessionTypeFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [reviewerFilter, setReviewerFilter] = useState<string>('all');
  const [showAutoAssign, setShowAutoAssign] = useState(false);
  const [autoAssignOnlySubmitted, setAutoAssignOnlySubmitted] = useState(true);
  const [autoAssignResult, setAutoAssignResult] = useState<AutoAssignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);

  // Armed reviewer state (click-to-arm bulk assign)
  const [armedMemberId, setArmedMemberId] = useState<string | null>(null);
  // Confirm dialog state
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkAssignResponse | null>(null);

  // Drag state
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

  const sessionTypes = useMemo(() => {
    const types = new Map<string, string>();
    for (const p of papers) {
      if (p.session_type_id && p.session_type_name) {
        types.set(p.session_type_id, p.session_type_name);
      }
    }
    return Array.from(types.entries());
  }, [papers]);

  const allTopics = useMemo(() => {
    const map = new Map<string, CFPTopic>();
    for (const p of papers) {
      for (const t of p.topics ?? []) map.set(t.id, t);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [papers]);

  const filteredPapers = useMemo(() => {
    let result = papers;
    if (paperStatusFilter !== 'all') {
      result = result.filter((p) => p.status === paperStatusFilter);
    }
    if (sessionTypeFilter !== 'all') {
      result = result.filter((p) => p.session_type_id === sessionTypeFilter);
    }
    if (topicFilter !== 'all') {
      result = result.filter((p) => p.topics?.some((t) => t.id === topicFilter));
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
    sessionTypeFilter,
    topicFilter,
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

  const armedMember = useMemo(
    () => (armedMemberId ? (members.find((m) => m.id === armedMemberId) ?? null) : null),
    [armedMemberId, members]
  );
  const armedMemberName = armedMember
    ? `${armedMember.first_name} ${armedMember.last_name}`.trim()
    : null;

  // ─── Conflict / eligibility checks ─────────────────────────────────────────

  const getAssignmentBlockReason = useCallback(
    (memberId: string, paperId: string): AssignmentBlockReason | null => {
      const paperAssigns = assignmentsByPaper.get(paperId) || [];
      if (paperAssigns.some((a) => a.committee_member_id === memberId)) {
        return 'already_assigned';
      }

      const member = members.find((m) => m.id === memberId);
      const paper = papers.find((p) => p.id === paperId);
      if (!member || !paper) return null;

      if (paper.main_speaker_id === member.applicant_id) return 'is_speaker';

      for (const cs of paper.cospeakers ?? []) {
        if (cs.applicant?.id === member.applicant_id) return 'is_cospeaker';
      }

      if (member.topics && member.topics.length > 0 && paper.topics && paper.topics.length > 0) {
        const excludedTopicIds = new Set(member.topics.map((t) => t.id));
        if (paper.topics.some((t) => excludedTopicIds.has(t.id))) return 'excluded_topic';
      }

      return null;
    },
    [assignmentsByPaper, members, papers]
  );

  const canAssignMemberToPaper = useCallback(
    (memberId: string, paperId: string) => getAssignmentBlockReason(memberId, paperId) === null,
    [getAssignmentBlockReason]
  );

  // Bulk preview: compute assign vs skip for each filtered paper against armed member
  const bulkPreviews = useMemo(() => {
    if (!armedMemberId)
      return new Map<
        string,
        { preview: 'assign' | 'skip'; reason: AssignmentBlockReason | null }
      >();
    const map = new Map<
      string,
      { preview: 'assign' | 'skip'; reason: AssignmentBlockReason | null }
    >();
    for (const paper of filteredPapers) {
      const blockReason = getAssignmentBlockReason(armedMemberId, paper.id);
      map.set(paper.id, {
        preview: blockReason === null ? 'assign' : 'skip',
        reason: blockReason,
      });
    }
    return map;
  }, [armedMemberId, filteredPapers, getAssignmentBlockReason]);

  const bulkEligiblePapers = useMemo(
    () => filteredPapers.filter((p) => bulkPreviews.get(p.id)?.preview === 'assign'),
    [filteredPapers, bulkPreviews]
  );

  const bulkSkippedPapers = useMemo(
    () => filteredPapers.filter((p) => bulkPreviews.get(p.id)?.preview === 'skip'),
    [filteredPapers, bulkPreviews]
  );

  // Group skipped by reason for the confirm dialog summary
  const bulkSkipSummary = useMemo(() => {
    const counts: Partial<Record<AssignmentBlockReason, number>> = {};
    for (const p of bulkSkippedPapers) {
      const reason = bulkPreviews.get(p.id)?.reason;
      if (reason) counts[reason] = (counts[reason] ?? 0) + 1;
    }
    return counts;
  }, [bulkSkippedPapers, bulkPreviews]);

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

  const bulkAssignMutation = useMutation({
    mutationFn: async () => {
      if (!armedMemberId) throw new Error('No reviewer armed');
      const res = await api.post<BulkAssignResponse>('/cfp/paper-assignments/bulk', {
        committee_member_id: armedMemberId,
        paper_ids: bulkEligiblePapers.map((p) => p.id),
        is_anonymous: cfpSettings.is_anonymous_review,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setBulkResult(data);
      setShowBulkConfirm(false);
      setArmedMemberId(null);
      queryClient.invalidateQueries({ queryKey: ['conference-assignments', selectedConferenceId] });
      queryClient.invalidateQueries({ queryKey: ['paper-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-papers'] });
    },
    onError: (err) => {
      setError(parseApiError(err));
      setShowBulkConfirm(false);
    },
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
      // ignore malformed drag data
    }
    handleDragEnd();
  };

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
      // ignore malformed drag data
    }
    handleDragEnd();
  };

  const handleDragLeave = (setter: (v: null) => void) => () => setter(null);

  // Arm/disarm a reviewer (click on member card, disambiguate from drag)
  const handleMemberClick = (memberId: string, e: React.MouseEvent) => {
    // Only arm/disarm on a plain click (no drag started)
    if (!isAdmin) return;
    e.stopPropagation();
    setArmedMemberId((prev) => (prev === memberId ? null : memberId));
    setBulkResult(null);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Paper Assignments</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Click a reviewer to arm them, then use bulk assign — or drag individual cards.
          </p>
        </div>
        {isAdmin && selectedConferenceId && (
          <button
            onClick={() => {
              setAutoAssignResult(null);
              setShowAutoAssign(true);
            }}
            className="mt-4 sm:mt-0 inline-flex items-center gap-1.5 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 min-h-[44px]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Auto-Assign
          </button>
        )}
      </div>

      <ErrorBanner message={error} />

      {/* Bulk result banner */}
      {bulkResult && (
        <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md px-4 py-3 text-sm text-green-800 dark:text-green-300 flex items-start justify-between gap-2">
          <span>
            Assigned {bulkResult.assigned.length} paper
            {bulkResult.assigned.length !== 1 ? 's' : ''}.
            {bulkResult.skipped.length > 0 && (
              <> Skipped {bulkResult.skipped.length} (conflicts / excluded topics).</>
            )}
          </span>
          <button
            type="button"
            onClick={() => setBulkResult(null)}
            className="text-green-600 hover:text-green-800 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}

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
        <div className="flex gap-6 items-start" style={{ minHeight: 'calc(100vh - 300px)' }}>
          {/* ── Left: Committee Members (sticky rail) ─────────────────────── */}
          <div
            className="flex flex-col min-w-0 flex-shrink-0 w-[260px]"
            style={{ position: 'sticky', top: '80px', maxHeight: 'calc(100vh - 160px)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Reviewers
                <span className="ml-1.5 text-gray-400 dark:text-gray-500 font-normal">
                  ({members.length})
                </span>
              </h2>
              {armedMemberId && (
                <button
                  type="button"
                  onClick={() => setArmedMemberId(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  Disarm
                </button>
              )}
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
                  const isDropTarget = dragType === 'paper' && !!dragId;
                  const isOver = dragOverMemberId === member.id;
                  const canDrop =
                    isDropTarget && dragId ? canAssignMemberToPaper(member.id, dragId) : false;
                  const isArmed = armedMemberId === member.id;

                  return (
                    <div
                      key={member.id}
                      draggable={isAdmin}
                      onDragStart={(e) => {
                        handleDragStart(e, 'member', member.id);
                      }}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleMemberDragOver(e, member.id)}
                      onDragLeave={handleDragLeave(setDragOverMemberId)}
                      onDrop={(e) => handleMemberDrop(e, member.id)}
                      onClick={(e) => handleMemberClick(member.id, e)}
                      className={`bg-white dark:bg-gray-800 rounded-md shadow-sm border px-2.5 py-2 transition-all select-none ${
                        isAdmin && !isDropTarget ? 'cursor-grab active:cursor-grabbing' : ''
                      } ${
                        isArmed
                          ? 'border-primary-500 ring-2 ring-primary-300 dark:ring-primary-700 bg-primary-50 dark:bg-primary-900/30'
                          : isDragging
                            ? 'opacity-40 border-primary-300 bg-primary-50 dark:bg-primary-900/30'
                            : isOver && canDrop
                              ? 'border-primary-400 ring-2 ring-primary-200 dark:ring-primary-800 bg-primary-50 dark:bg-primary-900/30'
                              : isOver && !canDrop
                                ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30'
                                : isDropTarget
                                  ? canDrop
                                    ? 'border-dashed border-gray-300 dark:border-gray-600'
                                    : 'border-gray-200 dark:border-gray-700 opacity-50'
                                  : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {isAdmin && !isDropTarget && (
                          <DragHandle className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {`${member.first_name} ${member.last_name}`.trim()}
                          </p>
                          {member.role && (
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                              {member.role}
                            </p>
                          )}
                        </div>
                        <span
                          className={`text-xs font-medium flex-shrink-0 ${
                            memberAssigns.length > 0
                              ? 'text-primary-600 dark:text-primary-400'
                              : 'text-gray-400'
                          }`}
                          title={`${memberAssigns.length} papers assigned`}
                        >
                          {memberAssigns.length}
                        </span>
                      </div>
                      {isArmed && (
                        <p className="text-[10px] text-primary-600 dark:text-primary-400 mt-0.5 ml-4 italic">
                          Armed — use bulk assign ↓
                        </p>
                      )}
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

          {/* ── Right: Papers ──────────────────────────────────────────────── */}
          <div className="flex flex-col min-w-0 flex-1">
            {/* Toolbar */}
            <div className="mb-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Papers
                  <span className="ml-1.5 text-gray-400 dark:text-gray-500 font-normal">
                    ({filteredPapers.length})
                  </span>
                </h2>
                <div className="flex items-center gap-1">
                  {(
                    [
                      { value: 'all' as const, label: 'All', dot: '' },
                      { value: 'none' as const, label: 'None', dot: 'bg-gray-300' },
                      { value: 'partial' as const, label: 'Partial', dot: 'bg-yellow-500' },
                      { value: 'complete' as const, label: 'Complete', dot: 'bg-green-500' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setStatusFilter(opt.value)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                        statusFilter === opt.value
                          ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
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
              <div className="flex flex-wrap items-center gap-2">
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
                {sessionTypes.length > 0 && (
                  <select
                    value={sessionTypeFilter}
                    onChange={(e) => setSessionTypeFilter(e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="all">All session types</option>
                    {sessionTypes.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
                {allTopics.length > 0 && (
                  <select
                    value={topicFilter}
                    onChange={(e) => setTopicFilter(e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="all">All topics</option>
                    {allTopics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
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
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Search papers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Bulk assign bar — shown when a reviewer is armed */}
            {armedMemberId && armedMember && (
              <div className="mb-3 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm text-primary-800 dark:text-primary-300 font-medium">
                  {armedMemberName}
                </span>
                <span className="text-sm text-primary-600 dark:text-primary-400">
                  {bulkEligiblePapers.length} of {filteredPapers.length} papers eligible
                  {bulkSkippedPapers.length > 0 && (
                    <> · {bulkSkippedPapers.length} will be skipped</>
                  )}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setArmedMemberId(null)}
                    className="px-3 py-1.5 text-xs border border-primary-300 dark:border-primary-700 rounded-md text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/50"
                  >
                    Cancel
                  </button>
                  {bulkEligiblePapers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowBulkConfirm(true)}
                      className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-md hover:bg-primary-700 font-medium min-h-[36px]"
                    >
                      Assign to {bulkEligiblePapers.length} paper
                      {bulkEligiblePapers.length !== 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Paper list */}
            <div className="flex-1 space-y-2">
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
                  const isDropTarget = dragType === 'member' && !!dragId;
                  const isOver = dragOverPaperId === paper.id;
                  const blockReason =
                    isDropTarget && dragId ? getAssignmentBlockReason(dragId, paper.id) : null;
                  const canDrop = blockReason === null && isDropTarget && !!dragId;
                  const preview = bulkPreviews.get(paper.id) ?? null;

                  return (
                    <PaperAssignmentCard
                      key={paper.id}
                      paper={paper}
                      paperAssigns={paperAssigns}
                      reviewersPerPaper={cfpSettings.reviewers_per_paper}
                      isAdmin={isAdmin}
                      isDragging={isDragging}
                      isOver={isOver}
                      canDrop={canDrop}
                      blockReason={blockReason}
                      isDropTarget={isDropTarget}
                      armedMemberId={armedMemberId}
                      armedMemberName={armedMemberName}
                      bulkPreview={preview?.preview ?? null}
                      bulkSkipReason={preview?.reason ?? null}
                      onDragStart={(e) => handleDragStart(e, 'paper', paper.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handlePaperDragOver(e, paper.id)}
                      onDragLeave={handleDragLeave(setDragOverPaperId)}
                      onDrop={(e) => handlePaperDrop(e, paper.id)}
                      onOpenDetail={() => setSelectedPaperId(paper.id)}
                      onUnassign={(id) => unassignMutation.mutate(id)}
                    />
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

      {/* Bulk Confirm Dialog */}
      <Modal
        open={showBulkConfirm}
        onClose={() => setShowBulkConfirm(false)}
        title="Confirm Bulk Assignment"
      >
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Assign <span className="font-semibold">{armedMemberName}</span> to{' '}
            <span className="font-semibold">{bulkEligiblePapers.length}</span> paper
            {bulkEligiblePapers.length !== 1 ? 's' : ''}?
          </p>
          {bulkSkippedPapers.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-xs text-amber-800 dark:text-amber-300">
              <p className="font-medium mb-1">
                {bulkSkippedPapers.length} paper{bulkSkippedPapers.length !== 1 ? 's' : ''} will be
                skipped:
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                {(Object.entries(bulkSkipSummary) as [AssignmentBlockReason, number][]).map(
                  ([reason, count]) => (
                    <li key={reason}>
                      {count} — {REASON_LABELS[reason]}
                    </li>
                  )
                )}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t dark:border-gray-700">
            <button
              onClick={() => setShowBulkConfirm(false)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={() => bulkAssignMutation.mutate()}
              disabled={bulkAssignMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm hover:bg-primary-700 disabled:opacity-50"
            >
              {bulkAssignMutation.isPending ? 'Assigning...' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>

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
                    <li className="text-yellow-700 dark:text-yellow-300">
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
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Only submitted papers
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Papers will be matched to committee members based on shared topics. Members who are
                speakers or co-speakers on a paper will be excluded from reviewing that paper.
              </p>
              <div className="flex justify-end gap-3 pt-2 border-t dark:border-gray-700">
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
