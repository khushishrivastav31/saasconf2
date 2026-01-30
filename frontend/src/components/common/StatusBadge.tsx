export default function StatusBadge({
  isActive,
  onClick,
}: {
  isActive: boolean;
  onClick?: (newState: boolean) => void;
}) {
  const colors = isActive
    ? "bg-green-100 text-green-800"
    : "bg-red-100 text-red-800";
  const label = isActive ? "Active" : "Inactive";

  if (onClick) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick(!isActive);
        }}
        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full cursor-pointer transition-colors ${colors} ${
          isActive ? "hover:bg-green-200" : "hover:bg-red-200"
        }`}
        title={`Click to ${isActive ? "deactivate" : "activate"}`}
      >
        {label}
      </button>
    );
  }

  return (
    <span
      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colors}`}
    >
      {label}
    </span>
  );
}
