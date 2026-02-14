import { useState } from "react";
import type { ProgramDay } from "../../../../types";
import Modal from "../../../../components/Modal";
import ConfirmDialog from "../../../../components/ConfirmDialog";

interface DayTabsProps {
  days: ProgramDay[];
  selectedDayId: string | null;
  onSelectDay: (dayId: string) => void;
  onCreateDay: (data: { date: string; name?: string }) => void;
  onUpdateDay: (dayId: string, data: { date?: string; name?: string }) => void;
  onDeleteDay: (dayId: string) => void;
  isAdmin: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function DayTabs({
  days,
  selectedDayId,
  onSelectDay,
  onCreateDay,
  onUpdateDay,
  onDeleteDay,
  isAdmin,
}: DayTabsProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deletingDay, setDeletingDay] = useState<ProgramDay | null>(null);
  const [editingDay, setEditingDay] = useState<ProgramDay | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate) return;
    onCreateDay({ date: newDate, name: newName || undefined });
    setShowAddModal(false);
    setNewDate("");
    setNewName("");
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDay || !newDate) return;
    onUpdateDay(editingDay.id, { date: newDate, name: newName || undefined });
    setShowEditModal(false);
    setEditingDay(null);
    setNewDate("");
    setNewName("");
  };

  const openEditModal = (day: ProgramDay) => {
    setEditingDay(day);
    setNewDate(day.date);
    setNewName(day.name || "");
    setShowEditModal(true);
  };

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      {/* Day tabs */}
      {days.map((day) => (
        <div key={day.id} className="relative group">
          <button
            onClick={() => onSelectDay(day.id)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              selectedDayId === day.id
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {day.name || formatDate(day.date)}
          </button>
          {isAdmin && (
            <div className="absolute top-0 right-0 -mt-1 -mr-1 hidden group-hover:flex gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openEditModal(day);
                }}
                className="p-1 bg-white rounded-full shadow-md hover:bg-gray-100"
                title="Edit day"
              >
                <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingDay(day);
                }}
                className="p-1 bg-white rounded-full shadow-md hover:bg-red-100"
                title="Delete day"
              >
                <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Add Day button */}
      {isAdmin && (
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 border border-dashed border-gray-300 rounded-lg hover:bg-gray-100 hover:border-gray-400"
        >
          + Add Day
        </button>
      )}

      {/* Add Day Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Day" size="max-w-sm">
        <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name (optional)</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., Tutorial Day, Main Conference"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
            >
              Add Day
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Day Modal */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Day" size="max-w-sm">
        <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name (optional)</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., Tutorial Day, Main Conference"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Day Confirmation */}
      <ConfirmDialog
        open={!!deletingDay}
        title="Delete Day"
        message={deletingDay ? `Delete "${deletingDay.name || formatDate(deletingDay.date)}"?` : ""}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deletingDay) {
            onDeleteDay(deletingDay.id);
          }
          setDeletingDay(null);
        }}
        onCancel={() => setDeletingDay(null)}
      />
    </div>
  );
}
