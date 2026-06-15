import { useMemo, useState, useEffect, useRef } from 'react';
import {
  getCountryCallingCode,
  parsePhoneNumber,
  AsYouType,
  type CountryCode,
} from 'libphonenumber-js';
import { COUNTRY_OPTIONS } from '../../../config/countries';

interface Props {
  value: string;
  onChange: (e164: string) => void;
  defaultCountry?: string;
  required?: boolean;
}

const inputClass =
  'border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100';

const dialOptions = COUNTRY_OPTIONS.map((c) => {
  try {
    return { code: c.code, name: c.name, dial: `+${getCountryCallingCode(c.code as CountryCode)}` };
  } catch {
    return null;
  }
}).filter(Boolean) as { code: string; name: string; dial: string }[];

function parseE164(value: string): { country: CountryCode | ''; national: string } | null {
  if (!value || !value.startsWith('+')) return null;
  try {
    const parsed = parsePhoneNumber(value);
    if (parsed) {
      return {
        country: parsed.country ?? '',
        national: parsed.nationalNumber,
      };
    }
  } catch {
    // ignore parse errors for unrecognised prefixes
  }
  return null;
}

export default function PhoneNumberInput({
  value,
  onChange,
  defaultCountry = '',
  required,
}: Props) {
  const parsed = useMemo(() => parseE164(value), [value]);

  const [country, setCountry] = useState<string>(parsed?.country ?? defaultCountry);
  const [national, setNational] = useState<string>(
    parsed?.national ?? (value && !value.startsWith('+') ? value : '')
  );

  // Track the last value we emitted so we can skip re-syncing our own updates.
  // Without this, every keystroke would call onChange → update value prop →
  // trigger the effect below → reset the country dropdown to empty.
  const lastEmitted = useRef<string>('');

  // Sync from an externally-supplied value (e.g. data arriving from the server
  // after mount). Skip when the change is one we just emitted ourselves.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    if (!value) return;
    const p = parseE164(value);
    if (p) {
      setCountry(p.country);
      setNational(p.national);
    } else if (!value.startsWith('+')) {
      setNational(value);
      setCountry('');
    }
  }, [value]);

  function emit(c: string, n: string) {
    let out: string;
    if (!c || !n.trim()) {
      out = n.trim();
    } else {
      try {
        const asYouType = new AsYouType(c as CountryCode);
        asYouType.input(n);
        const result = asYouType.getNumber();
        out = result?.number ?? n;
      } catch {
        out = n;
      }
    }
    lastEmitted.current = out;
    onChange(out);
  }

  function handleCountryChange(c: string) {
    setCountry(c);
    emit(c, national);
  }

  function handleNationalChange(n: string) {
    setNational(n);
    emit(country, n);
  }

  return (
    <div className="flex gap-2">
      <select
        value={country}
        onChange={(e) => handleCountryChange(e.target.value)}
        className={`${inputClass} w-44 shrink-0`}
        required={required && !country}
      >
        <option value="">Select country...</option>
        {dialOptions.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.name} ({opt.dial})
          </option>
        ))}
      </select>
      <input
        type="tel"
        value={national}
        onChange={(e) => handleNationalChange(e.target.value)}
        className={`${inputClass} flex-1`}
        placeholder="National number"
      />
    </div>
  );
}
