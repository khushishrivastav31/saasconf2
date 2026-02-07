import type React from "react";
import type {
  DiscountCode,
  DiscountCodeCreate,
  PlatformCurrency,
} from "../../../../types";

export interface DiscountCodesSectionProps {
  isAdmin: boolean;
  discountCodes: DiscountCode[] | undefined;
  currencyOptions: PlatformCurrency[] | undefined;
  // Add discount form state
  showAddDiscount: boolean;
  setShowAddDiscount: (v: boolean) => void;
  newDiscountName: string;
  setNewDiscountName: (v: string) => void;
  newDiscountCode: string;
  setNewDiscountCode: (v: string) => void;
  newDiscountType: "fixed" | "percentage";
  setNewDiscountType: (v: "fixed" | "percentage") => void;
  newDiscountValue: string;
  setNewDiscountValue: (v: string) => void;
  newDiscountCurrency: string;
  setNewDiscountCurrency: (v: string) => void;
  newDiscountStartDate: string;
  setNewDiscountStartDate: (v: string) => void;
  newDiscountEndDate: string;
  setNewDiscountEndDate: (v: string) => void;
  newDiscountMaxUses: string;
  setNewDiscountMaxUses: (v: string) => void;
  onCreateDiscount: (data: DiscountCodeCreate) => void;
  // Edit discount
  editingDiscountId: string | null;
  setEditingDiscountId: (v: string | null) => void;
  editingDiscount: Partial<DiscountCode>;
  setEditingDiscount: React.Dispatch<React.SetStateAction<Partial<DiscountCode>>>;
  onUpdateDiscount: (id: string, data: Record<string, unknown>) => void;
  onDeleteTarget: (target: { type: "period" | "package" | "discount"; id: string; name: string }) => void;
  setApiError: (v: string) => void;
}

export default function DiscountCodesSection({
  isAdmin,
  discountCodes,
  currencyOptions,
  showAddDiscount,
  setShowAddDiscount,
  newDiscountName,
  setNewDiscountName,
  newDiscountCode,
  setNewDiscountCode,
  newDiscountType,
  setNewDiscountType,
  newDiscountValue,
  setNewDiscountValue,
  newDiscountCurrency,
  setNewDiscountCurrency,
  newDiscountStartDate,
  setNewDiscountStartDate,
  newDiscountEndDate,
  setNewDiscountEndDate,
  newDiscountMaxUses,
  setNewDiscountMaxUses,
  onCreateDiscount,
  editingDiscountId,
  setEditingDiscountId,
  editingDiscount,
  setEditingDiscount,
  onUpdateDiscount,
  onDeleteTarget,
  setApiError,
}: DiscountCodesSectionProps) {
  return (
    <div className="mt-10">
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Discount Codes</h3>
          <p className="mt-0.5 text-sm text-gray-500">Manage discount codes for attendee bookings.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddDiscount(true)}
            className="mt-2 sm:mt-0 inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            + Discount Code
          </button>
        )}
      </div>

      {/* Add Discount Form */}
      {showAddDiscount && (
        <div className="mb-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Add Discount Code</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
              <input
                type="text"
                placeholder="e.g. Early Sponsor"
                value={newDiscountName}
                onChange={(e) => setNewDiscountName(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Code</label>
              <input
                type="text"
                placeholder="e.g. EARLY20"
                value={newDiscountCode}
                onChange={(e) => setNewDiscountCode(e.target.value.toUpperCase())}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select
                value={newDiscountType}
                onChange={(e) => setNewDiscountType(e.target.value as "fixed" | "percentage")}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Value {newDiscountType === "percentage" ? "(%)" : ""}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={newDiscountType === "percentage" ? "100" : undefined}
                placeholder={newDiscountType === "percentage" ? "e.g. 20" : "e.g. 50.00"}
                value={newDiscountValue}
                onChange={(e) => setNewDiscountValue(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            {newDiscountType === "fixed" && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                <select
                  value={newDiscountCurrency}
                  onChange={(e) => setNewDiscountCurrency(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                >
                  <option value="">Select currency</option>
                  {(currencyOptions || []).map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start date (optional)</label>
              <input
                type="date"
                value={newDiscountStartDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setNewDiscountStartDate(v);
                  if (newDiscountEndDate && v && newDiscountEndDate < v) {
                    setNewDiscountEndDate(v);
                  }
                }}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End date (optional)</label>
              <input
                type="date"
                value={newDiscountEndDate}
                min={newDiscountStartDate}
                onChange={(e) => setNewDiscountEndDate(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Max uses (0 = unlimited)</label>
              <input
                type="number"
                min="0"
                value={newDiscountMaxUses}
                onChange={(e) => setNewDiscountMaxUses(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                if (newDiscountName && newDiscountCode && newDiscountValue) {
                  onCreateDiscount({
                    name: newDiscountName,
                    code: newDiscountCode,
                    discount_type: newDiscountType,
                    discount_value: parseFloat(newDiscountValue),
                    currency: newDiscountType === "fixed" && newDiscountCurrency ? newDiscountCurrency : null,
                    start_date: newDiscountStartDate || null,
                    end_date: newDiscountEndDate || null,
                    max_uses: parseInt(newDiscountMaxUses) || 0,
                  });
                }
              }}
              disabled={!newDiscountName || !newDiscountCode || !newDiscountValue}
              className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => { setShowAddDiscount(false); setApiError(""); }}
              className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Discount Codes List */}
      {(discountCodes || []).length === 0 && !showAddDiscount ? (
        <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
          <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <p className="mt-2 text-sm text-gray-500">No discount codes yet.</p>
        </div>
      ) : (discountCodes || []).length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Discount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Valid Period</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Max Uses</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</th>
                {isAdmin && (
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-[80px]"></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(discountCodes || []).map((dc) => (
                <tr key={dc.id} className="hover:bg-gray-50/50 transition-colors">
                  {editingDiscountId === dc.id ? (
                    <>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={editingDiscount.code ?? dc.code}
                          onChange={(e) => setEditingDiscount(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                          className="w-full text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 font-mono"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={editingDiscount.name ?? dc.name}
                          onChange={(e) => setEditingDiscount(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <select
                            value={editingDiscount.discount_type ?? dc.discount_type}
                            onChange={(e) => setEditingDiscount(prev => ({ ...prev, discount_type: e.target.value as "fixed" | "percentage" }))}
                            className="text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                          >
                            <option value="percentage">%</option>
                            <option value="fixed">Fixed</option>
                          </select>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editingDiscount.discount_value ?? dc.discount_value}
                            onChange={(e) => setEditingDiscount(prev => ({ ...prev, discount_value: parseFloat(e.target.value) }))}
                            className="w-20 text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                          />
                          {(editingDiscount.discount_type ?? dc.discount_type) === "fixed" && (
                            <select
                              value={editingDiscount.currency ?? dc.currency ?? ""}
                              onChange={(e) => setEditingDiscount(prev => ({ ...prev, currency: e.target.value || null }))}
                              className="text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                            >
                              <option value="">---</option>
                              {(currencyOptions || []).map((c) => (
                                <option key={c.code} value={c.code}>{c.code}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <input
                            type="date"
                            value={editingDiscount.start_date ?? dc.start_date ?? ""}
                            onChange={(e) => {
                              const newStart = e.target.value || null;
                              setEditingDiscount(prev => {
                                const currentEnd = prev.end_date ?? dc.end_date ?? "";
                                const adjustEnd = currentEnd && newStart && currentEnd < newStart;
                                return { ...prev, start_date: newStart, ...(adjustEnd ? { end_date: newStart } : {}) };
                              });
                            }}
                            className="text-xs rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                          />
                          <input
                            type="date"
                            value={editingDiscount.end_date ?? dc.end_date ?? ""}
                            min={editingDiscount.start_date ?? dc.start_date ?? ""}
                            onChange={(e) => setEditingDiscount(prev => ({ ...prev, end_date: e.target.value || null }))}
                            className="text-xs rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          value={editingDiscount.max_uses ?? dc.max_uses}
                          onChange={(e) => setEditingDiscount(prev => ({ ...prev, max_uses: parseInt(e.target.value) || 0 }))}
                          className="w-20 text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={editingDiscount.is_active ?? dc.is_active}
                          onChange={(e) => setEditingDiscount(prev => ({ ...prev, is_active: e.target.checked }))}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1.5 justify-center">
                            <button
                              onClick={() => {
                                const updates: Record<string, unknown> = {};
                                if (editingDiscount.code !== undefined && editingDiscount.code !== dc.code) updates.code = editingDiscount.code;
                                if (editingDiscount.name !== undefined && editingDiscount.name !== dc.name) updates.name = editingDiscount.name;
                                if (editingDiscount.discount_type !== undefined && editingDiscount.discount_type !== dc.discount_type) updates.discount_type = editingDiscount.discount_type;
                                if (editingDiscount.discount_value !== undefined && editingDiscount.discount_value !== dc.discount_value) updates.discount_value = editingDiscount.discount_value;
                                if (editingDiscount.currency !== undefined && editingDiscount.currency !== dc.currency) updates.currency = editingDiscount.currency;
                                if (editingDiscount.start_date !== undefined && editingDiscount.start_date !== dc.start_date) updates.start_date = editingDiscount.start_date;
                                if (editingDiscount.end_date !== undefined && editingDiscount.end_date !== dc.end_date) updates.end_date = editingDiscount.end_date;
                                if (editingDiscount.max_uses !== undefined && editingDiscount.max_uses !== dc.max_uses) updates.max_uses = editingDiscount.max_uses;
                                if (editingDiscount.is_active !== undefined && editingDiscount.is_active !== dc.is_active) updates.is_active = editingDiscount.is_active;
                                if (Object.keys(updates).length > 0) {
                                  onUpdateDiscount(dc.id, updates);
                                } else {
                                  setEditingDiscountId(null);
                                  setEditingDiscount({});
                                }
                              }}
                              className="text-xs px-2 py-1 rounded-md bg-primary-600 text-white hover:bg-primary-700 font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingDiscountId(null); setEditingDiscount({}); }}
                              className="text-xs px-2 py-1 rounded-md bg-white text-gray-600 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      )}
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono font-medium text-gray-900">{dc.code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">{dc.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                          {dc.discount_type === "percentage"
                            ? `${dc.discount_value}%`
                            : `${dc.currency || ""} ${dc.discount_value}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {dc.start_date || dc.end_date ? (
                          <>
                            {dc.start_date ? new Date(dc.start_date + "T00:00:00").toLocaleDateString() : "---"}
                            {" — "}
                            {dc.end_date ? new Date(dc.end_date + "T00:00:00").toLocaleDateString() : "---"}
                          </>
                        ) : (
                          <span className="text-gray-400">No expiry</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {dc.max_uses === 0 ? "Unlimited" : dc.max_uses}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${dc.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {dc.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => { setEditingDiscountId(dc.id); setEditingDiscount({}); }}
                              className="text-xs text-primary-500 hover:text-primary-700 font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => onDeleteTarget({ type: "discount", id: dc.id, name: dc.code })}
                              className="text-xs text-red-400 hover:text-red-600 font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
