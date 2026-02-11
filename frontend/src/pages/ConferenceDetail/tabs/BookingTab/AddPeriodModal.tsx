import { useState } from "react";
import Modal from "../../../../components/Modal";
import type { BookingPeriodCreate, PlatformCurrency } from "../../../../types";

interface AddPeriodModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: BookingPeriodCreate) => void;
  existingCount: number;
  currencyOptions: PlatformCurrency[] | undefined;
  defaultCurrency?: string;
  conferenceCurrency?: string | null;
}

export default function AddPeriodModal({
  open,
  onClose,
  onSubmit,
  existingCount,
  currencyOptions,
  defaultCurrency = "EUR",
  conferenceCurrency,
}: AddPeriodModalProps) {
  // Use conference currency if set, otherwise allow selection
  const effectiveCurrency = conferenceCurrency || defaultCurrency;
  const isCurrencyLocked = !!conferenceCurrency;

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currency, setCurrency] = useState(effectiveCurrency);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !startDate || !endDate) return;

    onSubmit({
      name: name.trim(),
      start_date: startDate,
      end_date: endDate,
      currency,
      sort_order: existingCount,
    });

    // Reset form
    setName("");
    setStartDate("");
    setEndDate("");
    setCurrency(effectiveCurrency);
  };

  const handleClose = () => {
    setName("");
    setStartDate("");
    setEndDate("");
    setCurrency(effectiveCurrency);
    onClose();
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    // If end date is before new start date, update it
    if (endDate && value && endDate < value) {
      setEndDate(value);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Pricing Period" size="max-w-md">
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label htmlFor="period-name" className="block text-sm font-medium text-gray-700 mb-1">
              Period Name <span className="text-red-500">*</span>
            </label>
            <input
              id="period-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Early Bird"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="period-start" className="block text-sm font-medium text-gray-700 mb-1">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                id="period-start"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label htmlFor="period-end" className="block text-sm font-medium text-gray-700 mb-1">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                id="period-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="period-currency" className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            {isCurrencyLocked ? (
              <input
                id="period-currency"
                type="text"
                value={conferenceCurrency}
                disabled
                title="Set by conference"
                className="block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm text-sm text-gray-600"
              />
            ) : (
              <select
                id="period-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                {(currencyOptions || []).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
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
            disabled={!name.trim() || !startDate || !endDate}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Period
          </button>
        </div>
      </form>
    </Modal>
  );
}
