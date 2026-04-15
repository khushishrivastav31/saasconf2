/**
 * Training Search & Browse Page
 *
 * Searchable list of available trainings with smart sidebar filters.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import publicApi from '../../config/publicApi';
import SmartFilters from './components/SmartFilters';
import TrainingCard from './components/TrainingCard';
import LanguageSwitcher from './components/LanguageSwitcher';

interface TrainingSearchProps {
  tenantSlug: string;
  lang: string;
  setLang: (lang: string) => void;
  availableLanguages: string[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export interface PublicTraining {
  placement_id: string;
  training_id: string | null;
  training_name: string;
  training_slug: string | null;
  training_description: string | null;
  training_content: string | null;
  start_date: string | null;
  duration: number;
  placement_type: string;
  location_name: string | null;
  location_city: string | null;
  language_name: string | null;
  language_id: string | null;
  syllabus_name: string | null;
  syllabus_id: string | null;
  theme_name: string | null;
  theme_id: string | null;
  regular_price: string | null;
  early_bird_price: string | null;
  currency: string;
  trainers: string[];
  logo_url: string | null;
  is_guaranteed: boolean;
  exam_price: string | null;
  location_country: string | null;
}

export interface FilterValues {
  locations: { value: string; count: number }[];
  languages: { id: string; name: string; count: number }[];
  syllabi: { id: string; name: string; count: number }[];
  themes: { id: string; name: string; count: number }[];
  guaranteed_count: number;
  date_range: { min: string | null; max: string | null };
}

export interface ActiveFilters {
  search: string;
  date_from: string;
  date_to: string;
  location: string[];
  language_id: string;
  syllabus_id: string;
  theme_id: string;
  guaranteed: boolean;
}

const emptyFilters: ActiveFilters = {
  search: '',
  date_from: '',
  date_to: '',
  location: [],
  language_id: '',
  syllabus_id: '',
  theme_id: '',
  guaranteed: false,
};

function buildParams(filters: ActiveFilters, page: number) {
  const params: Record<string, string> = { page: String(page), per_page: '20' };
  if (filters.search) params.search = filters.search;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.location.length > 0) params.location = filters.location.join(',');
  if (filters.language_id) params.language_id = filters.language_id;
  if (filters.syllabus_id) params.syllabus_id = filters.syllabus_id;
  if (filters.theme_id) params.theme_id = filters.theme_id;
  if (filters.guaranteed) params.guaranteed = 'true';
  return params;
}

const TrainingSearch = React.memo(function TrainingSearch({
  tenantSlug,
  lang,
  setLang,
  availableLanguages,
  t,
}: TrainingSearchProps) {
  const [filters, setFilters] = useState<ActiveFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const filterParams = useMemo(() => buildParams(filters, page), [filters, page]);

  // Fetch trainings
  const { data: trainingsData, isLoading } = useQuery({
    queryKey: ['public-trainings', tenantSlug, filterParams],
    queryFn: async () => {
      const res = await publicApi.get(`/portal/${tenantSlug}/trainings`, { params: filterParams });
      return res.data as { items: PublicTraining[]; total: number; page: number; per_page: number };
    },
    staleTime: 60_000,
  });

  // Fetch filter values (uses same filter params for intersection)
  const filterQueryParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (filters.search) p.search = filters.search;
    if (filters.date_from) p.date_from = filters.date_from;
    if (filters.date_to) p.date_to = filters.date_to;
    if (filters.location.length > 0) p.location = filters.location.join(',');
    if (filters.language_id) p.language_id = filters.language_id;
    if (filters.syllabus_id) p.syllabus_id = filters.syllabus_id;
    if (filters.theme_id) p.theme_id = filters.theme_id;
    if (filters.guaranteed) p.guaranteed = 'true';
    return p;
  }, [filters]);

  const { data: filterValues } = useQuery({
    queryKey: ['public-training-filters', tenantSlug, filterQueryParams],
    queryFn: async () => {
      const res = await publicApi.get(`/portal/${tenantSlug}/trainings/filters`, {
        params: filterQueryParams,
      });
      return res.data as FilterValues;
    },
    staleTime: 60_000,
  });

  const updateFilter = useCallback(
    <K extends keyof ActiveFilters>(key: K, value: ActiveFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(1);
    },
    []
  );

  const clearFilters = useCallback(() => {
    setFilters(emptyFilters);
    setPage(1);
  }, []);

  const hasActiveFilters = useMemo(
    () =>
      filters.search !== '' ||
      filters.date_from !== '' ||
      filters.date_to !== '' ||
      filters.location.length > 0 ||
      filters.language_id !== '' ||
      filters.syllabus_id !== '' ||
      filters.theme_id !== '' ||
      filters.guaranteed,
    [filters]
  );

  const totalPages = trainingsData ? Math.ceil(trainingsData.total / trainingsData.per_page) : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <a
        href="#training-list"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow"
      >
        Skip to trainings
      </a>
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              {t('search_title')}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('search_subtitle')}</p>
          </div>
          <LanguageSwitcher
            lang={lang}
            availableLanguages={availableLanguages}
            onChangeLang={setLang}
          />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Search bar */}
        <div className="mb-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder={t('search_placeholder')}
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                aria-label={t('search_placeholder')}
                className="w-full pl-10 pr-4 py-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            {/* Mobile filter toggle */}
            <button
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              className="lg:hidden min-h-[44px] px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium"
            >
              {t('filters')}
              {hasActiveFilters && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-primary-600 text-white rounded-full">
                  !
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="lg:flex lg:gap-6">
          {/* Sidebar filters — desktop always visible, mobile toggleable */}
          <aside
            className={`lg:block lg:w-64 lg:shrink-0 ${mobileFiltersOpen ? 'block mb-6' : 'hidden'}`}
          >
            <SmartFilters
              filters={filters}
              filterValues={filterValues}
              onUpdateFilter={updateFilter}
              onClear={clearFilters}
              hasActiveFilters={hasActiveFilters}
              t={t}
            />
          </aside>

          {/* Training list */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="flex justify-center py-16" role="status" aria-label="Loading">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
              </div>
            ) : !trainingsData || trainingsData.items.length === 0 ? (
              <div className="text-center py-16">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                  />
                </svg>
                <h3 className="mt-3 text-lg font-medium text-gray-900 dark:text-gray-100">
                  {t('no_results')}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {hasActiveFilters ? t('no_results_hint') : t('no_results')}
                </p>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="mt-4 text-sm text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    {t('filter_clear')}
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {t('showing_results', {
                    count: trainingsData.items.length,
                    total: trainingsData.total,
                  })}
                </p>
                <div id="training-list" className="space-y-4">
                  {trainingsData.items.map((item) => (
                    <TrainingCard
                      key={item.placement_id}
                      training={item}
                      tenantSlug={tenantSlug}
                      t={t}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="min-h-[44px] px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="min-h-[44px] px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default TrainingSearch;
