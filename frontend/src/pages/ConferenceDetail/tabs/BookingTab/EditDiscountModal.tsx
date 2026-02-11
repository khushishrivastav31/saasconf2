import { useState, useEffect } from "react";
import Modal from "../../../../components/Modal";
import type {
  BookingOption,
  DiscountCode,
  PlatformCurrency,
} from "../../../../types";

interface EditDiscountModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (id: string, data: Record<string, unknown>) => void;
  discount: DiscountCode | null;
  bookingOptions: BookingOption[];
  currencyOptions: PlatformCurrency[] | undefined;
  conferenceCurrency?: string | null;
}

export default function EditDiscountModal({
  open,
  onClose,
  onSubmit,
  discount,
  bookingOptions,
  currencyOptions,
  conferenceCurrency,
}: EditDiscountModalProps) {
  // Use conference currency if set
  const isCurrencyLocked = !!conferenceCurrency;
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [currency, setCurrency] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxUses, setMaxUses] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [applicableOptions, setApplicableOptions] = useState<string[]>([]);

  // Populate form when discount changes
  useEffect(() => {
    if (discount) {
      setName(discount.name);
      setCode(discount.code);
      setDiscountType(discount.discount_type);
      setDiscountValue(String(discount.discount_value));
      setCurrency(discount.currency || "");
      setStartDate(discount.start_date || "");
      setEndDate(discount.end_date || "");
      setMaxUses(String(discount.max_uses));
      setIsActive(discount.is_active);
      setApplicableOptions(discount.applicable_option_ids || []);
    }
  }, [discount]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!discount || !name.trim() || !code.trim() || !discountValue) return;

    const updates: Record<string, unknown> = {};

    if (name.trim() !== discount.name) updates.name = name.trim();
    if (code.trim().toUpperCase() !== discount.code) updates.code = code.trim().toUpperCase();
    if (discountType !== discount.discount_type) updates.discount_type = discountType;
    if (parseFloat(discountValue) !== discount.discount_value) updates.discount_value = parseFloat(discountValue);

    // Use conference currency if locked, otherwise use selected currency
    const effectiveCurrency = isCurrencyLocked ? conferenceCurrency : currency;
    const newCurrency = discountType === "fixed" && effectiveCurrency ? effectiveCurrency : null;
    if (newCurrency !== discount.currency) updates.currency = newCurrency;

    const newStartDate = startDate || null;
    if (newStartDate !== discount.start_date) updates.start_date = newStartDate;

    const newEndDate = endDate || null;
    if (newEndDate !== discount.end_date) updates.end_date = newEndDate;

    if (parseInt(maxUses) !== discount.max_uses) updates.max_uses = parseInt(maxUses) || 0;
    if (isActive !== discount.is_active) updates.is_active = isActive;

    const oldIds = [...(discount.applicable_option_ids || [])].sort();
    const newIds = [...applicableOptions].sort();
    if (JSON.stringify(oldIds) !== JSON.stringify(newIds)) {
      updates.applicable_option_ids = applicableOptions;
    }

    if (Object.keys(updates).length > 0) {
      onSubmit(discount.id, updates);
    } else {
      onClose();
    }
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    if (endDate && value && endDate < value) {
      setEndDate(value);
    }
  };

  const toggleOption = (optionId: string) => {
    setApplicableOptions((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    );
  };

  if (!discount) return null;

  return (
    <Modal open={open} onClose={onClose} title="Edit Discount Code" size="max-w-lg">
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-discount-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-discount-name"
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Early Sponsor"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label htmlFor="edit-discount-code" className="block text-sm font-medium text-gray-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-discount-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. EARLY20"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="edit-discount-type" className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                id="edit-discount-type"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "fixed" | "percentage")}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-discount-value" className="block text-sm font-medium text-gray-700 mb-1">
                Value <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-discount-value"
                type="number"
                step="0.01"
                min="0"
                max={discountType === "percentage" ? "100" : undefined}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "percentage" ? "e.g. 20" : "e.g. 50.00"}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            {discountType === "fixed" && (
              <div>
                <label htmlFor="edit-discount-currency" className="block text-sm font-medium text-gray-700 mb-1">
                  Currency
                </label>
                {isCurrencyLocked ? (
                  <input
                    id="edit-discount-currency"
                    type="text"
                    value={conferenceCurrency || ""}
                    disabled
                    title="Set by conference"
                    className="block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm text-sm text-gray-600"
                  />
                ) : (
                  <select
                    id="edit-discount-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                  >
                    <option value="">Select...</option>
                    {(currencyOptions || []).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-discount-start" className="block text-sm font-medium text-gray-700 mb-1">
                Start Date <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="edit-discount-start"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label htmlFor="edit-discount-end" className="block text-sm font-medium text-gray-700 mb-1">
                End Date <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="edit-discount-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-discount-maxuses" className="block text-sm font-medium text-gray-700 mb-1">
                Max Uses <span className="text-gray-400">(0 = unlimited)</span>
              </label>
              <input
                id="edit-discount-maxuses"
                type="number"
                min="0"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Active
              </label>
            </div>
          </div>

          {bookingOptions.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Applies to <span className="text-gray-400">(leave empty for all options)</span>
              </label>
              <div className="border border-gray-200 rounded-md p-3 bg-gray-50">
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {bookingOptions.map((opt) => (
                    <label key={opt.id} className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applicableOptions.includes(opt.id)}
                        onChange={() => toggleOption(opt.id)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      {opt.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || !code.trim() || !discountValue}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}
