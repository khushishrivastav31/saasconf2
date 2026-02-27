import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';
import type {
  PortalCommitteeMembershipListResponse,
  PortalCommitteeMembership,
  PortalTopic,
} from '../../types/portal';

function TopicEditor({
  membership,
  allTopics,
}: {
  membership: PortalCommitteeMembership;
  allTopics: PortalTopic[];
}) {
  const queryClient = useQueryClient();
  const selectedIds = new Set(membership.topics.map((t) => t.id));
  const [saving, setSaving] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async (topicIds: string[]) => {
      await portalApi.put(`/portal/me/committee-memberships/${membership.id}`, {
        topic_ids: topicIds,
      });
    },
    onMutate: () => setSaving(true),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['portal-committee-memberships'],
      });
      setSaving(false);
    },
    onError: () => setSaving(false),
  });

  const toggleTopic = (topicId: string) => {
    const next = new Set(selectedIds);
    if (next.has(topicId)) {
      next.delete(topicId);
    } else {
      next.add(topicId);
    }
    updateMutation.mutate(Array.from(next));
  };

  if (allTopics.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 italic">
        No topics defined for this tenant.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Topics</span>
        {saving && <span className="text-xs text-gray-400 dark:text-gray-500">Saving...</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {allTopics.map((topic) => {
          const isSelected = selectedIds.has(topic.id);
          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => toggleTopic(topic.id)}
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100'
                  : 'bg-primary-100 text-primary-700 ring-1 ring-primary-300 hover:bg-primary-200'
              }`}
              title={topic.description || topic.name}
            >
              {topic.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ProgramCommitteeTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['portal-committee-memberships'],
    queryFn: async () => {
      const res = await portalApi.get<PortalCommitteeMembershipListResponse>(
        '/portal/me/committee-memberships'
      );
      return res.data;
    },
    refetchInterval: 30000,
  });

  const { data: topicsData } = useQuery({
    queryKey: ['portal-topics'],
    queryFn: async () => {
      const res = await portalApi.get<PortalTopic[]>('/portal/topics');
      return res.data;
    },
  });

  const memberships = data?.items ?? [];
  const allTopics = topicsData ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">
          No committee memberships
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          You are not currently a member of any program committee.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {memberships.map((membership) => (
        <div
          key={membership.id}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {membership.conference_name}
              </h3>
              <span className="inline-flex items-center mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {membership.role}
              </span>
            </div>
          </div>

          <TopicEditor membership={membership} allTopics={allTopics} />
        </div>
      ))}
    </div>
  );
}
