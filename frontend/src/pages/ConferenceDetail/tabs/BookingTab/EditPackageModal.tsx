import { useState, useEffect } from "react";
import Modal from "../../../../components/Modal";
import type { BookingOption, BookingPackage } from "../../../../types";

interface EditPackageModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (id: string, data: Record<string, unknown>) => void;
  package_: BookingPackage | null;
  bookingOptions: BookingOption[];
}

export default function EditPackageModal({
  open,
  onClose,
  onSubmit,
  package_,
  bookingOptions,
}: EditPackageModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (package_) {
      setName(package_.name);
      setDescription(package_.description || "");
      setSelectedOptionIds([...package_.option_ids]);
      setIsActive(package_.is_active);
    }
  }, [package_]);

  const handleToggleOption = (optionId: string) => {
    setSelectedOptionIds((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!package_ || !name.trim() || selectedOptionIds.length === 0) return;

    onSubmit(package_.id, {
      name: name.trim(),
      description: description.trim() || undefined,
      option_ids: selectedOptionIds,
      is_active: isActive,
    });
  };

  const handleClose = () => {
    onClose();
  };

  const isValid = name.trim() && selectedOptionIds.length > 0;

  return (
    <Modal open={open} onClose={handleClose} title="Edit Booking Package" size="max-w-sm">
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor="edit-package-name" className="block text-sm font-medium text-gray-700 mb-1">
              Package Name <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-package-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tutorial Only, Full Conference"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
            />
          </div>

          <div>
            <label htmlFor="edit-package-description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="edit-package-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description for this package"
              rows={2}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Included Options <span className="text-red-500">*</span>
            </label>
            {bookingOptions.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No booking options available.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-3">
                {bookingOptions.map((option) => (
                  <label
                    key={option.id}
                    className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-1.5 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedOptionIds.includes(option.id)}
                      onChange={() => handleToggleOption(option.id)}
                      className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">{option.name}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-xs text-gray-500">
              Select at least one option. Package price = sum of selected options.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="edit-package-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="edit-package-active" className="text-sm text-gray-700">
              Package is active
            </label>
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
            disabled={!isValid}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}
