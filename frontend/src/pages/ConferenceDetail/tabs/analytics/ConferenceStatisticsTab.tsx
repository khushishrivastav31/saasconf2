/**
 * Conference Statistics Tab
 *
 * Six sub-tabs:
 *   1. Registrations Over Time — daily line chart with cumulative
 *   2. Attendees Location     — world map with city circles + country/city tables
 *   3. Attendees Company      — bar chart of top companies
 *   4. Papers Over Time       — monthly CFP submission line chart
 *   5. Attendees per Day      — bar chart of attendees per conference day
 *   6. Tutorials              — bar chart of attendees + revenue per tutorial
 */
import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { parseApiError } from '../../../../utils/apiError';
import type { Conference } from '../../../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegistrationTimePoint {
  date: string;
  count: number;
  cumulative: number;
}

interface RegistrationsOverTimeData {
  data_points: RegistrationTimePoint[];
}

interface CountryCount {
  country: string;
  country_code: string;
  count: number;
}

interface CityLocation {
  city: string;
  country: string;
  country_code: string;
  count: number;
  lat: number | null;
  lng: number | null;
}

interface AttendeesLocationData {
  by_country: CountryCount[];
  by_city: CityLocation[];
}

interface CompanyCount {
  company: string;
  count: number;
}

interface AttendeesCompanyData {
  companies: CompanyCount[];
  total_unique_companies: number;
}

interface PaperTimePoint {
  month: string;
  count: number;
  cumulative: number;
}

interface PapersOverTimeData {
  data_points: PaperTimePoint[];
  has_cfp: boolean;
}

interface DayAttendance {
  day_label: string;
  date: string;
  count: number;
}

interface AttendeesPerDayData {
  days: DayAttendance[];
  has_program_days: boolean;
}

interface TutorialStats {
  tutorial_name: string;
  session_title: string | null;
  speaker_name: string | null;
  attendee_count: number;
  revenue: number;
}

interface TutorialsData {
  tutorials: TutorialStats[];
  has_tutorials: boolean;
  total_revenue: number;
}

// ---------------------------------------------------------------------------
// Props & sub-tab config
// ---------------------------------------------------------------------------

interface ConferenceStatisticsTabProps {
  conference: Conference;
  isAdmin: boolean;
}

const SUB_TABS = [
  { id: 'registrations', label: 'Registrations Over Time' },
  { id: 'location', label: 'Attendees Location' },
  { id: 'company', label: 'Attendees Company' },
  { id: 'papers', label: 'Papers Over Time' },
  { id: 'days', label: 'Attendees per Day' },
  { id: 'tutorials', label: 'Tutorials' },
] as const;

type SubTabId = (typeof SUB_TABS)[number]['id'];

// TopoJSON for world countries (natural earth 110m)
const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-500">
      <svg className="animate-spin h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      Loading…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return <div className="py-10 text-center text-red-500 dark:text-red-400 text-sm">{message}</div>;
}

function NotApplicable({ message }: { message: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-gray-400 dark:text-gray-500 text-sm">{message}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-gray-400 dark:text-gray-500 text-sm">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-view: Registrations Over Time
// ---------------------------------------------------------------------------

function RegistrationsOverTimeView({ conferenceId }: { conferenceId: string }) {
  const { data, isLoading, error } = useQuery<RegistrationsOverTimeData>({
    queryKey: queryKeys.analytics.statsRegistrationsOverTime(conferenceId),
    queryFn: async () => {
      const res = await api.get(
        `/conferences/${conferenceId}/analytics/stats/registrations-over-time`
      );
      return res.data;
    },
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={parseApiError(error)} />;
  if (!data || data.data_points.length === 0) {
    return <EmptyState message="No registration data yet." />;
  }

  const chartData = data.data_points.map((p) => ({
    date: p.date,
    Registrations: p.count,
    Cumulative: p.cumulative,
  }));

  return (
    <div className="space-y-4">
      <div className="flex gap-6 text-sm text-gray-500 dark:text-gray-400">
        <span>
          Total:{' '}
          <strong className="text-gray-900 dark:text-gray-100">
            {data.data_points[data.data_points.length - 1]?.cumulative ?? 0}
          </strong>
        </span>
        <span>
          Days with registrations:{' '}
          <strong className="text-gray-900 dark:text-gray-100">{data.data_points.length}</strong>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="Registrations"
            stroke="#6366f1"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="Cumulative"
            stroke="#10b981"
            dot={false}
            strokeWidth={2}
            strokeDasharray="4 2"
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Solid line = daily registrations · Dashed line = cumulative total
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-view: Attendees Location
// ---------------------------------------------------------------------------

function AttendeesLocationView({ conferenceId }: { conferenceId: string }) {
  const { data, isLoading, error } = useQuery<AttendeesLocationData>({
    queryKey: queryKeys.analytics.statsAttendeesLocation(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/analytics/stats/attendees-location`);
      return res.data;
    },
  });

  const citiesWithCoords = useMemo(
    () => (data?.by_city ?? []).filter((c) => c.lat !== null && c.lng !== null),
    [data?.by_city]
  );

  const [mapZoom, setMapZoom] = useState(1);
  const [mapCenter, setMapCenter] = useState<[number, number]>([10, 20]);

  const handleZoomIn = useCallback(() => setMapZoom((z) => Math.min(z * 1.5, 20)), []);
  const handleZoomOut = useCallback(() => setMapZoom((z) => Math.max(z / 1.5, 1)), []);
  const handleReset = useCallback(() => {
    setMapZoom(1);
    setMapCenter([10, 20]);
  }, []);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={parseApiError(error)} />;
  if (!data || (data.by_country.length === 0 && data.by_city.length === 0)) {
    return (
      <EmptyState message="No location data yet. Location is collected via billing profiles during registration." />
    );
  }

  const maxCount = Math.max(...data.by_city.map((c) => c.count), 1);

  return (
    <div className="space-y-6">
      {/* World map with zoom/pan */}
      {citiesWithCoords.length > 0 && (
        <div className="relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900">
          {/* Zoom controls */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
            <button
              onClick={handleZoomIn}
              className="w-8 h-8 flex items-center justify-center rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 shadow-sm text-lg font-bold"
              title="Zoom in"
            >
              +
            </button>
            <button
              onClick={handleZoomOut}
              className="w-8 h-8 flex items-center justify-center rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 shadow-sm text-lg font-bold"
              title="Zoom out"
            >
              −
            </button>
            <button
              onClick={handleReset}
              className="w-8 h-8 flex items-center justify-center rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 shadow-sm text-xs"
              title="Reset zoom"
            >
              ⟲
            </button>
          </div>
          {mapZoom > 1 && (
            <div className="absolute bottom-3 left-3 z-10 text-xs text-gray-500 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 px-2 py-1 rounded">
              Drag to pan · Scroll to zoom
            </div>
          )}
          <ComposableMap projection="geoNaturalEarth1" height={400}>
            <ZoomableGroup
              zoom={mapZoom}
              center={mapCenter}
              onMoveEnd={({
                coordinates,
                zoom,
              }: {
                coordinates: [number, number];
                zoom: number;
              }) => {
                setMapCenter(coordinates);
                setMapZoom(zoom);
              }}
              minZoom={1}
              maxZoom={20}
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill="#d1d5db"
                      stroke="#f3f4f6"
                      strokeWidth={0.5}
                      style={{
                        default: { outline: 'none' },
                        hover: { outline: 'none', fill: '#a1a1aa' },
                        pressed: { outline: 'none' },
                      }}
                    />
                  ))
                }
              </Geographies>
              {citiesWithCoords.map((city) => {
                const r = Math.max(3, Math.sqrt(city.count / maxCount) * 12);
                return (
                  <Marker
                    key={`${city.city}-${city.country_code}`}
                    coordinates={[city.lng as number, city.lat as number]}
                  >
                    <circle
                      r={r / Math.sqrt(mapZoom)}
                      fill="#6366f1"
                      fillOpacity={0.6}
                      stroke="#4f46e5"
                      strokeWidth={1 / mapZoom}
                    />
                    <title>
                      {city.city}, {city.country}: {city.count}
                    </title>
                  </Marker>
                );
              })}
            </ZoomableGroup>
          </ComposableMap>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Country table */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">By Country</h3>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">
                    Country
                  </th>
                  <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-400 font-medium">
                    Attendees
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.by_country.map((row) => (
                  <tr
                    key={row.country_code}
                    className="border-t border-gray-100 dark:border-gray-700"
                  >
                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{row.country}</td>
                    <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100 font-medium">
                      {row.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* City table */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">By City</h3>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">
                    City
                  </th>
                  <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">
                    Country
                  </th>
                  <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-400 font-medium">
                    Attendees
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.by_city.slice(0, 30).map((row) => (
                  <tr
                    key={`${row.city}-${row.country_code}`}
                    className={`border-t border-gray-100 dark:border-gray-700${row.lat != null && row.lng != null ? ' cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700' : ''}`}
                    onClick={() => {
                      if (row.lat != null && row.lng != null) {
                        setMapCenter([row.lng, row.lat]);
                        setMapZoom(6);
                      }
                    }}
                  >
                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                      {row.city}
                      {row.lat != null && <span className="ml-1 text-xs text-gray-400">↗</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{row.country}</td>
                    <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100 font-medium">
                      {row.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-view: Attendees Company
// ---------------------------------------------------------------------------

function AttendeesCompanyView({ conferenceId }: { conferenceId: string }) {
  const { data, isLoading, error } = useQuery<AttendeesCompanyData>({
    queryKey: queryKeys.analytics.statsAttendeesCompany(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/analytics/stats/attendees-company`);
      return res.data;
    },
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={parseApiError(error)} />;
  if (!data || data.companies.length === 0) {
    return <EmptyState message="No company data yet." />;
  }

  const top20 = data.companies.slice(0, 20);

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {data.total_unique_companies} unique companies
      </div>
      <ResponsiveContainer width="100%" height={Math.max(240, top20.length * 28)}>
        <BarChart
          data={top20}
          layout="vertical"
          margin={{ top: 0, right: 40, bottom: 0, left: 120 }}
        >
          <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis
            type="category"
            dataKey="company"
            tick={{ fontSize: 11 }}
            tickLine={false}
            width={115}
          />
          <Tooltip />
          <Bar dataKey="count" name="Attendees" fill="#6366f1" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Full company table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                #
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Company
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Attendees
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {data.companies.map((c, i) => (
              <tr key={c.company} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                  {i + 1}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                  {c.company}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                  {c.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-view: Papers Over Time
// ---------------------------------------------------------------------------

function PapersOverTimeView({ conferenceId }: { conferenceId: string }) {
  const { data, isLoading, error } = useQuery<PapersOverTimeData>({
    queryKey: queryKeys.analytics.statsPapersOverTime(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/analytics/stats/papers-over-time`);
      return res.data;
    },
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={parseApiError(error)} />;
  if (!data?.has_cfp) {
    return <NotApplicable message="This conference has no Call for Papers configured." />;
  }
  if (data.data_points.length === 0) {
    return <EmptyState message="No paper submissions yet." />;
  }

  const chartData = data.data_points.map((p) => ({
    month: p.month,
    Submissions: p.count,
    Cumulative: p.cumulative,
  }));

  return (
    <div className="space-y-4">
      <div className="flex gap-6 text-sm text-gray-500 dark:text-gray-400">
        <span>
          Total papers:{' '}
          <strong className="text-gray-900 dark:text-gray-100">
            {data.data_points[data.data_points.length - 1]?.cumulative ?? 0}
          </strong>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="Submissions"
            stroke="#6366f1"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="Cumulative"
            stroke="#10b981"
            dot={false}
            strokeWidth={2}
            strokeDasharray="4 2"
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Solid line = monthly submissions · Dashed line = cumulative total
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-view: Attendees per Day
// ---------------------------------------------------------------------------

function AttendeesPerDayView({ conferenceId }: { conferenceId: string }) {
  const { data, isLoading, error } = useQuery<AttendeesPerDayData>({
    queryKey: queryKeys.analytics.statsAttendeesPerDay(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/analytics/stats/attendees-per-day`);
      return res.data;
    },
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={parseApiError(error)} />;
  if (!data?.has_program_days) {
    return <NotApplicable message="This conference has no program days configured." />;
  }
  if (data.days.length === 0) {
    return <EmptyState message="No day-specific attendance data yet." />;
  }

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data.days} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="day_label"
            tick={{ fontSize: 10 }}
            tickLine={false}
            angle={-20}
            textAnchor="end"
          />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip />
          <Bar dataKey="count" name="Attendees" fill="#6366f1" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-view: Tutorials
// ---------------------------------------------------------------------------

function TutorialsView({ conferenceId }: { conferenceId: string }) {
  const { data, isLoading, error } = useQuery<TutorialsData>({
    queryKey: queryKeys.analytics.statsTutorials(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/analytics/stats/tutorials`);
      return res.data;
    },
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={parseApiError(error)} />;
  if (!data?.has_tutorials) {
    return <NotApplicable message="No tutorial registrations found for this conference." />;
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Total tutorial revenue:{' '}
        <strong className="text-gray-900 dark:text-gray-100">
          {data.total_revenue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </strong>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={Math.max(240, data.tutorials.length * 32)}>
        <BarChart
          data={data.tutorials}
          layout="vertical"
          margin={{ top: 0, right: 40, bottom: 0, left: 160 }}
        >
          <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis
            type="category"
            dataKey="tutorial_name"
            tick={{ fontSize: 11 }}
            tickLine={false}
            width={155}
          />
          <Tooltip />
          <Bar dataKey="attendee_count" name="Attendees" fill="#6366f1" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Table */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">
                Tutorial
              </th>
              <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">
                Booking Option
              </th>
              <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-400 font-medium">
                Attendees
              </th>
              <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-400 font-medium">
                Revenue
              </th>
            </tr>
          </thead>
          <tbody>
            {data.tutorials.map((t, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2">
                  <div className="text-gray-900 dark:text-gray-100">{t.tutorial_name}</div>
                  {t.speaker_name && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t.speaker_name}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                  {t.session_title ?? '—'}
                </td>
                <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100 font-medium">
                  {t.attendee_count}
                </td>
                <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">
                  {t.revenue.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ConferenceStatisticsTab({ conference }: ConferenceStatisticsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('registrations');
  const conferenceId = conference.id;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Conference Statistics
      </h2>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium rounded-t transition-colors ${
              activeSubTab === tab.id
                ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div>
        {activeSubTab === 'registrations' && (
          <RegistrationsOverTimeView conferenceId={conferenceId} />
        )}
        {activeSubTab === 'location' && <AttendeesLocationView conferenceId={conferenceId} />}
        {activeSubTab === 'company' && <AttendeesCompanyView conferenceId={conferenceId} />}
        {activeSubTab === 'papers' && <PapersOverTimeView conferenceId={conferenceId} />}
        {activeSubTab === 'days' && <AttendeesPerDayView conferenceId={conferenceId} />}
        {activeSubTab === 'tutorials' && <TutorialsView conferenceId={conferenceId} />}
      </div>
    </div>
  );
}
