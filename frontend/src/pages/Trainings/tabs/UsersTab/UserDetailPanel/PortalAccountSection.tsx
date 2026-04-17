import type { PortalAccount } from '../types';
import { formatDateTime } from '../constants';
import { actionBtnCls, labelCls, sectionCls, sectionHeadingCls, valueCls } from './styles';

interface Props {
  portalAccount: PortalAccount | null;
  portalUserId: string;
  onToggleAccess: () => void;
  onResendInvite: () => void;
  onResetPassword: () => void;
  onImpersonate: () => void;
  onRequestMerge: () => void;
  isTogglingAccess: boolean;
  isResendingInvite: boolean;
  isResettingPassword: boolean;
  isImpersonating: boolean;
}

export default function PortalAccountSection({
  portalAccount,
  onToggleAccess,
  onResendInvite,
  onResetPassword,
  onImpersonate,
  onRequestMerge,
  isTogglingAccess,
  isResendingInvite,
  isResettingPassword,
  isImpersonating,
}: Props) {
  return (
    <div className={sectionCls}>
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h4 className={sectionHeadingCls}>Portal Account</h4>
      </div>
      {portalAccount ? (
        <>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <p className={labelCls}>Status</p>
                <p className="mt-0.5">
                  {portalAccount.is_active ? (
                    <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                      Inactive
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className={labelCls}>Password</p>
                <p className={`${valueCls} mt-0.5`}>
                  {portalAccount.has_password ? 'Set' : 'Not set'}
                </p>
              </div>
              <div>
                <p className={labelCls}>Email Verified</p>
                <p className={`${valueCls} mt-0.5`}>
                  {portalAccount.email_verified ? 'Yes' : 'No'}
                </p>
              </div>
              <div>
                <p className={labelCls}>Last Login</p>
                <p className={`${valueCls} mt-0.5`}>
                  {formatDateTime(portalAccount.last_login_at)}
                </p>
              </div>
              <div>
                <p className={labelCls}>Created</p>
                <p className={`${valueCls} mt-0.5`}>{formatDateTime(portalAccount.created_at)}</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-4 flex flex-wrap gap-2">
            <button onClick={onToggleAccess} disabled={isTogglingAccess} className={actionBtnCls}>
              {isTogglingAccess ? '...' : 'Toggle Access'}
            </button>
            <button onClick={onResendInvite} disabled={isResendingInvite} className={actionBtnCls}>
              {isResendingInvite ? '...' : 'Resend Invite'}
            </button>
            <button
              onClick={onResetPassword}
              disabled={isResettingPassword}
              className={actionBtnCls}
            >
              {isResettingPassword ? '...' : 'Reset Password'}
            </button>
            <button
              onClick={onImpersonate}
              disabled={isImpersonating}
              className="px-3 py-1.5 text-xs font-medium border border-primary-300 dark:border-primary-700 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/20 text-primary-700 dark:text-primary-300 disabled:opacity-40"
            >
              {isImpersonating ? '...' : 'Impersonate'}
            </button>
            <button
              onClick={onRequestMerge}
              className="px-3 py-1.5 text-xs font-medium border border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-700 dark:text-amber-300"
            >
              Merge with...
            </button>
          </div>
        </>
      ) : (
        <div className="px-6 py-5">
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">
            No portal account linked.
          </p>
        </div>
      )}
    </div>
  );
}
