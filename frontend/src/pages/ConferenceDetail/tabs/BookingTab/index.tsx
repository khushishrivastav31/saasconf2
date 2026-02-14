import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../../config/api";
import type {
  BookingPeriod,
  BookingPeriodCreate,
  BookingOptionCreate,
  BookingPackage,
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
import PackagesSection from "./PackagesSection";
import DiscountCodesSection from "./DiscountCodesSection";
import AddOptionModal from "./AddOptionModal";
import AddPeriodModal from "./AddPeriodModal";
import AddPackageModal from "./AddPackageModal";
import EditPackageModal from "./EditPackageModal";
import AddDiscountModal from "./AddDiscountModal";
import EditDiscountModal from "./EditDiscountModal";

interface BookingTabProps {
  conferenceId: string;
  isAdmin: boolean;
  conferenceCurrency?: string | null;
}

function ConferenceBookingTab({ conferenceId, isAdmin, conferenceCurrency }: BookingTabProps) {
  const queryClient = useQueryClient();

  // Modal state
  const [showAddPeriod, setShowAddPeriod] = useState(false);
  const [showAddOption, setShowAddOption] = useState(false);
  const [showAddPackage, setShowAddPackage] = useState(false);
  const [editingPackage, setEditingPackage] = useState<BookingPackage | null>(null);
  const [showAddDiscount, setShowAddDiscount] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<DiscountCode | null>(null);

  // Inline editing state (kept for table row editing)
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingOptionName, setEditingOptionName] = useState("");
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [editingPeriodName, setEditingPeriodName] = useState("");
  const [editingPeriodStartDate, setEditingPeriodStartDate] = useState("");
  const [editingPeriodEndDate, setEditingPeriodEndDate] = useState("");
  const [editingPeriodCurrency, setEditingPeriodCurrency] = useState("");

  // Delete confirmation and errors
  const [deleteTarget, setDeleteTarget] = useState<{ type: "period" | "option" | "package" | "discount"; id: string; name: string } | null>(null);
  const [apiError, setApiError] = useState("");

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

  // --- Option mutations ---
  const createOptionMutation = useMutation({
    mutationFn: async (data: BookingOptionCreate) => {
      await api.post(`/conferences/${conferenceId}/settings/booking-options`, data);
    },
    onSuccess: () => {
      invalidate();
      setShowAddOption(false);
      setApiError("");
    },
    onError: (error) => setApiError(parseApiError(error)),
  });

  const deleteOptionMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/settings/booking-options/${id}`);
    },
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      setApiError("");
    },
    onError: (error) => setApiError(parseApiError(error)),
  });

  const updateOptionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      await api.put(`/conferences/${conferenceId}/settings/booking-options/${id}`, data);
    },
    onSuccess: () => {
      invalidate();
      setEditingOptionId(null);
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
      setEditingDiscount(null);
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

  // --- Package mutations ---
  const createPackageMutation = useMutation({
    mutationFn: async (data: BookingPackageCreate) => {
      await api.post(`/conferences/${conferenceId}/settings/booking-packages`, data);
    },
    onSuccess: () => {
      invalidate();
      setShowAddPackage(false);
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
      setEditingPackage(null);
      setApiError("");
    },
    onError: (error: unknown) => setApiError(parseApiError(error)),
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
    } else if (deleteTarget.type === "option") {
      deleteOptionMutation.mutate(deleteTarget.id);
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
  const options = matrix?.options || [];
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
        options={options}
        currencyOptions={currencyOptions}
        conferenceCurrency={conferenceCurrency}
        onAddPeriod={() => setShowAddPeriod(true)}
        onAddOption={() => setShowAddOption(true)}
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
        editingOptionId={editingOptionId}
        setEditingOptionId={setEditingOptionId}
        editingOptionName={editingOptionName}
        setEditingOptionName={setEditingOptionName}
        onUpdateOption={(id, data) => updateOptionMutation.mutate({ id, data })}
        onPriceChange={handlePriceChange}
        onDeleteTarget={setDeleteTarget}
      />

      <PackagesSection
        isAdmin={isAdmin}
        packages={packages}
        options={options}
        periods={periods}
        conferenceCurrency={conferenceCurrency}
        onAddPackage={() => setShowAddPackage(true)}
        onEditPackage={(pkg) => setEditingPackage(pkg)}
        onDeleteTarget={setDeleteTarget}
      />

      <DiscountCodesSection
        isAdmin={isAdmin}
        discountCodes={discountCodes}
        bookingOptions={options}
        onAddDiscount={() => setShowAddDiscount(true)}
        onEditDiscount={(dc) => setEditingDiscount(dc)}
        onDeleteTarget={setDeleteTarget}
      />

      {/* Modals */}
      <AddPeriodModal
        open={showAddPeriod}
        onClose={() => setShowAddPeriod(false)}
        onSubmit={(data) => createPeriodMutation.mutate(data)}
        existingCount={periods.length}
        currencyOptions={currencyOptions}
        conferenceCurrency={conferenceCurrency}
      />

      <AddOptionModal
        open={showAddOption}
        onClose={() => setShowAddOption(false)}
        onSubmit={(data) => createOptionMutation.mutate(data)}
        existingCount={options.length}
      />

      <AddPackageModal
        open={showAddPackage}
        onClose={() => setShowAddPackage(false)}
        onSubmit={(data) => createPackageMutation.mutate(data)}
        bookingOptions={options}
        existingCount={packages.length}
      />

      <EditPackageModal
        open={!!editingPackage}
        onClose={() => setEditingPackage(null)}
        onSubmit={(id, data) => updatePackageMutation.mutate({ id, data })}
        package_={editingPackage}
        bookingOptions={options}
      />

      <AddDiscountModal
        open={showAddDiscount}
        onClose={() => setShowAddDiscount(false)}
        onSubmit={(data) => createDiscountMutation.mutate(data)}
        bookingOptions={options}
        currencyOptions={currencyOptions}
        conferenceCurrency={conferenceCurrency}
      />

      <EditDiscountModal
        open={!!editingDiscount}
        onClose={() => setEditingDiscount(null)}
        onSubmit={(id, data) => updateDiscountMutation.mutate({ id, data })}
        discount={editingDiscount}
        bookingOptions={options}
        currencyOptions={currencyOptions}
        conferenceCurrency={conferenceCurrency}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.type === "period" ? "Period" : deleteTarget?.type === "option" ? "Option" : deleteTarget?.type === "package" ? "Package" : "Discount Code"}`}
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default ConferenceBookingTab;
