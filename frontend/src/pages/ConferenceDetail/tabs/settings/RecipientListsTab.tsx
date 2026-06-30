import type { Conference } from '../../../../types';
import { useStaticRecipientLists } from './hooks/useStaticRecipientLists';
import { useDynamicRecipientLists } from './hooks/useDynamicRecipientLists';
import StaticListModal from './RecipientListsTab/StaticListModal';
import DynamicListModal from './RecipientListsTab/DynamicListModal';

interface Props {
  conference: Conference;
  isAdmin: boolean;
}

export default function RecipientListsTab({ conference, isAdmin }: Props) {
  const staticHook = useStaticRecipientLists(conference.id);
  const dynamicHook = useDynamicRecipientLists(conference.id);

  const {
    lists,
    isLoading,
    deleteConfirm,
    setDeleteConfirm,
    deleteMutation,
    openCreate,
    openEdit,
  } = staticHook;

  const {
    dynamicLists,
    dynamicLoading,
    deleteDynamicConfirm,
    setDeleteDynamicConfirm,
    deleteDynamicMutation,
    openDynamicCreate,
    openDynamicEdit,
  } = dynamicHook;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Recipient Lists
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Create named lists of applicants for bulk messaging.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            Create List
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      ) : lists.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No recipient lists yet.</p>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Members
                </th>
                <th className="sticky right-0 z-[1] bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {lists.map((list) => (
                <tr key={list.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {list.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {list.description || (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {list.member_count}
                  </td>
                  <td className="sticky right-0 z-[1] bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 px-4 py-3 text-right">
                    {isAdmin && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(list.id)}
                          className="text-sm text-primary-600 hover:text-primary-800"
                        >
                          Edit
                        </button>
                        {deleteConfirm === list.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => deleteMutation.mutate(list.id)}
                              className="text-sm text-red-600 hover:text-red-800 font-medium"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(list.id)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Dynamic Lists
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Filter-based lists that automatically resolve recipients at send time.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={openDynamicCreate}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              Create Dynamic List
            </button>
          )}
        </div>

        {dynamicLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : dynamicLists.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No dynamic lists yet.</p>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Recipients
                  </th>
                  <th className="sticky right-0 z-[1] bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {dynamicLists.map((dl) => (
                  <tr key={dl.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {dl.name}
                      </div>
                      {dl.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {dl.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {dl.target_type === 'registration' ? 'Registration' : 'Sponsor'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {dl.recipient_count}
                    </td>
                    <td className="sticky right-0 z-[1] bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 px-4 py-3 text-right">
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openDynamicEdit(dl)}
                            className="text-sm text-primary-600 hover:text-primary-800"
                          >
                            Edit
                          </button>
                          {deleteDynamicConfirm === dl.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => deleteDynamicMutation.mutate(dl.id)}
                                className="text-sm text-red-600 hover:text-red-800 font-medium"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteDynamicConfirm(null)}
                                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteDynamicConfirm(dl.id)}
                              className="text-sm text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <StaticListModal hook={staticHook} />
      <DynamicListModal hook={dynamicHook} />
    </div>
  );
}
