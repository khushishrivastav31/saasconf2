import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../config/api";
import { useIsAdmin } from "../../../hooks/useIsAdmin";
import type {
  BookingPeriod,
  BookingPeriodCreate,
  BookingPackageCreate,
  BookingMatrix,
  PlatformCurrency,
  PaginatedResponse,
  DiscountCode,
  DiscountCodeCreate,
} from "../../../types";
import { parseApiError } from "../../../utils/apiError";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { ErrorBanner } from "../../../components/common/ErrorBanner";
import { LoadingSpinner } from "../../../components/common/LoadingSpinner";
import { DeleteIcon } from "../icons";

function ConferenceBookingTab({ conferenceId }: { conferenceId: string }) {
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const [showAddPeriod, setShowAddPeriod] = useState(false);
  const [showAddPackage, setShowAddPackage] = useState(false);
  const [newPeriodName, setNewPeriodName] = useState("");
  const [newPeriodStartDate, setNewPeriodStartDate] = useState("");
  const [newPeriodEndDate, setNewPeriodEndDate] = useState("");
  const [newPackageName, setNewPackageName] = useState("");
  const [newPeriodCurrency, setNewPeriodCurrency] = useState("EUR");
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [editingPackageName, setEditingPackageName] = useState("");
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [editingPeriodName, setEditingPeriodName] = useState("");
  const [editingPeriodStartDate, setEditingPeriodStartDate] = useState("");
  const [editingPeriodEndDate, setEditingPeriodEndDate] = useState("");
  const [editingPeriodCurrency, setEditingPeriodCurrency] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "period" | "package" | "discount"; id: string; name: string } | null>(null);
  const [apiError, setApiError] = useState("");

  // --- Discount code state ---
  const [showAddDiscount, setShowAddDiscount] = useState(false);
  const [newDiscountName, setNewDiscountName] = useState("");
  const [newDiscountCode, setNewDiscountCode] = useState("");
  const [newDiscountType, setNewDiscountType] = useState<"fixed" | "percentage">("percentage");
  const [newDiscountValue, setNewDiscountValue] = useState("");
  const [newDiscountCurrency, setNewDiscountCurrency] = useState("");
  const [newDiscountStartDate, setNewDiscountStartDate] = useState("");
  const [newDiscountEndDate, setNewDiscountEndDate] = useState("");
  const [newDiscountMaxUses, setNewDiscountMaxUses] = useState("0");
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);
  const [editingDiscount, setEditingDiscount] = useState<Partial<DiscountCode>>({});

  // Fetch booking matrix
  const { data: matrix, isLoading } = useQuery({
    queryKey: ["booking-matrix", conferenceId],
    queryFn: async () => {
      const response = await api.get<BookingMatrix>(
        `/conferences/${conferenceId}/settings/booking-matrix`
      );
      return response.data;
    },
  });

  // Fetch platform currencies for currency selector
  const { data: currencyOptions } = useQuery({
    queryKey: ["platform-currencies"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        "/admin/settings/currencies",
        { params: { page_size: 100, is_active: true } },
      );
      return response.data.items;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["booking-matrix", conferenceId] });
  };

  const invalidateDiscounts = () => {
    queryClient.invalidateQueries({ queryKey: ["discount-codes", conferenceId] });
  };

  // Fetch discount codes
  const { data: discountCodes } = useQuery({
    queryKey: ["discount-codes", conferenceId],
    queryFn: async () => {
      const response = await api.get<{ items: DiscountCode[]; total: number }>(
        `/conferences/${conferenceId}/settings/discount-codes`,
        { params: { conference_id: conferenceId } },
      );
      return response.data.items;
    },
  });

  // --- Period mutations ---
  const createPeriodMutation = useMutation({
    mutationFn: async (data: BookingPeriodCreate) => {
      await api.post(`/conferences/${conferenceId}/settings/booking-periods`, data);
    },
    onSuccess: () => {
      invalidate();
      setShowAddPeriod(false);
      setNewPeriodName("");
      setNewPeriodStartDate("");
      setNewPeriodEndDate("");
      setApiError("");
    },
    onError: (error) => setApiError(parseApiError(error)),
  });

  const updatePeriodMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      await api.put(`/conferences/${conferenceId}/settings/booking-periods/${id}`, data);
    },
    onSuccess: () => {
      invalidate();
      setEditingPeriodId(null);
      setApiError("");
    },
    onError: (error: unknown) => setApiError(parseApiError(error)),
  });

  const deletePeriodMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/settings/booking-periods/${id}`);
    },
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      setApiError("");
    },
    onError: (error) => setApiError(parseApiError(error)),
  });

  // --- Package mutations ---
  const createPackageMutation = useMutation({
    mutationFn: async (data: BookingPackageCreate) => {
      await api.post(`/conferences/${conferenceId}/settings/booking-packages`, data);
    },
    onSuccess: () => {
      invalidate();
      setShowAddPackage(false);
      setNewPackageName("");
      setApiError("");
    },
    onError: (error) => setApiError(parseApiError(error)),
  });

  const deletePackageMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/settings/booking-packages/${id}`);
    },
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      setApiError("");
    },
    onError: (error) => setApiError(parseApiError(error)),
  });

  const updatePackageMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      await api.put(`/conferences/${conferenceId}/settings/booking-packages/${id}`, data);
    },
    onSuccess: () => {
      invalidate();
      setEditingPackageId(null);
      setApiError("");
    },
    onError: (error: unknown) => setApiError(parseApiError(error)),
  });

  // --- Discount code mutations ---
  const createDiscountMutation = useMutation({
    mutationFn: async (data: DiscountCodeCreate) => {
      await api.post(`/conferences/${conferenceId}/settings/discount-codes`, data);
    },
    onSuccess: () => {
      invalidateDiscounts();
      setShowAddDiscount(false);
      setNewDiscountName("");
      setNewDiscountCode("");
      setNewDiscountType("percentage");
      setNewDiscountValue("");
      setNewDiscountCurrency("");
      setNewDiscountStartDate("");
      setNewDiscountEndDate("");
      setNewDiscountMaxUses("0");
      setApiError("");
    },
    onError: (error) => setApiError(parseApiError(error)),
  });

  const updateDiscountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      await api.put(`/conferences/${conferenceId}/settings/discount-codes/${id}`, data);
    },
    onSuccess: () => {
      invalidateDiscounts();
      setEditingDiscountId(null);
      setEditingDiscount({});
      setApiError("");
    },
    onError: (error: unknown) => setApiError(parseApiError(error)),
  });

  const deleteDiscountMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/settings/discount-codes/${id}`);
    },
    onSuccess: () => {
      invalidateDiscounts();
      setDeleteTarget(null);
      setApiError("");
    },
    onError: (error) => setApiError(parseApiError(error)),
  });

  // --- Price cell update ---
  const handlePriceChange = (period: BookingPeriod, packageId: string, value: string) => {
    const numValue = parseFloat(value);
    const updatedPrices = { ...(period.prices || {}) };
    if (value === "" || isNaN(numValue)) {
      delete updatedPrices[packageId];
    } else {
      updatedPrices[packageId] = numValue;
    }
    updatePeriodMutation.mutate({
      id: period.id,
      data: { prices: updatedPrices },
    });
  };

  // --- Save period inline edits ---
  const handleSavePeriodEdits = (period: BookingPeriod) => {
    const updates: Record<string, unknown> = {};
    const trimmedName = editingPeriodName.trim();
    if (trimmedName && trimmedName !== period.name) updates.name = trimmedName;
    if (editingPeriodStartDate && editingPeriodStartDate !== period.start_date) updates.start_date = editingPeriodStartDate;
    if (editingPeriodEndDate && editingPeriodEndDate !== period.end_date) updates.end_date = editingPeriodEndDate;
    if (editingPeriodCurrency !== (period.currency || "")) updates.currency = editingPeriodCurrency || null;

    if (Object.keys(updates).length > 0) {
      updatePeriodMutation.mutate({ id: period.id, data: updates });
    } else {
      setEditingPeriodId(null);
    }
  };

  // --- Handle delete confirmation ---
  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "period") {
      deletePeriodMutation.mutate(deleteTarget.id);
    } else if (deleteTarget.type === "package") {
      deletePackageMutation.mutate(deleteTarget.id);
    } else if (deleteTarget.type === "discount") {
      deleteDiscountMutation.mutate(deleteTarget.id);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const periods = matrix?.periods || [];
  const packages = matrix?.packages || [];

  const startEditPeriod = (period: BookingPeriod) => {
    setEditingPeriodId(period.id);
    setEditingPeriodName(period.name);
    setEditingPeriodStartDate(period.start_date);
    setEditingPeriodEndDate(period.end_date);
    setEditingPeriodCurrency(period.currency || "");
  };

  return (
    <div>
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

      <ErrorBanner message={apiError} />

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
                    createPeriodMutation.mutate({
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
                    createPackageMutation.mutate({
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
                            onClick={() => handleSavePeriodEdits(period)}
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
                        onClick={isAdmin ? () => startEditPeriod(period) : undefined}
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
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "period", id: period.id, name: period.name }); }}
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
                            updatePackageMutation.mutate({ id: pkg.id, data: { name: trimmed } });
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
                                handlePriceChange(period, pkg.id, newVal);
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
                        onClick={() => setDeleteTarget({ type: "package", id: pkg.id, name: pkg.name })}
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

      {/* Discount Codes Section */}
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
                    createDiscountMutation.mutate({
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
                                    updateDiscountMutation.mutate({ id: dc.id, data: updates });
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
                                onClick={() => setDeleteTarget({ type: "discount", id: dc.id, name: dc.code })}
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

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.type === "period" ? "Period" : deleteTarget?.type === "package" ? "Package" : "Discount Code"}`}
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default ConferenceBookingTab;
