import { COUNTRY_OPTIONS } from '../../../../../config/countries';
import type { useDynamicRecipientLists } from '../hooks/useDynamicRecipientLists';

type DynamicHook = ReturnType<typeof useDynamicRecipientLists>;

interface Props {
  hook: DynamicHook;
}

export default function DynamicListModal({ hook }: Props) {
  const {
    showDynamicModal,
    editingDynamicId,
    dlName,
    setDlName,
    dlDescription,
    setDlDescription,
    dlTargetType,
    setDlTargetType,
    dlFilters,
    bookingOptions,
    bookableSessions,
    sponsorPackages,
    dlPreview,
    dlPreviewLoading,
    dynamicSaving,
    closeDynamicModal,
    handleDynamicSave,
    updateFilter,
  } = hook;

  if (!showDynamicModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {editingDynamicId ? 'Edit Dynamic List' : 'Create Dynamic List'}
          </h3>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={dlName}
              onChange={(e) => setDlName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
              placeholder="e.g. Tutorial Attendees from Germany"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={dlDescription}
              onChange={(e) => setDlDescription(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
              placeholder="Optional description"
            />
          </div>

          {!editingDynamicId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Target Type
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    checked={dlTargetType === 'registration'}
                    onChange={() => {
                      setDlTargetType('registration');
                    }}
                  />
                  Registrations
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    checked={dlTargetType === 'sponsor'}
                    onChange={() => {
                      setDlTargetType('sponsor');
                    }}
                  />
                  Sponsors
                </label>
              </div>
            </div>
          )}

          <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</h4>

            {dlTargetType === 'registration' && (
              <>
                {Array.isArray(bookingOptions) && bookingOptions.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Booking Options
                    </label>
                    <select
                      multiple
                      value={(dlFilters.booking_option_ids as string[]) ?? []}
                      onChange={(e) =>
                        updateFilter(
                          'booking_option_ids',
                          Array.from(e.target.selectedOptions, (o) => o.value)
                        )
                      }
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                      size={Math.min(4, bookingOptions.length)}
                    >
                      {bookingOptions.map((opt: { id: string; name: string }) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-0.5">Hold Ctrl/Cmd to select multiple</p>
                  </div>
                )}

                {Array.isArray(bookableSessions) && bookableSessions.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Bookable Sessions
                    </label>
                    <select
                      multiple
                      value={(dlFilters.session_ids as string[]) ?? []}
                      onChange={(e) =>
                        updateFilter(
                          'session_ids',
                          Array.from(e.target.selectedOptions, (o) => o.value)
                        )
                      }
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                      size={Math.min(4, bookableSessions.length)}
                    >
                      {bookableSessions.map((s: { id: string; title: string }) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-0.5">Hold Ctrl/Cmd to select multiple</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Country
                  </label>
                  <select
                    value={(dlFilters.country as string) ?? ''}
                    onChange={(e) => updateFilter('country', e.target.value || null)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="">Any country</option>
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={(dlFilters.city as string) ?? ''}
                    onChange={(e) => updateFilter('city', e.target.value || null)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                    placeholder="e.g. Berlin"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Company
                  </label>
                  <input
                    type="text"
                    value={(dlFilters.company as string) ?? ''}
                    onChange={(e) => updateFilter('company', e.target.value || null)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                    placeholder="e.g. Acme Corp"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Registration Mode
                  </label>
                  <select
                    value={(dlFilters.registration_mode as string) ?? ''}
                    onChange={(e) => updateFilter('registration_mode', e.target.value || null)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="">Any</option>
                    <option value="individual">Individual</option>
                    <option value="bulk">Bulk</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Status
                  </label>
                  <select
                    value={(dlFilters.status as string) ?? ''}
                    onChange={(e) => updateFilter('status', e.target.value || null)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="">Any</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="pending">Pending</option>
                    <option value="waitlisted">Waitlisted</option>
                  </select>
                </div>
              </>
            )}

            {dlTargetType === 'sponsor' && (
              <>
                {Array.isArray(sponsorPackages) && sponsorPackages.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Sponsor Packages
                    </label>
                    <select
                      multiple
                      value={(dlFilters.sponsor_package_ids as string[]) ?? []}
                      onChange={(e) =>
                        updateFilter(
                          'sponsor_package_ids',
                          Array.from(e.target.selectedOptions, (o) => o.value)
                        )
                      }
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                      size={Math.min(4, sponsorPackages.length)}
                    >
                      {sponsorPackages.map((pkg: { id: string; name: string }) => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-0.5">Hold Ctrl/Cmd to select multiple</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Country
                  </label>
                  <select
                    value={(dlFilters.country as string) ?? ''}
                    onChange={(e) => updateFilter('country', e.target.value || null)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="">Any country</option>
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={(dlFilters.city as string) ?? ''}
                    onChange={(e) => updateFilter('city', e.target.value || null)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                    placeholder="e.g. Berlin"
                  />
                </div>
              </>
            )}
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2 text-sm">
            {dlPreviewLoading ? (
              <span className="text-gray-500 dark:text-gray-400">Counting recipients...</span>
            ) : dlPreview ? (
              <span className="text-gray-700 dark:text-gray-300">
                Matches <span className="font-semibold">{dlPreview.total}</span> recipient
                {dlPreview.total !== 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-gray-400 dark:text-gray-500">
                Configure filters to see recipient count
              </span>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={closeDynamicModal}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleDynamicSave}
            disabled={!dlName.trim() || dynamicSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {dynamicSaving ? 'Saving...' : editingDynamicId ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
