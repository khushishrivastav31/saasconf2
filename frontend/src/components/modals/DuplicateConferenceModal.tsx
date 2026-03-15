import { useState, useEffect } from 'react';
import Modal from '../Modal';

interface DuplicateConferenceModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; abbreviation: string; start_date?: string }) => void;
  isLoading: boolean;
  error: string | null;
  sourceName: string;
  sourceAbbreviation: string;
}

export default function DuplicateConferenceModal({
  open,
  onClose,
  onSubmit,
  isLoading,
  error,
  sourceName,
  sourceAbbreviation,
}: DuplicateConferenceModalProps) {
  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [startDate, setStartDate] = useState('');

  useEffect(() => {
    if (open) {
      setName(`${sourceName} (Copy)`);
      setAbbreviation(sourceAbbreviation);
      setStartDate('');
    }
  }, [open, sourceName, sourceAbbreviation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: { name: string; abbreviation: string; start_date?: string } = {
      name,
      abbreviation,
    };
    if (startDate) data.start_date = startDate;
    onSubmit(data);
  };

  return (
    <Modal open={open} onClose={onClose} title="Duplicate Conference">
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Create a copy of <strong>{sourceName}</strong> with all configuration, settings, and
            templates. Instance data (registrations, invoices, papers, sponsors) will not be copied.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Conference Name *
            </label>
            <input
              type="text"
              required
              maxLength={200}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Abbreviation *
            </label>
            <input
              type="text"
              required
              maxLength={20}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
              placeholder="e.g., ICML_2026"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value.replace(/\s/g, ''))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Start Date
            </label>
            <input
              type="date"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              If set, booking period dates will be recalculated relative to this date.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 rounded-b-lg">
          {error && (
            <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {isLoading ? 'Duplicating...' : 'Duplicate Conference'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
