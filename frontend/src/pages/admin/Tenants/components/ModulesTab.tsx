import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';

interface ModuleGroupStatus {
  conferences: boolean;
  trainings: boolean;
}

export default function ModulesTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-module-groups', tenantId],
    queryFn: async () => {
      const response = await api.get<ModuleGroupStatus>(`/admin/tenants/${tenantId}/module-groups`);
      return response.data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (payload: Partial<ModuleGroupStatus>) => {
      const response = await api.put<ModuleGroupStatus>(
        `/admin/tenants/${tenantId}/module-groups`,
        payload
      );
      return response.data;
    },
    onSuccess: (newData) => {
      queryClient.setQueryData(['tenant-module-groups', tenantId], newData);
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Select which products this company has access to. Users need to log out and back in for
        changes to take effect.
      </p>

      <div className="space-y-4">
        {/* Conferences toggle */}
        <label className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <input
            type="checkbox"
            checked={data.conferences}
            disabled={toggleMutation.isPending}
            onChange={() => toggleMutation.mutate({ conferences: !data.conferences })}
            className="h-5 w-5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Conferences
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Conference management, CFP, speakers, sessions, sponsors, registrations, invoices,
              analytics, and more.
            </p>
          </div>
        </label>

        {/* Trainings toggle */}
        <label className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <input
            type="checkbox"
            checked={data.trainings}
            disabled={toggleMutation.isPending}
            onChange={() => toggleMutation.mutate({ trainings: !data.trainings })}
            className="h-5 w-5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Trainings</span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Training management, trainers, syllabi, registrations, and scheduling.
            </p>
          </div>
        </label>
      </div>

      {toggleMutation.isPending && (
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-600"></span>
          Updating...
        </p>
      )}
    </div>
  );
}
