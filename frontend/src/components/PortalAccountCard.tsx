import { useQuery } from '@tanstack/react-query';
import api from '../config/api';
import type { PortalUserDetail } from '../pages/MyCompany/types';
import { formatDateTime } from '../pages/MyCompany/UsersTab/constants';
import PortalAccountActions from './PortalAccountActions';

interface Props {
  portalUserId: string;
  onAfterMerge?: () => void;
}

const labelCls = 'text-xs font-medium text-gray-500 dark:text-gray-400 uppercase';
const valueCls = 'text-sm text-gray-900 dark:text-gray-100';

export default function PortalAccountCard({ portalUserId, onAfterMerge }: Props) {
  const { data: user, isLoading } = useQuery({
    queryKey: ['portal-user-detail', portalUserId],
    queryFn: async () => {
      const res = await api.get(`/portal-users/${portalUserId}`);
      return res.data as PortalUserDetail;
    },
  });

  if (isLoading || !user) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-sm text-gray-400">
        Loading portal account...
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 flex-wrap">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Portal Account
        </h4>
        <span
          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${
            user.is_active
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className={labelCls}>Password</p>
          <p className={`${valueCls} mt-0.5`}>{user.has_password ? 'Set' : 'Not set'}</p>
        </div>
        <div>
          <p className={labelCls}>Email verified</p>
          <p className={`${valueCls} mt-0.5`}>{user.email_verified ? 'Yes' : 'No'}</p>
        </div>
        <div>
          <p className={labelCls}>Last login</p>
          <p className={`${valueCls} mt-0.5`}>{formatDateTime(user.last_login_at)}</p>
        </div>
        <div>
          <p className={labelCls}>Created</p>
          <p className={`${valueCls} mt-0.5`}>{formatDateTime(user.created_at)}</p>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700">
        <PortalAccountActions
          portalUserId={portalUserId}
          isActive={user.is_active}
          onAfterMerge={onAfterMerge}
        />
      </div>
    </div>
  );
}
