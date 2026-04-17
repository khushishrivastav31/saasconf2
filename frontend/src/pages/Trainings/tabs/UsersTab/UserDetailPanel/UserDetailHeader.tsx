import type { UserProfile } from '../types';
import { STATUS_COLORS } from '../constants';
import { sectionCls } from './styles';

interface Props {
  profile: UserProfile;
}

export default function UserDetailHeader({ profile }: Props) {
  return (
    <div className={sectionCls}>
      <div className="px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-lg">
            {profile.first_name.charAt(0)}
            {profile.last_name.charAt(0)}
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {profile.first_name} {profile.last_name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email}</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span
              className={`inline-flex px-2.5 py-1 rounded text-xs font-semibold ${STATUS_COLORS[profile.status] ?? ''}`}
            >
              {profile.status === 'parked' ? 'Parked' : 'Active'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
