// Intl.supportedValuesOf is available in all modern browsers but not in older TS lib types
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Intl {
    function supportedValuesOf(key: string): string[];
  }
}

export interface TimezoneOption {
  /** IANA timezone string stored in the database, e.g. "Europe/Berlin" */
  value: string;
  /** Display label, e.g. "UTC+1 (Berlin, Paris, Rome, Vienna)" */
  label: string;
  /** Standard UTC offset in hours for sorting */
  offset: number;
}

/**
 * Curated timezone list covering all standard UTC offsets.
 * Labels show the UTC offset plus well-known cities.
 * Values are canonical IANA timezone strings.
 */
export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'Pacific/Midway', label: 'UTC-11 (Midway, Samoa)', offset: -11 },
  { value: 'Pacific/Honolulu', label: 'UTC-10 (Honolulu, Hawaii)', offset: -10 },
  { value: 'America/Anchorage', label: 'UTC-9 (Anchorage, Alaska)', offset: -9 },
  { value: 'America/Los_Angeles', label: 'UTC-8 (Los Angeles, Vancouver)', offset: -8 },
  { value: 'America/Denver', label: 'UTC-7 (Denver, Phoenix)', offset: -7 },
  { value: 'America/Chicago', label: 'UTC-6 (Chicago, Mexico City)', offset: -6 },
  { value: 'America/New_York', label: 'UTC-5 (New York, Toronto, Lima)', offset: -5 },
  { value: 'America/Halifax', label: 'UTC-4 (Halifax, Santiago, Caracas)', offset: -4 },
  { value: 'America/St_Johns', label: "UTC-3:30 (St. John's, Newfoundland)", offset: -3.5 },
  { value: 'America/Sao_Paulo', label: 'UTC-3 (S\u00e3o Paulo, Buenos Aires)', offset: -3 },
  { value: 'Atlantic/South_Georgia', label: 'UTC-2 (South Georgia)', offset: -2 },
  { value: 'Atlantic/Azores', label: 'UTC-1 (Azores, Cape Verde)', offset: -1 },
  { value: 'Europe/London', label: 'UTC+0 (London, Dublin, Lisbon)', offset: 0 },
  { value: 'Europe/Berlin', label: 'UTC+1 (Berlin, Paris, Rome, Vienna, Brussels)', offset: 1 },
  {
    value: 'Europe/Helsinki',
    label: 'UTC+2 (Helsinki, Athens, Bucharest, Kyiv, Cairo)',
    offset: 2,
  },
  { value: 'Europe/Moscow', label: 'UTC+3 (Moscow, Istanbul, Riyadh, Nairobi)', offset: 3 },
  { value: 'Asia/Tehran', label: 'UTC+3:30 (Tehran)', offset: 3.5 },
  { value: 'Asia/Dubai', label: 'UTC+4 (Dubai, Baku, Tbilisi)', offset: 4 },
  { value: 'Asia/Kabul', label: 'UTC+4:30 (Kabul)', offset: 4.5 },
  { value: 'Asia/Karachi', label: 'UTC+5 (Karachi, Tashkent)', offset: 5 },
  { value: 'Asia/Kolkata', label: 'UTC+5:30 (Mumbai, New Delhi, Colombo)', offset: 5.5 },
  { value: 'Asia/Kathmandu', label: 'UTC+5:45 (Kathmandu)', offset: 5.75 },
  { value: 'Asia/Dhaka', label: 'UTC+6 (Dhaka, Almaty)', offset: 6 },
  { value: 'Asia/Yangon', label: 'UTC+6:30 (Yangon)', offset: 6.5 },
  { value: 'Asia/Bangkok', label: 'UTC+7 (Bangkok, Jakarta, Hanoi)', offset: 7 },
  { value: 'Asia/Shanghai', label: 'UTC+8 (Beijing, Singapore, Perth, Taipei)', offset: 8 },
  { value: 'Asia/Tokyo', label: 'UTC+9 (Tokyo, Seoul)', offset: 9 },
  { value: 'Australia/Adelaide', label: 'UTC+9:30 (Adelaide, Darwin)', offset: 9.5 },
  { value: 'Australia/Sydney', label: 'UTC+10 (Sydney, Melbourne, Brisbane)', offset: 10 },
  { value: 'Pacific/Noumea', label: 'UTC+11 (Noumea, Solomon Islands)', offset: 11 },
  { value: 'Pacific/Auckland', label: 'UTC+12 (Auckland, Fiji)', offset: 12 },
  { value: 'Pacific/Tongatapu', label: "UTC+13 (Nuku'alofa, Samoa)", offset: 13 },
];

/**
 * Get the current UTC offset in minutes for an IANA timezone.
 */
function getOffsetMinutes(tz: string): number {
  const now = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = now.toLocaleString('en-US', { timeZone: tz });
  return Math.round((new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000);
}

/**
 * Resolve any IANA timezone to the matching curated option value.
 * Computes the timezone's current offset and finds the closest match.
 * Returns the original value if no match found.
 */
export function resolveTimezoneValue(tz: string): string {
  if (!tz) return '';
  // Check if it's already one of our option values
  if (TIMEZONE_OPTIONS.some((opt) => opt.value === tz)) return tz;
  // Compute offset and find the closest match
  try {
    const offsetMin = getOffsetMinutes(tz);
    const offsetHours = offsetMin / 60;
    let bestMatch = TIMEZONE_OPTIONS[0];
    let bestDiff = Infinity;
    for (const opt of TIMEZONE_OPTIONS) {
      const diff = Math.abs(opt.offset - offsetHours);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = opt;
      }
    }
    return bestMatch.value;
  } catch {
    return tz;
  }
}

/**
 * Default timezone for each country (by name).
 * Used to auto-suggest a timezone when the user selects a country.
 */
export const COUNTRY_DEFAULT_TIMEZONE: Record<string, string> = {
  Albania: 'Europe/Berlin',
  Andorra: 'Europe/Berlin',
  Armenia: 'Asia/Dubai',
  Australia: 'Australia/Sydney',
  Austria: 'Europe/Berlin',
  Azerbaijan: 'Asia/Dubai',
  Belarus: 'Europe/Moscow',
  Belgium: 'Europe/Berlin',
  'Bosnia and Herzegovina': 'Europe/Berlin',
  Brazil: 'America/Sao_Paulo',
  Bulgaria: 'Europe/Helsinki',
  Canada: 'America/New_York',
  China: 'Asia/Shanghai',
  Croatia: 'Europe/Berlin',
  Cyprus: 'Europe/Helsinki',
  Czechia: 'Europe/Berlin',
  Denmark: 'Europe/Berlin',
  Estonia: 'Europe/Helsinki',
  Finland: 'Europe/Helsinki',
  France: 'Europe/Berlin',
  Georgia: 'Asia/Dubai',
  Germany: 'Europe/Berlin',
  Greece: 'Europe/Helsinki',
  Hungary: 'Europe/Berlin',
  Iceland: 'Europe/London',
  India: 'Asia/Kolkata',
  Ireland: 'Europe/London',
  Israel: 'Europe/Helsinki',
  Italy: 'Europe/Berlin',
  Japan: 'Asia/Tokyo',
  Latvia: 'Europe/Helsinki',
  Liechtenstein: 'Europe/Berlin',
  Lithuania: 'Europe/Helsinki',
  Luxembourg: 'Europe/Berlin',
  Malta: 'Europe/Berlin',
  Moldova: 'Europe/Helsinki',
  Monaco: 'Europe/Berlin',
  Montenegro: 'Europe/Berlin',
  Netherlands: 'Europe/Berlin',
  'New Zealand': 'Pacific/Auckland',
  'North Macedonia': 'Europe/Berlin',
  Norway: 'Europe/Berlin',
  Poland: 'Europe/Berlin',
  Portugal: 'Europe/London',
  Romania: 'Europe/Helsinki',
  Russia: 'Europe/Moscow',
  Serbia: 'Europe/Berlin',
  Slovakia: 'Europe/Berlin',
  Slovenia: 'Europe/Berlin',
  'South Korea': 'Asia/Tokyo',
  Spain: 'Europe/Berlin',
  Sweden: 'Europe/Berlin',
  Switzerland: 'Europe/Berlin',
  Turkey: 'Europe/Moscow',
  Ukraine: 'Europe/Helsinki',
  'United Kingdom': 'Europe/London',
  'United States': 'America/New_York',
};
