import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type { AttendeeData } from '../../../../types';

interface AttendeeFieldsProps {
  data: AttendeeData;
  onChange: (d: AttendeeData) => void;
  conferenceId: string;
  prefix?: string;
}

export default function AttendeeFields({
  data,
  onChange,
  conferenceId,
  prefix,
}: AttendeeFieldsProps) {
  const p = prefix ? `${prefix}-` : '';

  const { data: pronounOptions } = useQuery({
    queryKey: queryKeys.settings.pronounOptions(conferenceId),
    queryFn: async () => {
      const res = await api.get<{ id: string; name: string }[]>(
        `/conferences/${conferenceId}/settings/pronouns`
      );
      return res.data;
    },
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label
          htmlFor={`${p}first_name`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          First Name *
        </label>
        <input
          id={`${p}first_name`}
          type="text"
          required
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          value={data.first_name}
          onChange={(e) => onChange({ ...data, first_name: e.target.value })}
        />
      </div>
      <div>
        <label
          htmlFor={`${p}last_name`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Last Name *
        </label>
        <input
          id={`${p}last_name`}
          type="text"
          required
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          value={data.last_name}
          onChange={(e) => onChange({ ...data, last_name: e.target.value })}
        />
      </div>
      <div>
        <label
          htmlFor={`${p}email`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Email *
        </label>
        <input
          id={`${p}email`}
          type="email"
          required
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          value={data.email}
          onChange={(e) => onChange({ ...data, email: e.target.value })}
        />
      </div>
      {pronounOptions && pronounOptions.length > 0 && (
        <div>
          <label
            htmlFor={`${p}pronouns`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Pronouns
          </label>
          <select
            id={`${p}pronouns`}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.pronouns || ''}
            onChange={(e) => onChange({ ...data, pronouns: e.target.value || null })}
          >
            <option value="">Select pronouns...</option>
            {pronounOptions.map((opt) => (
              <option key={opt.id} value={opt.name}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label
          htmlFor={`${p}phone`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Phone
        </label>
        <input
          id={`${p}phone`}
          type="text"
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          value={data.phone || ''}
          onChange={(e) => onChange({ ...data, phone: e.target.value || null })}
        />
      </div>
      <div>
        <label
          htmlFor={`${p}job_title`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Job Title
        </label>
        <input
          id={`${p}job_title`}
          type="text"
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          value={data.job_title || ''}
          onChange={(e) => onChange({ ...data, job_title: e.target.value || null })}
        />
      </div>
      <div>
        <label
          htmlFor={`${p}department`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Department
        </label>
        <input
          id={`${p}department`}
          type="text"
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          value={data.department || ''}
          onChange={(e) => onChange({ ...data, department: e.target.value || null })}
        />
      </div>
    </div>
  );
}
