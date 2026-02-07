import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../../config/api";
import { useIsAdmin } from "../../../../hooks/useIsAdmin";
import type {
  BookingPeriod,
  BookingPeriodCreate,
  BookingPackageCreate,
  BookingMatrix,
  PlatformCurrency,
  PaginatedResponse,
  DiscountCode,
  DiscountCodeCreate,
} from "../../../../types";
import { parseApiError } from "../../../../utils/apiError";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import { ErrorBanner } from "../../../../components/common/ErrorBanner";
import { LoadingSpinner } from "../../../../components/common/LoadingSpinner";
import PricingMatrixSection from "./PricingMatrixSection";
import DiscountCodesSection from "./DiscountCodesSection";

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
      <ErrorBanner message={apiError} />

      <PricingMatrixSection
        isAdmin={isAdmin}
        periods={periods}
        packages={packages}
        currencyOptions={currencyOptions}
        showAddPeriod={showAddPeriod}
        setShowAddPeriod={setShowAddPeriod}
        newPeriodName={newPeriodName}
        setNewPeriodName={setNewPeriodName}
        newPeriodStartDate={newPeriodStartDate}
        setNewPeriodStartDate={setNewPeriodStartDate}
        newPeriodEndDate={newPeriodEndDate}
        setNewPeriodEndDate={setNewPeriodEndDate}
        newPeriodCurrency={newPeriodCurrency}
        setNewPeriodCurrency={setNewPeriodCurrency}
        onCreatePeriod={(data) => createPeriodMutation.mutate(data)}
        showAddPackage={showAddPackage}
        setShowAddPackage={setShowAddPackage}
        newPackageName={newPackageName}
        setNewPackageName={setNewPackageName}
        onCreatePackage={(data) => createPackageMutation.mutate(data)}
        editingPeriodId={editingPeriodId}
        setEditingPeriodId={setEditingPeriodId}
        editingPeriodName={editingPeriodName}
        setEditingPeriodName={setEditingPeriodName}
        editingPeriodStartDate={editingPeriodStartDate}
        setEditingPeriodStartDate={setEditingPeriodStartDate}
        editingPeriodEndDate={editingPeriodEndDate}
        setEditingPeriodEndDate={setEditingPeriodEndDate}
        editingPeriodCurrency={editingPeriodCurrency}
        setEditingPeriodCurrency={setEditingPeriodCurrency}
        onSavePeriodEdits={handleSavePeriodEdits}
        onStartEditPeriod={startEditPeriod}
        editingPackageId={editingPackageId}
        setEditingPackageId={setEditingPackageId}
        editingPackageName={editingPackageName}
        setEditingPackageName={setEditingPackageName}
        onUpdatePackage={(id, data) => updatePackageMutation.mutate({ id, data })}
        onPriceChange={handlePriceChange}
        onDeleteTarget={setDeleteTarget}
        setApiError={setApiError}
      />

      <DiscountCodesSection
        isAdmin={isAdmin}
        discountCodes={discountCodes}
        currencyOptions={currencyOptions}
        showAddDiscount={showAddDiscount}
        setShowAddDiscount={setShowAddDiscount}
        newDiscountName={newDiscountName}
        setNewDiscountName={setNewDiscountName}
        newDiscountCode={newDiscountCode}
        setNewDiscountCode={setNewDiscountCode}
        newDiscountType={newDiscountType}
        setNewDiscountType={setNewDiscountType}
        newDiscountValue={newDiscountValue}
        setNewDiscountValue={setNewDiscountValue}
        newDiscountCurrency={newDiscountCurrency}
        setNewDiscountCurrency={setNewDiscountCurrency}
        newDiscountStartDate={newDiscountStartDate}
        setNewDiscountStartDate={setNewDiscountStartDate}
        newDiscountEndDate={newDiscountEndDate}
        setNewDiscountEndDate={setNewDiscountEndDate}
        newDiscountMaxUses={newDiscountMaxUses}
        setNewDiscountMaxUses={setNewDiscountMaxUses}
        onCreateDiscount={(data) => createDiscountMutation.mutate(data)}
        editingDiscountId={editingDiscountId}
        setEditingDiscountId={setEditingDiscountId}
        editingDiscount={editingDiscount}
        setEditingDiscount={setEditingDiscount}
        onUpdateDiscount={(id, data) => updateDiscountMutation.mutate({ id, data })}
        onDeleteTarget={setDeleteTarget}
        setApiError={setApiError}
      />

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
