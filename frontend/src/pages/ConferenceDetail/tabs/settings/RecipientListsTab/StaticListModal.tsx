import type { useStaticRecipientLists } from '../hooks/useStaticRecipientLists';

type StaticHook = ReturnType<typeof useStaticRecipientLists>;

interface Props {
  hook: StaticHook;
}

export default function StaticListModal({ hook }: Props) {
  const {
    showModal,
    editingListId,
    formName,
    setFormName,
    formDescription,
    setFormDescription,
    formApplicantIds,
    setFormApplicantIds,
    applicantSearch,
    setApplicantSearch,
    allApplicants,
    isLoadingApplicants,
    applicantsError,
    saving,
    closeModal,
    handleSave,
  } = hook;

  if (!showModal) return null;

  const selectedSet = new Set(formApplicantIds);
  const filteredApplicants = allApplicants?.filter((a) => {
    if (selectedSet.has(a.id)) return false;
    if (!applicantSearch.trim()) return true;
    const q = applicantSearch.toLowerCase();
    return (
      a.first_name.toLowerCase().includes(q) ||
      a.last_name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q)
    );
  });
  const selectedApplicants = allApplicants?.filter((a) => selectedSet.has(a.id)) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {editingListId ? 'Edit Recipient List' : 'Create Recipient List'}
          </h3>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              placeholder="e.g. Accepted Speakers 2025"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              placeholder="Optional description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Members ({formApplicantIds.length})
            </label>
            {selectedApplicants.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedApplicants.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 text-sm text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full"
                  >
                    {a.first_name} {a.last_name}
                    <button
                      onClick={() =>
                        setFormApplicantIds((prev) => prev.filter((id) => id !== a.id))
                      }
                      className="text-blue-400 hover:text-blue-600 ml-0.5"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              type="text"
              placeholder="Search applicants to add..."
              value={applicantSearch}
              onChange={(e) => setApplicantSearch(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            />
            {isLoadingApplicants && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Loading applicants…</p>
            )}
            {applicantsError && (
              <p className="text-xs text-red-500 mt-1">
                Failed to load applicants:{' '}
                {applicantsError instanceof Error ? applicantsError.message : 'Unknown error'}
              </p>
            )}
            {!isLoadingApplicants && !applicantsError && allApplicants !== undefined && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {allApplicants.length - formApplicantIds.length} available — type to search
              </p>
            )}
            {applicantSearch.trim() && filteredApplicants && filteredApplicants.length > 0 && (
              <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md mt-1">
                {filteredApplicants.slice(0, 30).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setFormApplicantIds((prev) => [...prev, a.id]);
                      setApplicantSearch('');
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b last:border-b-0 dark:border-gray-700"
                  >
                    {a.first_name} {a.last_name}{' '}
                    <span className="text-gray-400 dark:text-gray-500">{a.email}</span>
                  </button>
                ))}
              </div>
            )}
            {applicantSearch.trim() && filteredApplicants && filteredApplicants.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">No applicants found</p>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={closeModal}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!formName.trim() || formApplicantIds.length === 0 || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : editingListId ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
