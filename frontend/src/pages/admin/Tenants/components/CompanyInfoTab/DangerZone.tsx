import { useState } from 'react';
import type { Tenant } from '../../../../../types';

interface Props {
  tenant: Tenant;
  isDeleting: boolean;
  onDelete: () => void;
}

export default function DangerZone({ tenant, isDeleting, onDelete }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const close = () => {
    setShowConfirm(false);
    setConfirmText('');
  };

  return (
    <div className="border-t dark:border-gray-700 pt-4">
      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Danger Zone</h5>
      <div className="rounded-lg p-4 bg-red-50 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-red-900 dark:text-red-300">
              Delete Company Permanently
            </p>
            <p className="text-sm mt-1 text-red-700 dark:text-red-400">
              This will permanently delete the company and all associated data including
              conferences, CFPs, papers, users, and attachments. This action cannot be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={isDeleting}
            className="ml-4 inline-flex items-center px-4 py-2 border-2 border-red-600 text-sm font-medium rounded-md text-red-600 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete Company'}
          </button>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={close}
            />
            <div className="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
              <div className="bg-white dark:bg-gray-800 px-4 pb-4 pt-5 sm:p-6">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg
                      className="h-6 w-6 text-red-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                      />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left flex-1">
                    <h3 className="text-lg font-semibold leading-6 text-gray-900 dark:text-gray-100">
                      Delete Company Permanently
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        This action <strong>cannot be undone</strong>. This will permanently delete
                        the company <strong>&quot;{tenant.name}&quot;</strong> and all associated
                        data including:
                      </p>
                      <ul className="mt-2 text-sm text-gray-500 dark:text-gray-400 list-disc list-inside space-y-1">
                        <li>All users and their accounts</li>
                        <li>All conferences and their settings</li>
                        <li>All CFPs, papers, and submissions</li>
                        <li>All applicants and reviewers</li>
                        <li>All attachments and uploaded files</li>
                      </ul>
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Type <strong>{tenant.name}</strong> to confirm:
                        </label>
                        <input
                          type="text"
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                          className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                          placeholder="Enter company name"
                          autoFocus
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  type="button"
                  disabled={confirmText !== tenant.name || isDeleting}
                  onClick={() => {
                    onDelete();
                    close();
                  }}
                  className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? 'Deleting...' : 'Delete permanently'}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-white dark:bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 sm:mt-0 sm:w-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
