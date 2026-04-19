import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';
import PortalAccountActions from '../../../components/PortalAccountActions';
import type { PortalUserDetail } from '../types';
import { formatDateTime } from './constants';
import HistoryPanel from './HistoryPanel';

interface Props {
  userId: string;
  onBack: () => void;
}

type DetailTab = 'profile' | 'linkages' | 'history';

const sectionCls = 'bg-white dark:bg-gray-800 rounded-lg shadow';
const sectionHeadingCls = 'text-base font-semibold text-gray-900 dark:text-gray-100';
const labelCls = 'text-xs font-medium text-gray-500 dark:text-gray-400 uppercase';
const valueCls = 'text-sm text-gray-900 dark:text-gray-100';

export default function UserDetailPanel({ userId, onBack }: Props) {
  const [tab, setTab] = useState<DetailTab>('profile');

  const { data: user, isLoading } = useQuery({
    queryKey: ['portal-user-detail', userId],
    queryFn: async () => {
      const res = await api.get(`/portal-users/${userId}`);
      return res.data as PortalUserDetail;
    },
  });

  if (isLoading || !user) {
    return (
      <div>
        <button onClick={onBack} className="mb-4 text-sm text-primary-600 dark:text-primary-400">
          ← Back to users
        </button>
        <div className="p-8 text-center text-gray-400">Loading user...</div>
      </div>
    );
  }

  const link = user.linkages;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-primary-600 dark:text-primary-400">
          ← Back to users
        </button>
      </div>

      {/* Header */}
      <div className={sectionCls}>
        <div className="px-6 py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {user.first_name || ''} {user.last_name || ''}
                {!user.first_name && !user.last_name && (
                  <span className="italic text-gray-500 dark:text-gray-400">No name</span>
                )}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">{user.email}</p>
            </div>
            <span
              className={`inline-flex px-2.5 py-0.5 rounded text-xs font-semibold ${
                user.is_active
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
              }`}
            >
              {user.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
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
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <PortalAccountActions
            portalUserId={userId}
            isActive={user.is_active}
            onAfterMerge={onBack}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-6">
          {(['profile', 'linkages', 'history'] as DetailTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap py-2.5 px-1 border-b-2 text-sm font-medium capitalize ${
                tab === t
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'profile' && (
        <div className={sectionCls}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className={sectionHeadingCls}>Profile</h4>
          </div>
          <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className={labelCls}>First name</p>
              <p className={`${valueCls} mt-0.5`}>{user.first_name || '—'}</p>
            </div>
            <div>
              <p className={labelCls}>Last name</p>
              <p className={`${valueCls} mt-0.5`}>{user.last_name || '—'}</p>
            </div>
            <div>
              <p className={labelCls}>Pronouns</p>
              <p className={`${valueCls} mt-0.5`}>{user.pronouns || '—'}</p>
            </div>
            <div>
              <p className={labelCls}>Phone</p>
              <p className={`${valueCls} mt-0.5`}>{user.phone || '—'}</p>
            </div>
            <div>
              <p className={labelCls}>Title</p>
              <p className={`${valueCls} mt-0.5`}>{user.title || '—'}</p>
            </div>
            <div>
              <p className={labelCls}>Company</p>
              <p className={`${valueCls} mt-0.5`}>{user.company || '—'}</p>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <p className={labelCls}>Address</p>
              <p className={`${valueCls} mt-0.5`}>
                {[
                  user.address_line_1,
                  user.address_line_2,
                  user.postal_code,
                  user.city,
                  user.country,
                ]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </p>
            </div>
            {user.bio && (
              <div className="col-span-2 sm:col-span-3">
                <p className={labelCls}>Bio</p>
                <div
                  className={`${valueCls} mt-0.5 prose prose-sm dark:prose-invert max-w-none`}
                  dangerouslySetInnerHTML={{ __html: user.bio }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'linkages' && (
        <div className={sectionCls}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className={sectionHeadingCls}>Linkages</h4>
          </div>
          <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className={labelCls}>Training attendee</p>
              <p className={`${valueCls} mt-0.5`}>
                {link.training_attendee_count > 0
                  ? `${link.training_attendee_count} · ${link.training_attendee_status ?? ''}`
                  : 'none'}
              </p>
            </div>
            <div>
              <p className={labelCls}>CFP applicant</p>
              <p className={`${valueCls} mt-0.5`}>
                {link.cfp_applicant_count > 0 ? `${link.cfp_applicant_count} link(s)` : 'none'}
              </p>
            </div>
            <div>
              <p className={labelCls}>Conference registrations</p>
              <p className={`${valueCls} mt-0.5`}>
                {link.registration_count > 0 ? link.registration_count : 'none'}
              </p>
            </div>
          </div>
          <div className="px-6 pb-5 text-xs text-gray-500 dark:text-gray-400">
            Conference registrations are matched by email hash. CFP and training links use direct
            FKs.
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className={sectionCls}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className={sectionHeadingCls}>Admin action history</h4>
          </div>
          <HistoryPanel userId={userId} />
        </div>
      )}
    </div>
  );
}
