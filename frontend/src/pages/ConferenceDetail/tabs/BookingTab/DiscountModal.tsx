import { useState, useEffect } from "react";
import Modal from "../../../../components/Modal";
import type {
  BookingOption,
  DiscountCode,
  DiscountCodeCreate,
  PlatformCurrency,
} from "../../../../types";

interface DiscountModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (data: DiscountCodeCreate) => void;
  onEdit: (id: string, data: Record<string, unknown>) => void;
  discount?: DiscountCode | null;
  bookingOptions: BookingOption[];
  currencyOptions: PlatformCurrency[] | undefined;
  conferenceCurrency?: string | null;
}

export default function DiscountModal({
  open,
  onClose,
  onAdd,
  onEdit,
  discount,
  bookingOptions,
  currencyOptions,
  conferenceCurrency,
}: DiscountModalProps) {
  const isEditMode = !!discount;
  const isCurrencyLocked = !!conferenceCurrency;

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [currency, setCurrency] = useState(conferenceCurrency || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxUses, setMaxUses] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [applicableOptions, setApplicableOptions] = useState<string[]>([]);

  // Reset / populate form when modal opens or discount changes
  useEffect(() => {
    if (!open) return;

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
    } else {
      setName("");
      setCode("");
      setDiscountType("percentage");
      setDiscountValue("");
      setCurrency(conferenceCurrency || "");
      setStartDate("");
      setEndDate("");
      setMaxUses("0");
      setIsActive(true);
      setApplicableOptions([]);
    }
  }, [open, discount, conferenceCurrency]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim() || !discountValue) return;

    const effectiveCurrency = isCurrencyLocked ? conferenceCurrency : currency;

    if (isEditMode) {
      // Build a diff of only changed fields
      const updates: Record<string, unknown> = {};

      if (name.trim() !== discount.name) updates.name = name.trim();
      if (code.trim().toUpperCase() !== discount.code) updates.code = code.trim().toUpperCase();
      if (discountType !== discount.discount_type) updates.discount_type = discountType;
      if (parseFloat(discountValue) !== discount.discount_value) updates.discount_value = parseFloat(discountValue);

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
        onEdit(discount.id, updates);
      } else {
        onClose();
      }
    } else {
      onAdd({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        discount_type: discountType,
        discount_value: parseFloat(discountValue),
        currency: discountType === "fixed" && effectiveCurrency ? effectiveCurrency : null,
        start_date: startDate || null,
        end_date: endDate || null,
        max_uses: parseInt(maxUses) || 0,
        applicable_option_ids: applicableOptions.length > 0 ? applicableOptions : undefined,
      });
    }
  };

  const handleClose = () => {
    onClose();
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

  const idPrefix = isEditMode ? "edit-discount" : "discount";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEditMode ? "Edit Discount Code" : "Add Discount Code"}
      size="max-w-lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${idPrefix}-name`} className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id={`${idPrefix}-name`}
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Early Sponsor"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-code`} className="block text-sm font-medium text-gray-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <input
                id={`${idPrefix}-code`}
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
              <label htmlFor={`${idPrefix}-type`} className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                id={`${idPrefix}-type`}
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "fixed" | "percentage")}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${idPrefix}-value`} className="block text-sm font-medium text-gray-700 mb-1">
                Value <span className="text-red-500">*</span>
              </label>
              <input
                id={`${idPrefix}-value`}
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
                <label htmlFor={`${idPrefix}-currency`} className="block text-sm font-medium text-gray-700 mb-1">
                  Currency
                </label>
                {isCurrencyLocked ? (
                  <input
                    id={`${idPrefix}-currency`}
                    type="text"
                    value={conferenceCurrency || ""}
                    disabled
                    title="Set by conference"
                    className="block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm text-sm text-gray-600"
                  />
                ) : (
                  <select
                    id={`${idPrefix}-currency`}
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
              <label htmlFor={`${idPrefix}-start`} className="block text-sm font-medium text-gray-700 mb-1">
                Start Date <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id={`${idPrefix}-start`}
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-end`} className="block text-sm font-medium text-gray-700 mb-1">
                End Date <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id={`${idPrefix}-end`}
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>

          <div className={isEditMode ? "grid grid-cols-2 gap-4" : ""}>
            <div>
              <label htmlFor={`${idPrefix}-maxuses`} className="block text-sm font-medium text-gray-700 mb-1">
                Max Uses <span className="text-gray-400">(0 = unlimited)</span>
              </label>
              <input
                id={`${idPrefix}-maxuses`}
                type="number"
                min="0"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            {isEditMode && (
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
            )}
          </div>

          {bookingOptions.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Applies to <span className="text-red-500">*</span>
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
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || !code.trim() || !discountValue || (bookingOptions.length > 0 && applicableOptions.length === 0)}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEditMode ? "Save Changes" : "Add Discount Code"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
