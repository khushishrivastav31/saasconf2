import { useState, useRef, useEffect } from "react";
import type { ColumnDef, ColumnGroup } from "./columnDefs";

const GROUP_LABELS: Record<ColumnGroup, string> = {
  session: "Session",
  speaker: "Speaker",
  paper: "Paper",
  custom: "Custom Fields",
};

const GROUP_ORDER: ColumnGroup[] = ["session", "speaker", "paper", "custom"];

interface ColumnPickerProps {
  columns: ColumnDef[];
  visibleKeys: string[];
  onToggle: (key: string) => void;
  onReset: () => void;
}

export default function ColumnPicker({
  columns,
  visibleKeys,
  onToggle,
  onReset,
}: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Group columns
  const grouped = new Map<ColumnGroup, ColumnDef[]>();
  for (const col of columns) {
    const group = grouped.get(col.group) || [];
    group.push(col);
    grouped.set(col.group, group);
  }

  const visibleCount = visibleKeys.length;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"
          />
        </svg>
        Columns
        <span className="text-xs text-gray-400">({visibleCount})</span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {GROUP_ORDER.filter((g) => grouped.has(g)).map((group) => (
            <div key={group} className="py-1">
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                {GROUP_LABELS[group]}
              </div>
              {grouped.get(group)!.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={visibleKeys.includes(col.key)}
                    onChange={() => onToggle(col.key)}
                    className="h-3.5 w-3.5 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          ))}
          <div className="border-t border-gray-200 px-3 py-2">
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-primary-600 hover:text-primary-800"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
