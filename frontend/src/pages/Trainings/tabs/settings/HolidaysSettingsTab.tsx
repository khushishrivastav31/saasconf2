import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import type {
  HolidayConfig,
  PublicHoliday,
  AvailableCountry,
  CountrySubdivision,
  CustomBlockedDay,
} from '../../../../types/training';
import { parseApiError } from '../../../../utils/apiError';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import ConfirmDialog from '../../../../components/ConfirmDialog';

const BASE = '/trainings/holidays';

// ---------------------------------------------------------------------------
// Holiday Config Card (one per country+year)
// ---------------------------------------------------------------------------

const HolidayConfigCard = React.memo(function HolidayConfigCard({
  config,
  onDelete,
}: {
  config: HolidayConfig;
  onDelete: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  // Fetch holidays for this config
  const { data: holidays = [], isLoading: loadingHolidays } = useQuery({
    queryKey: ['holidays', config.country_code, config.year],
    queryFn: async () => {
      const res = await api.get<PublicHoliday[]>(`${BASE}/${config.country_code}/${config.year}`);
      return res.data;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24h — data is static per year
  });

  // Fetch subdivisions for regional dropdown
  const { data: subdivisions = [] } = useQuery({
    queryKey: ['holiday-subdivisions', config.country_code],
    queryFn: async () => {
      const res = await api.get<CountrySubdivision[]>(
        `${BASE}/${config.country_code}/subdivisions`
      );
      return res.data;
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: config.regional_holidays_enabled,
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      national_holidays_enabled?: boolean;
      regional_holidays_enabled?: boolean;
      regional_code?: string | null;
    }) => {
      await api.put(`${BASE}/config/${config.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holiday-configs'] });
      setError('');
    },
    onError: (err) => setError(parseApiError(err)),
  });

  // Filter holidays based on toggles
  const filteredHolidays = useMemo(() => {
    return holidays.filter((h) => {
      const isNational = h.is_global;
      const isRegional = !h.is_global;
      if (isNational && config.national_holidays_enabled) return true;
      if (isRegional && config.regional_holidays_enabled) {
        if (!config.regional_code) return true;
        return h.counties?.includes(config.regional_code) ?? false;
      }
      return false;
    });
  }, [
    holidays,
    config.national_holidays_enabled,
    config.regional_holidays_enabled,
    config.regional_code,
  ]);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {config.country_code} &mdash; {config.year}
        </h4>
        <button
          onClick={() => onDelete(config.id)}
          className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
          title="Remove configuration"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Toggles */}
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={config.national_holidays_enabled}
            onChange={(e) => updateMutation.mutate({ national_holidays_enabled: e.target.checked })}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          National Holidays
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={config.regional_holidays_enabled}
            onChange={(e) => updateMutation.mutate({ regional_holidays_enabled: e.target.checked })}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          Regional Holidays
        </label>
        {config.regional_holidays_enabled && subdivisions.length > 0 && (
          <select
            value={config.regional_code ?? ''}
            onChange={(e) => updateMutation.mutate({ regional_code: e.target.value || null })}
            className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md px-2 py-1 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All regions</option>
            {subdivisions.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} &mdash; {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Holiday table */}
      {loadingHolidays ? (
        <LoadingSpinner />
      ) : filteredHolidays.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          No holidays match the current filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Local Name</th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {filteredHolidays.map((h) => (
                <tr
                  key={h.date + h.name}
                  className="border-b border-gray-100 dark:border-gray-700/50"
                >
                  <td className="py-1.5 pr-4 text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {h.date}
                  </td>
                  <td className="py-1.5 pr-4 text-gray-700 dark:text-gray-300">{h.local_name}</td>
                  <td className="py-1.5 pr-4 text-gray-700 dark:text-gray-300">{h.name}</td>
                  <td className="py-1.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        h.is_global
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      }`}
                    >
                      {h.is_global ? 'National' : 'Regional'}
                    </span>
                    {!h.is_global && h.counties && h.counties.length > 0 && (
                      <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400">
                        {h.counties.map((c) => c.split('-').pop()).join(', ')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function HolidaysSettingsTab() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  // --- Add config form state ---
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCountry, setNewCountry] = useState('');
  const [newYear, setNewYear] = useState(new Date().getFullYear());

  // --- Blocked days state ---
  const [blockedYear, setBlockedYear] = useState(new Date().getFullYear());
  const [showAddBlocked, setShowAddBlocked] = useState(false);
  const [blockedDate, setBlockedDate] = useState('');
  const [blockedName, setBlockedName] = useState('');
  const [blockedRecurring, setBlockedRecurring] = useState(false);

  // --- Delete confirm ---
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'config' | 'blocked';
    id: string;
  } | null>(null);

  // --- Queries ---
  const { data: configs = [], isLoading: loadingConfigs } = useQuery({
    queryKey: ['holiday-configs'],
    queryFn: async () => {
      const res = await api.get<HolidayConfig[]>(`${BASE}/config`);
      return res.data;
    },
  });

  const { data: countries = [] } = useQuery({
    queryKey: ['holiday-countries'],
    queryFn: async () => {
      const res = await api.get<AvailableCountry[]>(`${BASE}/countries`);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: blockedDays = [], isLoading: loadingBlocked } = useQuery({
    queryKey: ['blocked-days', blockedYear],
    queryFn: async () => {
      const res = await api.get<CustomBlockedDay[]>(`${BASE}/blocked-days?year=${blockedYear}`);
      return res.data;
    },
  });

  // --- Mutations ---
  const createConfigMutation = useMutation({
    mutationFn: async () => {
      await api.post(`${BASE}/config`, {
        country_code: newCountry,
        year: newYear,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holiday-configs'] });
      setShowAddForm(false);
      setNewCountry('');
      setError('');
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${BASE}/config/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holiday-configs'] });
      setDeleteTarget(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const createBlockedMutation = useMutation({
    mutationFn: async () => {
      await api.post(`${BASE}/blocked-days`, {
        date: blockedDate,
        name: blockedName,
        is_recurring: blockedRecurring,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-days'] });
      setShowAddBlocked(false);
      setBlockedDate('');
      setBlockedName('');
      setBlockedRecurring(false);
      setError('');
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const deleteBlockedMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${BASE}/blocked-days/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-days'] });
      setDeleteTarget(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'config') {
      deleteConfigMutation.mutate(deleteTarget.id);
    } else {
      deleteBlockedMutation.mutate(deleteTarget.id);
    }
  }, [deleteTarget, deleteConfigMutation, deleteBlockedMutation]);

  // Year options for blocked-days filter
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => current + i);
  }, []);

  return (
    <div className="space-y-8">
      {error && <ErrorBanner message={error} />}

      {/* ─── Section 1: Public Holidays ─── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Public Holidays
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configure which public holidays to consider when scheduling trainings.
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Country / Year
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Country
                </label>
                <select
                  value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value)}
                  className="block w-48 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select country...</option>
                  {countries.map((c) => (
                    <option key={c.country_code} value={c.country_code}>
                      {c.name} ({c.country_code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Year
                </label>
                <input
                  type="number"
                  min={2020}
                  max={2099}
                  value={newYear}
                  onChange={(e) => setNewYear(Number(e.target.value))}
                  className="block w-28 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => createConfigMutation.mutate()}
                  disabled={!newCountry || createConfigMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
                >
                  {createConfigMutation.isPending ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Config cards */}
        {loadingConfigs ? (
          <LoadingSpinner />
        ) : configs.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p className="text-sm">No holiday configurations yet.</p>
            <p className="text-sm">Click &quot;Add Country / Year&quot; to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {configs.map((cfg) => (
              <HolidayConfigCard
                key={cfg.id}
                config={cfg}
                onDelete={(id) => setDeleteTarget({ type: 'config', id })}
              />
            ))}
          </div>
        )}
      </section>

      {/* Divider */}
      <hr className="border-gray-200 dark:border-gray-700" />

      {/* ─── Section 2: Custom Blocked Days ─── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Custom Blocked Days
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manually block specific dates (e.g. company events, school holidays).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={blockedYear}
              onChange={(e) => setBlockedYear(Number(e.target.value))}
              className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md px-2 py-1.5 focus:ring-primary-500 focus:border-primary-500"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowAddBlocked(!showAddBlocked)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Blocked Day
            </button>
          </div>
        </div>

        {/* Add blocked day form */}
        {showAddBlocked && (
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={blockedDate}
                  onChange={(e) => setBlockedDate(e.target.value)}
                  className="block border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={blockedName}
                  onChange={(e) => setBlockedName(e.target.value)}
                  placeholder="e.g. Company Retreat"
                  className="block w-56 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 pb-2">
                <input
                  type="checkbox"
                  checked={blockedRecurring}
                  onChange={(e) => setBlockedRecurring(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                Recurring yearly
              </label>
              <div className="flex gap-2 pb-0.5">
                <button
                  onClick={() => createBlockedMutation.mutate()}
                  disabled={!blockedDate || !blockedName || createBlockedMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
                >
                  {createBlockedMutation.isPending ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => setShowAddBlocked(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Blocked days table */}
        {loadingBlocked ? (
          <LoadingSpinner />
        ) : blockedDays.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p className="text-sm">No custom blocked days for {blockedYear}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Recurring</th>
                  <th className="py-2 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {blockedDays.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2 pr-4 text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {d.date}
                    </td>
                    <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{d.name}</td>
                    <td className="py-2 pr-4">
                      {d.is_recurring ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          Yearly
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-xs">Once</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => setDeleteTarget({ type: 'blocked', id: d.id })}
                        className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                        title="Delete"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={
          deleteTarget?.type === 'config' ? 'Remove Holiday Configuration' : 'Delete Blocked Day'
        }
        message={
          deleteTarget?.type === 'config'
            ? 'Are you sure you want to remove this holiday configuration? This action cannot be undone.'
            : 'Are you sure you want to delete this blocked day?'
        }
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
