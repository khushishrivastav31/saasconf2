interface EditTemplateButtonProps {
  hoverColorClass: string;
  title: string;
  onClick: () => void;
}

/** Small pencil icon that deep-links to a specific email template's editor. */
export default function EditTemplateButton({
  hoverColorClass,
  title,
  onClick,
}: EditTemplateButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`p-1.5 rounded-md text-gray-400 ${hoverColorClass} transition-colors`}
      title={title}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
    </button>
  );
}
