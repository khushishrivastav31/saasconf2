import { useState, type ReactNode } from "react";
import ConfirmDialog from "./ConfirmDialog";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface DetailPanelTab {
  id: string;
  label: string;
  content: ReactNode;
}

interface DetailPanelWrapperProps {
  title: string;
  subtitle?: ReactNode;
  onDelete?: () => void;
  deleteTitle?: string;
  deleteMessage?: string;
  saveStatus: SaveStatus;
  tabs: DetailPanelTab[];
  headerActions?: ReactNode;
  isAdmin?: boolean;
  /** The form id that the save button should submit */
  formId?: string;
  /** Whether the save button should be shown (default true) */
  showSave?: boolean;
  /** Additional disabled condition for the save button */
  saveDisabled?: boolean;
}

export default function DetailPanelWrapper({
  title,
  subtitle,
  onDelete,
  deleteTitle = "Delete",
  deleteMessage,
  saveStatus,
  tabs,
  headerActions,
  isAdmin = true,
  formId,
  showSave = true,
  saveDisabled = false,
}: DetailPanelWrapperProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const activeTabContent = tabs.find((t) => t.id === activeTab)?.content;

  return (
    <div className="bg-white rounded-lg shadow flex flex-col h-full">
      {/* Header with title and tabs */}
      <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
            {subtitle && (
              <p className="text-sm text-gray-500">{subtitle}</p>
            )}
          </div>
          {headerActions && <div>{headerActions}</div>}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 -mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary-600 text-primary-600 bg-primary-50"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTabContent}
      </div>

      {/* Footer with action buttons */}
      {isAdmin && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center flex-shrink-0">
          {onDelete ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-300 rounded-md transition-colors"
            >
              Delete
            </button>
          ) : (
            <div />
          )}
          {showSave && (
            <button
              type="submit"
              form={formId}
              disabled={saveStatus === "saving" || saveDisabled}
              className={`px-4 py-1.5 text-sm font-medium text-white border border-transparent rounded-md disabled:opacity-50 transition-colors duration-200 ${
                saveStatus === "saved"
                  ? "bg-green-600"
                  : saveStatus === "error"
                    ? "bg-red-600"
                    : "bg-primary-600 hover:bg-primary-700"
              }`}
            >
              {saveStatus === "saving" ? (
                <span className="inline-flex items-center gap-1.5">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </span>
              ) : saveStatus === "saved" ? (
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved
                </span>
              ) : saveStatus === "error" ? (
                "Save failed"
              ) : (
                "Save Changes"
              )}
            </button>
          )}
        </div>
      )}

      {onDelete && (
        <ConfirmDialog
          open={showDeleteConfirm}
          title={deleteTitle}
          message={deleteMessage || `Are you sure you want to delete "${title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            setShowDeleteConfirm(false);
            onDelete();
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
