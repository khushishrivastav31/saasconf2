import { useState } from 'react';
import ConfirmDialog from '../../../../../components/ConfirmDialog';
import type { Tenant } from '../../../../../types';

interface Props {
  tenant: Tenant;
  isToggling: boolean;
  onToggle: () => void;
}

export default function CompanyStatusSection({ tenant, isToggling, onToggle }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="border-t dark:border-gray-700 pt-4">
      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Company Status</h5>
      <div
        className={`rounded-lg p-4 ${
          tenant.is_active
            ? 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800'
            : 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p
              className={`text-sm font-medium ${
                tenant.is_active
                  ? 'text-red-900 dark:text-red-300'
                  : 'text-green-900 dark:text-green-300'
              }`}
            >
              {tenant.is_active ? 'Deactivate Company' : 'Activate Company'}
            </p>
            <p
              className={`text-sm mt-1 ${
                tenant.is_active
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-green-700 dark:text-green-400'
              }`}
            >
              {tenant.is_active
                ? 'Deactivating will prevent all users of this company from logging in.'
                : 'Activating will allow users of this company to log in again.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={isToggling}
            className={`ml-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
              tenant.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            } disabled:opacity-50`}
          >
            {isToggling ? 'Saving...' : tenant.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title={tenant.is_active ? 'Deactivate Company' : 'Activate Company'}
        message={
          tenant.is_active
            ? `Are you sure you want to deactivate "${tenant.name}"? All users of this company will be unable to log in.`
            : `Are you sure you want to activate "${tenant.name}"? Users of this company will be able to log in again.`
        }
        confirmLabel={tenant.is_active ? 'Deactivate' : 'Activate'}
        onConfirm={() => {
          onToggle();
          setShowConfirm(false);
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
