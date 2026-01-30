import { useState, useEffect } from "react";
import type {
  ReviewCriterion,
  ReviewCriterionCreate,
} from "../../../../../types";
import Modal from "../../../../../components/Modal";
import RichTextEditor from "../../../../../components/common/RichTextEditor";
import { ErrorBanner } from "../../../../../components/common/ErrorBanner";
import ModalFooter from "../../../../../components/common/ModalFooter";

export default function CriterionModal({
  open,
  criterion,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  open: boolean;
  criterion: ReviewCriterion | null;
  onClose: () => void;
  onSubmit: (data: ReviewCriterionCreate) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<ReviewCriterionCreate>({
    title: criterion?.title || "",
    description: criterion?.description || "",
    display_order: criterion?.display_order ?? 0,
    is_active: criterion?.is_active ?? true,
  });

  useEffect(() => {
    if (open) {
      setFormData({
        title: criterion?.title || "",
        description: criterion?.description || "",
        display_order: criterion?.display_order ?? 0,
        is_active: criterion?.is_active ?? true,
      });
    }
  }, [open, criterion]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={criterion ? "Edit Criterion" : "Add Criterion"}
      size="max-w-lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <ErrorBanner message={error} />

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Title *
            </label>
            <input
              type="text"
              required
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <RichTextEditor
              value={formData.description || ""}
              onChange={(html) =>
                setFormData({ ...formData, description: html })
              }
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Display Order
            </label>
            <input
              type="number"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.display_order ?? 0}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  display_order: Number(e.target.value),
                })
              }
            />
          </div>

          <div className="flex items-center">
            <input
              id="criterion-active"
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={formData.is_active ?? true}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
            />
            <label
              htmlFor="criterion-active"
              className="ml-2 block text-sm text-gray-900"
            >
              Active
            </label>
          </div>
        </div>

        <ModalFooter onCancel={onClose} isLoading={isLoading} />
      </form>
    </Modal>
  );
}
