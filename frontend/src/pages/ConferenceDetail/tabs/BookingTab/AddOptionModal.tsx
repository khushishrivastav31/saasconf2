import { useState } from 'react';
import Modal from '../../../../components/Modal';
import type { BookingOption, BookingOptionCreate, ProgramDay } from '../../../../types';
import { formatDate } from '../../../../utils/formatDate';

interface AddOptionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: BookingOptionCreate) => void;
  existingCount: number;
  days: ProgramDay[];
  options: BookingOption[];
}

export default function AddOptionModal({
  open,
  onClose,
  onSubmit,
  existingCount,
  days,
  options,
}: AddOptionModalProps) {
  const [name, setName] = useState('');
  const [conferenceDayId, setConferenceDayId] = useState('');
  const [attendanceType, setAttendanceType] = useState('');

  const usedDayIds = new Set(
    options.filter((o) => o.conference_day_id).map((o) => o.conference_day_id!)
  );
  const availableDays = days.filter((d) => !usedDayIds.has(d.id));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSubmit({
      name: name.trim(),
      conference_day_id: conferenceDayId || null,
      attendance_type: attendanceType || null,
      sort_order: existingCount,
    });

    setName('');
    setConferenceDayId('');
    setAttendanceType('');
  };

  const handleClose = () => {
    setName('');
    setConferenceDayId('');
    setAttendanceType('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Booking Option" size="max-w-sm">
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label
              htmlFor="option-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Option Name
            </label>
            <input
              id="option-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Full Conference Pass"
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              This will appear as a row in your pricing matrix.
            </p>
          </div>

          {days.length > 0 && (
            <div>
              <label
                htmlFor="option-day"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Conference Day
              </label>
              <select
                id="option-day"
                value={conferenceDayId}
                onChange={(e) => setConferenceDayId(e.target.value)}
                className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">No day linked</option>
                {availableDays.map((day) => (
                  <option key={day.id} value={day.id}>
                    {day.name ? `${day.name} — ${formatDate(day.date)}` : formatDate(day.date)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Link this option to a specific conference day.
              </p>
            </div>
          )}

          <div>
            <label
              htmlFor="attendance-type"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Attendance Type
            </label>
            <select
              id="attendance-type"
              value={attendanceType}
              onChange={(e) => setAttendanceType(e.target.value)}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">Select type...</option>
              <option value="in_person">In Person</option>
              <option value="virtual">Virtual</option>
              <option value="hybrid_onsite">Hybrid (Onsite)</option>
              <option value="hybrid_online">Hybrid (Online)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Used for automatic VAT calculation in invoices.
            </p>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Option
          </button>
        </div>
      </form>
    </Modal>
  );
}
