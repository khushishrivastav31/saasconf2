import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { BookingPeriod, BookingOption, PlatformCurrency, ProgramDay } from '../../../../types';
import { EditIcon, DeleteIcon } from '../../icons';
import { formatDate } from '../../../../utils/formatDate';

export interface PricingMatrixSectionProps {
  isAdmin: boolean;
  periods: BookingPeriod[];
  options: BookingOption[];
  days: ProgramDay[];
  currencyOptions: PlatformCurrency[] | undefined;
  conferenceCurrency?: string | null;
  // Modal triggers
  onAddPeriod: () => void;
  onAddOption: () => void;
  // Edit period
  editingPeriodId: string | null;
  setEditingPeriodId: (v: string | null) => void;
  editingPeriodName: string;
  setEditingPeriodName: (v: string) => void;
  editingPeriodStartDate: string;
  setEditingPeriodStartDate: (v: string) => void;
  editingPeriodEndDate: string;
  setEditingPeriodEndDate: (v: string) => void;
  editingPeriodCurrency: string;
  setEditingPeriodCurrency: (v: string) => void;
  onSavePeriodEdits: (period: BookingPeriod) => void;
  onStartEditPeriod: (period: BookingPeriod) => void;
  // Edit option
  editingOptionId: string | null;
  setEditingOptionId: (v: string | null) => void;
  editingOptionName: string;
  setEditingOptionName: (v: string) => void;
  onUpdateOption: (id: string, data: Record<string, unknown>) => void;
  // Price and delete
  onPriceChange: (period: BookingPeriod, optionId: string, value: string) => void;
  onDeleteTarget: (target: {
    type: 'period' | 'option' | 'discount';
    id: string;
    name: string;
  }) => void;
}

export default function PricingMatrixSection({
  isAdmin,
  periods,
  options,
  days,
  currencyOptions,
  conferenceCurrency,
  onAddPeriod,
  onAddOption,
  editingPeriodId,
  setEditingPeriodId,
  editingPeriodName,
  setEditingPeriodName,
  editingPeriodStartDate,
  setEditingPeriodStartDate,
  editingPeriodEndDate,
  setEditingPeriodEndDate,
  editingPeriodCurrency,
  setEditingPeriodCurrency,
  onSavePeriodEdits,
  onStartEditPeriod,
  editingOptionId,
  setEditingOptionId,
  editingOptionName,
  setEditingOptionName,
  onUpdateOption,
  onPriceChange,
  onDeleteTarget,
}: PricingMatrixSectionProps) {
  // Local state for day picker popover
  const [dayPickerOptionId, setDayPickerOptionId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
    openUp: boolean;
  } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const openDayPicker = useCallback((optId: string) => {
    const trigger = triggerRefs.current[optId];
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 220;
    setPopoverPos({
      top: openUp ? rect.top : rect.bottom + 4,
      left: rect.left,
      openUp,
    });
    setDayPickerOptionId(optId);
  }, []);

  // Close day picker on outside click or scroll
  useEffect(() => {
    if (!dayPickerOptionId) return;
    const handleClose = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setDayPickerOptionId(null);
      }
    };
    const handleScroll = () => setDayPickerOptionId(null);
    document.addEventListener('mousedown', handleClose);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClose);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [dayPickerOptionId]);

  // Use conference currency if set
  const isCurrencyLocked = !!conferenceCurrency;
  return (
    <>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Booking Options
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {days.length > 0
              ? 'Options are created from your conference days. Set pricing per period.'
              : 'Define attendee options and pricing periods for this conference.'}
          </p>
        </div>
        {isAdmin && (
          <div className="mt-3 sm:mt-0 flex gap-2">
            <button
              onClick={onAddPeriod}
              className="inline-flex items-center rounded-md bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              + Period
            </button>
            <button
              onClick={onAddOption}
              className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
            >
              + Option
            </button>
          </div>
        )}
      </div>

      {/* Pricing Matrix Table */}
      {periods.length === 0 && options.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No booking options defined yet.
          </p>
          <p className="text-sm text-gray-400">
            Add periods (columns) and options (rows) to build your pricing matrix.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900">
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[220px] border-b border-gray-200 dark:border-gray-700">
                  Option
                </th>
                {periods.map((period) => (
                  <th
                    key={period.id}
                    className="px-4 py-4 text-center min-w-[200px] border-b border-gray-200 dark:border-gray-700"
                  >
                    {editingPeriodId === period.id ? (
                      <div className="flex flex-col gap-2 min-w-[180px]">
                        <input
                          type="text"
                          autoFocus
                          value={editingPeriodName}
                          onChange={(e) => setEditingPeriodName(e.target.value)}
                          className="w-full text-sm text-center font-medium rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
                          placeholder="Period name"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="date"
                            value={editingPeriodStartDate}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditingPeriodStartDate(v);
                              if (editingPeriodEndDate && v && editingPeriodEndDate < v) {
                                setEditingPeriodEndDate(v);
                              }
                            }}
                            className="w-full text-xs rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
                          />
                          <input
                            type="date"
                            value={editingPeriodEndDate}
                            min={editingPeriodStartDate}
                            onChange={(e) => setEditingPeriodEndDate(e.target.value)}
                            className="w-full text-xs rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
                          />
                        </div>
                        {isCurrencyLocked ? (
                          <input
                            type="text"
                            value={conferenceCurrency || ''}
                            disabled
                            className="w-full text-xs rounded-md border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-900 shadow-sm text-gray-600 dark:text-gray-300"
                            title="Currency set by conference"
                          />
                        ) : (
                          <select
                            value={editingPeriodCurrency}
                            onChange={(e) => setEditingPeriodCurrency(e.target.value)}
                            className="w-full text-xs rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
                          >
                            <option value="">No currency</option>
                            {(currencyOptions || []).map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.code} — {c.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <div className="flex justify-center gap-1.5">
                          <button
                            onClick={() => onSavePeriodEdits(period)}
                            className="text-xs px-3 py-1 rounded-md bg-primary-600 text-white hover:bg-primary-700 font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingPeriodId(null)}
                            className="text-xs px-3 py-1 rounded-md bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`flex flex-col items-center gap-0.5 ${isAdmin ? 'cursor-pointer group' : ''}`}
                        onClick={isAdmin ? () => onStartEditPeriod(period) : undefined}
                        title={isAdmin ? 'Click to edit period' : undefined}
                      >
                        <span
                          className={`text-sm font-semibold text-gray-800 dark:text-gray-200 ${isAdmin ? 'group-hover:text-primary-600' : ''} transition-colors`}
                        >
                          {period.name}
                        </span>
                        <span
                          className={`text-xs text-gray-400 dark:text-gray-500 ${isAdmin ? 'group-hover:text-gray-500 dark:group-hover:text-gray-400' : ''}`}
                        >
                          {formatDate(period.start_date)} — {formatDate(period.end_date)}
                        </span>
                        {period.currency && (
                          <span
                            className={`mt-0.5 inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300 ${isAdmin ? 'group-hover:bg-primary-50 group-hover:text-primary-700' : ''}`}
                          >
                            {period.currency}
                          </span>
                        )}
                        {isAdmin && (
                          <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity items-center">
                            <span className="text-primary-500" title="Edit period">
                              <EditIcon />
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteTarget({
                                  type: 'period',
                                  id: period.id,
                                  name: period.name,
                                });
                              }}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                              title="Delete period"
                            >
                              <DeleteIcon />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </th>
                ))}
                {isAdmin && (
                  <th className="px-4 py-4 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[60px] border-b border-gray-200 dark:border-gray-700"></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {options.map((opt) => (
                <tr
                  key={opt.id}
                  className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <td className="px-5 py-3">
                    {/* Option name — inline editable */}
                    <div className={`${isAdmin ? 'group' : ''}`}>
                      {editingOptionId === opt.id ? (
                        <input
                          type="text"
                          autoFocus
                          value={editingOptionName}
                          onChange={(e) => setEditingOptionName(e.target.value)}
                          onBlur={() => {
                            const trimmed = editingOptionName.trim();
                            if (trimmed && trimmed !== opt.name) {
                              onUpdateOption(opt.id, { name: trimmed });
                            } else {
                              setEditingOptionId(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            } else if (e.key === 'Escape') {
                              setEditingOptionId(null);
                            }
                          }}
                          className="w-full text-sm font-medium rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
                        />
                      ) : (
                        <div className="flex items-center">
                          <span
                            className={`text-sm font-medium text-gray-900 dark:text-gray-100 ${isAdmin ? 'cursor-pointer group-hover:text-primary-600' : ''} transition-colors`}
                            onClick={
                              isAdmin
                                ? () => {
                                    setEditingOptionId(opt.id);
                                    setEditingOptionName(opt.name);
                                  }
                                : undefined
                            }
                            title={isAdmin ? 'Click to edit name' : undefined}
                          >
                            {opt.name}
                          </span>
                          {isAdmin && (
                            <svg
                              className="ml-1.5 w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          )}
                        </div>
                      )}

                      {/* Day badge — always visible, clickable to change */}
                      {days.length > 0 &&
                        (() => {
                          const linkedDay = opt.conference_day_id
                            ? days.find((d) => d.id === opt.conference_day_id)
                            : null;

                          return (
                            <div className="mt-1.5">
                              {linkedDay ? (
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    ref={(el) => {
                                      triggerRefs.current[opt.id] = el;
                                    }}
                                    type="button"
                                    onClick={
                                      isAdmin
                                        ? () => {
                                            if (dayPickerOptionId === opt.id) {
                                              setDayPickerOptionId(null);
                                            } else {
                                              openDayPicker(opt.id);
                                            }
                                          }
                                        : undefined
                                    }
                                    className={`inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 ${isAdmin ? 'hover:bg-primary-100 cursor-pointer' : ''} transition-colors`}
                                    title={isAdmin ? 'Change linked day' : undefined}
                                  >
                                    <svg
                                      className="w-3 h-3"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                      />
                                    </svg>
                                    {linkedDay.name
                                      ? `${linkedDay.name} — ${formatDate(linkedDay.date)}`
                                      : formatDate(linkedDay.date)}
                                  </button>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdateOption(opt.id, { conference_day_id: null });
                                        setDayPickerOptionId(null);
                                      }}
                                      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                      title="Unlink day"
                                    >
                                      <svg
                                        className="w-3 h-3"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M6 18L18 6M6 6l12 12"
                                        />
                                      </svg>
                                    </button>
                                  )}
                                </span>
                              ) : isAdmin ? (
                                <button
                                  ref={(el) => {
                                    triggerRefs.current[opt.id] = el;
                                  }}
                                  type="button"
                                  onClick={() => {
                                    if (dayPickerOptionId === opt.id) {
                                      setDayPickerOptionId(null);
                                    } else {
                                      openDayPicker(opt.id);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 dark:border-gray-600 px-2.5 py-0.5 text-xs text-gray-400 dark:text-gray-500 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/50 transition-colors cursor-pointer"
                                >
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                  </svg>
                                  Link to day
                                </button>
                              ) : null}
                            </div>
                          );
                        })()}

                      {/* Attendance Type badge */}
                      <div className="mt-1.5">
                        {opt.attendance_type ? (
                          <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                            {opt.attendance_type.replace('_', ' ')}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                            No attendance type set
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  {periods.map((period) => {
                    const rawPrice = period.prices?.[opt.id];
                    const priceValue = rawPrice != null ? Number(rawPrice) : null;
                    const displayValue =
                      priceValue != null && !isNaN(priceValue) ? priceValue.toFixed(2) : '';
                    return (
                      <td key={period.id} className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {period.currency && (
                            <span className="text-xs text-gray-400 font-medium flex-shrink-0">
                              {period.currency}
                            </span>
                          )}
                          <input
                            key={`${period.id}-${opt.id}-${displayValue || 'empty'}`}
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={displayValue}
                            readOnly={!isAdmin}
                            onBlur={
                              isAdmin
                                ? (e) => {
                                    const newVal = e.target.value;
                                    if (newVal !== displayValue) {
                                      onPriceChange(period, opt.id, newVal);
                                    }
                                  }
                                : undefined
                            }
                            className={`w-full max-w-[110px] text-right text-sm rounded-md border-gray-300 dark:border-gray-600 shadow-sm tabular-nums ${isAdmin ? 'focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100' : 'bg-gray-50 dark:bg-gray-900 dark:text-gray-400 cursor-default'}`}
                            placeholder="—"
                          />
                        </div>
                      </td>
                    );
                  })}
                  {isAdmin && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() =>
                          onDeleteTarget({ type: 'option', id: opt.id, name: opt.name })
                        }
                        className="text-gray-300 hover:text-red-500 transition-colors"
                        title="Delete option"
                      >
                        <DeleteIcon />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Day picker popover — rendered via portal to escape overflow clipping */}
      {dayPickerOptionId &&
        isAdmin &&
        popoverPos &&
        (() => {
          const opt = options.find((o) => o.id === dayPickerOptionId);
          if (!opt) return null;
          const usedDayIds = new Set(
            options
              .filter((o) => o.id !== opt.id && o.conference_day_id)
              .map((o) => o.conference_day_id!)
          );
          const availableDays = days.filter(
            (d) => !usedDayIds.has(d.id) || d.id === opt.conference_day_id
          );

          return createPortal(
            <div
              ref={popoverRef}
              className="fixed z-50 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg ring-1 ring-gray-200 dark:ring-gray-700 py-1"
              style={{
                left: popoverPos.left,
                ...(popoverPos.openUp
                  ? { bottom: window.innerHeight - popoverPos.top + 4 }
                  : { top: popoverPos.top }),
              }}
            >
              {availableDays.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-400">All days are assigned</div>
              ) : (
                availableDays.map((day) => (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => {
                      onUpdateOption(opt.id, { conference_day_id: day.id });
                      setDayPickerOptionId(null);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors flex items-center gap-2 ${day.id === opt.conference_day_id ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    <svg
                      className="w-3.5 h-3.5 flex-shrink-0 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span>
                      {day.name ? (
                        <>
                          <span className="font-medium">{day.name}</span> — {formatDate(day.date)}
                        </>
                      ) : (
                        formatDate(day.date)
                      )}
                    </span>
                    {day.id === opt.conference_day_id && (
                      <svg
                        className="w-4 h-4 ml-auto text-primary-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </button>
                ))
              )}
              {opt.conference_day_id && (
                <>
                  <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateOption(opt.id, { conference_day_id: null });
                      setDayPickerOptionId(null);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                  >
                    Unlink day
                  </button>
                </>
              )}
            </div>,
            document.body
          );
        })()}
    </>
  );
}
