import type { UserProfile } from '../types';
import { labelCls, sectionCls, valueCls } from './styles';

interface Props {
  profile: UserProfile;
  onCreate: () => void;
  isCreating: boolean;
}

export default function NoPortalAccountNotice({ profile, onCreate, isCreating }: Props) {
  return (
    <div className={sectionCls}>
      <div className="px-6 py-5">
        <div className="flex items-center gap-3 mb-4 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
          <span className="text-amber-600 dark:text-amber-400 text-sm">
            No portal account yet. Create one to enable profile editing and portal access.
          </span>
          <button
            type="button"
            onClick={onCreate}
            disabled={isCreating}
            className="shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-40"
          >
            {isCreating ? 'Creating...' : 'Create Portal Account'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className={labelCls}>First Name</p>
            <p className={`${valueCls} mt-0.5`}>{profile.first_name}</p>
          </div>
          <div>
            <p className={labelCls}>Last Name</p>
            <p className={`${valueCls} mt-0.5`}>{profile.last_name}</p>
          </div>
          <div>
            <p className={labelCls}>Email</p>
            <p className={`${valueCls} mt-0.5`}>{profile.email}</p>
          </div>
          <div>
            <p className={labelCls}>Status</p>
            <p className={`${valueCls} mt-0.5`}>{profile.status}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
