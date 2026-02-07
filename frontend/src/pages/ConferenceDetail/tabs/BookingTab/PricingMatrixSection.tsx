import type {
  BookingPeriod,
  BookingPeriodCreate,
  BookingPackage,
  BookingPackageCreate,
  PlatformCurrency,
} from "../../../../types";
import { DeleteIcon } from "../../icons";

export interface PricingMatrixSectionProps {
  isAdmin: boolean;
  periods: BookingPeriod[];
  packages: BookingPackage[];
  currencyOptions: PlatformCurrency[] | undefined;
  // Add period form
  showAddPeriod: boolean;
  setShowAddPeriod: (v: boolean) => void;
  newPeriodName: string;
  setNewPeriodName: (v: string) => void;
  newPeriodStartDate: string;
  setNewPeriodStartDate: (v: string) => void;
  newPeriodEndDate: string;
  setNewPeriodEndDate: (v: string) => void;
  newPeriodCurrency: string;
  setNewPeriodCurrency: (v: string) => void;
  onCreatePeriod: (data: BookingPeriodCreate) => void;
  // Add package form
  showAddPackage: boolean;
  setShowAddPackage: (v: boolean) => void;
  newPackageName: string;
  setNewPackageName: (v: string) => void;
  onCreatePackage: (data: BookingPackageCreate) => void;
  // Edit period
  editingPeriodId: string | null;
  setEditingPeriodId: (v: string | null) => void;
  editingPeriodName: string;
  setEditingPeriodName: (v: string) => void;
  editingPeriodStartDate: string;
  setEditingPeriodStartDate: (v: string) => void;
  editingPeriodEndDate: string;
  setEditingPeriodEndDate: (v: string) => void;
  editingPeriodCurrency: string;
  setEditingPeriodCurrency: (v: string) => void;
  onSavePeriodEdits: (period: BookingPeriod) => void;
  onStartEditPeriod: (period: BookingPeriod) => void;
  // Edit package
  editingPackageId: string | null;
  setEditingPackageId: (v: string | null) => void;
  editingPackageName: string;
  setEditingPackageName: (v: string) => void;
  onUpdatePackage: (id: string, data: Record<string, unknown>) => void;
  // Price and delete
  onPriceChange: (period: BookingPeriod, packageId: string, value: string) => void;
  onDeleteTarget: (target: { type: "period" | "package" | "discount"; id: string; name: string }) => void;
  setApiError: (v: string) => void;
}

export default function PricingMatrixSection({
  isAdmin,
  periods,
  packages,
  currencyOptions,
  showAddPeriod,
  setShowAddPeriod,
  newPeriodName,
  setNewPeriodName,
  newPeriodStartDate,
  setNewPeriodStartDate,
  newPeriodEndDate,
  setNewPeriodEndDate,
  newPeriodCurrency,
  setNewPeriodCurrency,
  onCreatePeriod,
  showAddPackage,
  setShowAddPackage,
  newPackageName,
  setNewPackageName,
  onCreatePackage,
  editingPeriodId,
  setEditingPeriodId,
  editingPeriodName,
  setEditingPeriodName,
  editingPeriodStartDate,
  setEditingPeriodStartDate,
  editingPeriodEndDate,
  setEditingPeriodEndDate,
  editingPeriodCurrency,
  setEditingPeriodCurrency,
  onSavePeriodEdits,
  onStartEditPeriod,
  editingPackageId,
  setEditingPackageId,
  editingPackageName,
  setEditingPackageName,
  onUpdatePackage,
  onPriceChange,
  onDeleteTarget,
  setApiError,
}: PricingMatrixSectionProps) {
  return (
    <>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Booking Options</h2>
          <p className="mt-1 text-sm text-gray-500">
            Define attendee packages and pricing periods for this conference.
          </p>
        </div>
        {isAdmin && (
          <div className="mt-3 sm:mt-0 flex gap-2">
            <button
              onClick={() => setShowAddPeriod(true)}
              className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              + Period
            </button>
            <button
              onClick={() => setShowAddPackage(true)}
              className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
            >
              + Package
            </button>
          </div>
        )}
      </div>

      {/* Add Period Form */}
      {showAddPeriod && (
        <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Add Pricing Period</h3>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
              <input
                type="text"
                placeholder="e.g. Early Bird"
                value={newPeriodName}
                onChange={(e) => setNewPeriodName(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start date</label>
              <input
                type="date"
                value={newPeriodStartDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setNewPeriodStartDate(v);
                  if (newPeriodEndDate && v && newPeriodEndDate < v) {
                    setNewPeriodEndDate(v);
                  }
                }}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End date</label>
              <input
                type="date"
                value={newPeriodEndDate}
                min={newPeriodStartDate}
                onChange={(e) => setNewPeriodEndDate(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
              <select
                value={newPeriodCurrency}
                onChange={(e) => setNewPeriodCurrency(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                {(currencyOptions || []).map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (newPeriodName && newPeriodStartDate && newPeriodEndDate) {
                    onCreatePeriod({
                      name: newPeriodName,
                      start_date: newPeriodStartDate,
                      end_date: newPeriodEndDate,
                      sort_order: periods.length,
                      currency: newPeriodCurrency,
                    });
                  }
                }}
                disabled={!newPeriodName || !newPeriodStartDate || !newPeriodEndDate}
                className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => { setShowAddPeriod(false); setApiError(""); }}
                className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Package Form */}
      {showAddPackage && (
        <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Add Booking Package</h3>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Package name</label>
              <input
                type="text"
                placeholder="e.g. Full Conference Pass"
                value={newPackageName}
                onChange={(e) => setNewPackageName(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (newPackageName) {
                    onCreatePackage({
                      name: newPackageName,
                      sort_order: packages.length,
                    });
                  }
                }}
                disabled={!newPackageName}
                className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => { setShowAddPackage(false); setApiError(""); }}
                className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Matrix Table */}
      {periods.length === 0 && packages.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
          </svg>
          <p className="mt-2 text-sm text-gray-500">No booking options defined yet.</p>
          <p className="text-sm text-gray-400">Add periods (columns) and packages (rows) to build your pricing matrix.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[220px] border-b border-gray-200">
                  Package
                </th>
                {periods.map((period) => (
                  <th key={period.id} className="px-4 py-4 text-center min-w-[200px] border-b border-gray-200">
                    {editingPeriodId === period.id ? (
                      <div className="flex flex-col gap-2 min-w-[180px]">
                        <input
                          type="text"
                          autoFocus
                          value={editingPeriodName}
                          onChange={(e) => setEditingPeriodName(e.target.value)}
                          className="w-full text-sm text-center font-medium rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                          placeholder="Period name"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="date"
                            value={editingPeriodStartDate}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditingPeriodStartDate(v);
                              if (editingPeriodEndDate && v && editingPeriodEndDate < v) {
                                setEditingPeriodEndDate(v);
                              }
                            }}
                            className="w-full text-xs rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                          />
                          <input
                            type="date"
                            value={editingPeriodEndDate}
                            min={editingPeriodStartDate}
                            onChange={(e) => setEditingPeriodEndDate(e.target.value)}
                            className="w-full text-xs rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                          />
                        </div>
                        <select
                          value={editingPeriodCurrency}
                          onChange={(e) => setEditingPeriodCurrency(e.target.value)}
                          className="w-full text-xs rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                        >
                          <option value="">No currency</option>
                          {(currencyOptions || []).map((c) => (
                            <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                          ))}
                        </select>
                        <div className="flex justify-center gap-1.5">
                          <button
                            onClick={() => onSavePeriodEdits(period)}
                            className="text-xs px-3 py-1 rounded-md bg-primary-600 text-white hover:bg-primary-700 font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingPeriodId(null)}
                            className="text-xs px-3 py-1 rounded-md bg-white text-gray-600 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`flex flex-col items-center gap-0.5 ${isAdmin ? "cursor-pointer group" : ""}`}
                        onClick={isAdmin ? () => onStartEditPeriod(period) : undefined}
                        title={isAdmin ? "Click to edit period" : undefined}
                      >
                        <span className={`text-sm font-semibold text-gray-800 ${isAdmin ? "group-hover:text-primary-600" : ""} transition-colors`}>
                          {period.name}
                        </span>
                        <span className={`text-xs text-gray-400 ${isAdmin ? "group-hover:text-gray-500" : ""}`}>
                          {new Date(period.start_date + "T00:00:00").toLocaleDateString()} — {new Date(period.end_date + "T00:00:00").toLocaleDateString()}
                        </span>
                        {period.currency && (
                          <span className={`mt-0.5 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 ${isAdmin ? "group-hover:bg-primary-50 group-hover:text-primary-700" : ""}`}>
                            {period.currency}
                          </span>
                        )}
                        {isAdmin && (
                          <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs text-primary-500 font-medium">Edit</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onDeleteTarget({ type: "period", id: period.id, name: period.name }); }}
                              className="text-xs text-red-400 hover:text-red-600 font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </th>
                ))}
                {isAdmin && (
                  <th className="px-4 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-[60px] border-b border-gray-200">
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {packages.map((pkg) => (
                <tr key={pkg.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    {editingPackageId === pkg.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingPackageName}
                        onChange={(e) => setEditingPackageName(e.target.value)}
                        onBlur={() => {
                          const trimmed = editingPackageName.trim();
                          if (trimmed && trimmed !== pkg.name) {
                            onUpdatePackage(pkg.id, { name: trimmed });
                          } else {
                            setEditingPackageId(null);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") {
                            setEditingPackageId(null);
                          }
                        }}
                        className="w-full text-sm font-medium rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                      />
                    ) : (
                      <div className={`flex items-center ${isAdmin ? "group" : ""}`}>
                        <span
                          className={`text-sm font-medium text-gray-900 ${isAdmin ? "cursor-pointer group-hover:text-primary-600" : ""} transition-colors`}
                          onClick={isAdmin ? () => {
                            setEditingPackageId(pkg.id);
                            setEditingPackageName(pkg.name);
                          } : undefined}
                          title={isAdmin ? "Click to edit" : undefined}
                        >
                          {pkg.name}
                        </span>
                        {isAdmin && (
                          <svg
                            className="ml-1.5 w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        )}
                      </div>
                    )}
                  </td>
                  {periods.map((period) => {
                    const priceValue = period.prices?.[pkg.id];
                    return (
                      <td key={period.id} className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {period.currency && (
                            <span className="text-xs text-gray-400 font-medium flex-shrink-0">{period.currency}</span>
                          )}
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={priceValue != null ? priceValue : ""}
                            readOnly={!isAdmin}
                            onBlur={isAdmin ? (e) => {
                              const newVal = e.target.value;
                              const oldVal = priceValue != null ? String(priceValue) : "";
                              if (newVal !== oldVal) {
                                onPriceChange(period, pkg.id, newVal);
                              }
                            } : undefined}
                            className={`w-full max-w-[110px] text-right text-sm rounded-md border-gray-300 shadow-sm tabular-nums ${isAdmin ? "focus:border-primary-500 focus:ring-primary-500" : "bg-gray-50 cursor-default"}`}
                            placeholder="—"
                          />
                        </div>
                      </td>
                    );
                  })}
                  {isAdmin && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => onDeleteTarget({ type: "package", id: pkg.id, name: pkg.name })}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                        title="Delete package"
                      >
                        <DeleteIcon />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
