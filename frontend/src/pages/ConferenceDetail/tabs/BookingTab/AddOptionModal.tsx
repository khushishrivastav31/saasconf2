import { useState } from "react";
import Modal from "../../../../components/Modal";
import type { BookingOptionCreate } from "../../../../types";

interface AddOptionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: BookingOptionCreate) => void;
  existingCount: number;
}

export default function AddOptionModal({
  open,
  onClose,
  onSubmit,
  existingCount,
}: AddOptionModalProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSubmit({
      name: name.trim(),
      sort_order: existingCount,
    });

    setName("");
  };

  const handleClose = () => {
    setName("");
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Booking Option" size="max-w-sm">
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-5">
          <label htmlFor="option-name" className="block text-sm font-medium text-gray-700 mb-2">
            Option Name
          </label>
          <input
            id="option-name"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Full Conference Pass"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
          />
          <p className="mt-2 text-xs text-gray-500">
            This will appear as a row in your pricing matrix.
          </p>
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
