import { useState } from "react";
import Modal from "../../../../components/Modal";
import type {
  BookingOption,
  DiscountCodeCreate,
  PlatformCurrency,
} from "../../../../types";

interface AddDiscountModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: DiscountCodeCreate) => void;
  bookingOptions: BookingOption[];
  currencyOptions: PlatformCurrency[] | undefined;
  conferenceCurrency?: string | null;
}

export default function AddDiscountModal({
  open,
  onClose,
  onSubmit,
  bookingOptions,
  currencyOptions,
  conferenceCurrency,
}: AddDiscountModalProps) {
  // Use conference currency if set
  const isCurrencyLocked = !!conferenceCurrency;

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [currency, setCurrency] = useState(conferenceCurrency || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxUses, setMaxUses] = useState("0");
  const [applicableOptions, setApplicableOptions] = useState<string[]>([]);

  const resetForm = () => {
    setName("");
    setCode("");
    setDiscountType("percentage");
    setDiscountValue("");
    setCurrency(conferenceCurrency || "");
    setStartDate("");
    setEndDate("");
    setMaxUses("0");
    setApplicableOptions([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim() || !discountValue) return;

    // Use conference currency if locked, otherwise use selected currency
    const effectiveCurrency = isCurrencyLocked ? conferenceCurrency : currency;

    onSubmit({
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

    resetForm();
  };

  const handleClose = () => {
    resetForm();
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

  return (
    <Modal open={open} onClose={handleClose} title="Add Discount Code" size="max-w-lg">
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="discount-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="discount-name"
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Early Sponsor"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label htmlFor="discount-code" className="block text-sm font-medium text-gray-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <input
                id="discount-code"
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
              <label htmlFor="discount-type" className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                id="discount-type"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "fixed" | "percentage")}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>
            <div>
              <label htmlFor="discount-value" className="block text-sm font-medium text-gray-700 mb-1">
                Value <span className="text-red-500">*</span>
              </label>
              <input
                id="discount-value"
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
                <label htmlFor="discount-currency" className="block text-sm font-medium text-gray-700 mb-1">
                  Currency
                </label>
                {isCurrencyLocked ? (
                  <input
                    id="discount-currency"
                    type="text"
                    value={conferenceCurrency || ""}
                    disabled
                    title="Set by conference"
                    className="block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm text-sm text-gray-600"
                  />
                ) : (
                  <select
                    id="discount-currency"
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
              <label htmlFor="discount-start" className="block text-sm font-medium text-gray-700 mb-1">
                Start Date <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="discount-start"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label htmlFor="discount-end" className="block text-sm font-medium text-gray-700 mb-1">
                End Date <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="discount-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="discount-maxuses" className="block text-sm font-medium text-gray-700 mb-1">
              Max Uses <span className="text-gray-400">(0 = unlimited)</span>
            </label>
            <input
              id="discount-maxuses"
              type="number"
              min="0"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
            />
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
            Add Discount Code
          </button>
        </div>
      </form>
    </Modal>
  );
}
