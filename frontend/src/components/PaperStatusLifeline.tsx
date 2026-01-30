interface PaperStatusLifelineProps {
  status: string;
  compact?: boolean;
}

const LINEAR_STAGES = [
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "in_evaluation", label: "Evaluation" },
  { key: "evaluated", label: "Reviewed" },
  { key: "final_consideration", label: "Final Consideration" },
] as const;

const STATUS_INDEX: Record<string, number> = {
  draft: 0,
  submitted: 1,
  in_evaluation: 2,
  evaluated: 3,
  final_consideration: 4,
  accepted: 5,
  rejected: 5,
};

function UnicornIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19.56 7.53l-1-1.3a.5.5 0 00-.86.18l-.46 1.39-1.3.58a.5.5 0 00-.06.88l1.17.78.14 1.46a.5.5 0 00.81.33l1.13-.93 1.4.28a.5.5 0 00.52-.72l-.63-1.32.28-1.4a.5.5 0 00-.51-.58l-.63.07zM12 4c-.55 0-1.08.05-1.6.13L12 2l1.6 2.13C13.08 4.05 12.55 4 12 4zM4 13c0 3.88 2.79 7.11 6.47 7.8L9 22h6l-1.47-1.2C17.21 20.11 20 16.88 20 13c0-1.1-.22-2.15-.63-3.1-.92.64-2.06.93-3.17.68-.37-.08-.72-.22-1.04-.4A8.03 8.03 0 0012 6a8 8 0 00-8 7z" />
      <circle cx="9" cy="13" r="1.25" fill="white" />
    </svg>
  );
}

function getDotColor(
  stageIdx: number,
  currentIdx: number,
  stageKey: string,
): string {
  if (stageIdx < currentIdx) return "bg-green-500 border-green-500";
  if (stageIdx === currentIdx) {
    switch (stageKey) {
      case "draft":
        return "bg-gray-500 border-gray-500";
      case "submitted":
        return "bg-blue-500 border-blue-500";
      case "in_evaluation":
        return "bg-yellow-500 border-yellow-500";
      case "evaluated":
        return "bg-purple-500 border-purple-500";
      case "final_consideration":
        return "bg-indigo-500 border-indigo-500";
      default:
        return "bg-gray-400 border-gray-400";
    }
  }
  return "bg-gray-200 border-gray-200";
}

function getRingColor(stageKey: string): string {
  switch (stageKey) {
    case "draft":
      return "#6b7280";
    case "submitted":
      return "#3b82f6";
    case "in_evaluation":
      return "#eab308";
    case "evaluated":
      return "#a855f7";
    case "final_consideration":
      return "#6366f1";
    default:
      return "#9ca3af";
  }
}

export default function PaperStatusLifeline({
  status,
  compact = false,
}: PaperStatusLifelineProps) {
  const currentIndex = STATUS_INDEX[status] ?? -1;
  const isAccepted = status === "accepted";
  const isRejected = status === "rejected";
  const isFinal = isAccepted || isRejected;

  const dotPx = compact ? 8 : 12;
  const fontSize = compact ? "text-[9px] leading-tight" : "text-xs";
  const dotClass = compact ? "w-2 h-2" : "w-3 h-3";

  return (
    <div className="flex items-start w-full">
      {/* Linear stages — equal-width columns */}
      <div className="flex flex-1 min-w-0">
        {LINEAR_STAGES.map((stage, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const dotColor = getDotColor(idx, currentIndex, stage.key);
          const lineColor = idx < currentIndex ? "bg-green-500" : "bg-gray-200";
          const labelColor =
            isCompleted || isCurrent ? "text-gray-700" : "text-gray-400";

          return (
            <div
              key={stage.key}
              className="flex-1 flex flex-col items-center min-w-0"
            >
              {/* Dot row with lines */}
              <div className="flex items-center w-full">
                {/* Left half-line */}
                {idx > 0 ? (
                  <div
                    className={`flex-1 h-0.5 ${
                      idx <= currentIndex ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                ) : (
                  <div className="flex-1" />
                )}
                {/* Dot */}
                <div
                  className={`${dotClass} rounded-full border-2 ${dotColor} flex-shrink-0 ${
                    isCurrent
                      ? "ring-2 ring-offset-1"
                      : ""
                  }`}
                  style={
                    isCurrent
                      ? ({
                          "--tw-ring-color": getRingColor(stage.key),
                        } as React.CSSProperties)
                      : undefined
                  }
                />
                {/* Right half-line */}
                {idx < LINEAR_STAGES.length - 1 ? (
                  <div className={`flex-1 h-0.5 ${lineColor}`} />
                ) : (
                  <div className="flex-1" />
                )}
              </div>
              {/* Label — compact mode only shows the current stage label */}
              {(!compact || isCurrent) && (
                <span
                  className={`${fontSize} font-medium ${labelColor} mt-1 text-center truncate w-full ${
                    isCurrent ? "font-semibold" : ""
                  }`}
                >
                  {stage.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Fork: Accepted / Rejected */}
      <div
        className="flex flex-col flex-shrink-0"
        style={{ marginTop: `${dotPx / 2 - 1}px` }}
      >
        {/* Accepted row */}
        <div className="flex items-center">
          <div
            className={`${compact ? "w-2" : "w-4"} h-0.5 ${
              isFinal
                ? isAccepted
                  ? "bg-green-500"
                  : "bg-gray-200"
                : "bg-gray-200"
            }`}
          />
          <div
            className={`${dotClass} rounded-full border-2 flex-shrink-0 ${
              isAccepted
                ? "bg-green-500 border-green-500 ring-2 ring-offset-1 ring-green-500"
                : "bg-gray-200 border-gray-200"
            }`}
          />
          {(!compact || isAccepted) && (
            <span
              className={`${fontSize} font-medium whitespace-nowrap flex items-center gap-0.5 ml-1 ${
                isAccepted ? "text-green-600 font-semibold" : "text-gray-400"
              }`}
            >
              Accepted
              {isAccepted && (
                <UnicornIcon
                  className={`${compact ? "w-3.5 h-3.5" : "w-5 h-5"} text-green-500`}
                />
              )}
            </span>
          )}
        </div>
        {/* Rejected row */}
        <div className={`flex items-center ${compact ? "mt-0.5" : "mt-1"}`}>
          <div
            className={`${compact ? "w-2" : "w-4"} h-0.5 ${
              isFinal
                ? isRejected
                  ? "bg-red-500"
                  : "bg-gray-200"
                : "bg-gray-200"
            }`}
          />
          <div
            className={`${dotClass} rounded-full border-2 flex-shrink-0 ${
              isRejected
                ? "bg-red-500 border-red-500 ring-2 ring-offset-1 ring-red-500"
                : "bg-gray-200 border-gray-200"
            }`}
          />
          {(!compact || isRejected) && (
            <span
              className={`${fontSize} font-medium whitespace-nowrap ml-1 ${
                isRejected ? "text-red-600 font-semibold" : "text-gray-400"
              }`}
            >
              Rejected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
