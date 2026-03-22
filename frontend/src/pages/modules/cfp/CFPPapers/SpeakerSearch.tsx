import { useState, useMemo, useEffect, useRef } from 'react';
import type { Applicant, Cospeaker } from '../../../../types';
import { INVITATION_STATUS_COLORS } from '../../../../config/statusColors';
import { CloseIcon } from '../../../ConferenceDetail/icons';

// ---------------------------------------------------------------------------
// Main speaker email search component
// ---------------------------------------------------------------------------

export function MainSpeakerSearch({
  applicants,
  selectedId,
  onSelect,
  onClear,
  disabled,
}: {
  applicants: Applicant[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedApplicant = useMemo(
    () => applicants.find((a) => a.id === selectedId),
    [applicants, selectedId]
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredApplicants = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return applicants
      .filter(
        (a) =>
          a.email.toLowerCase().includes(q) ||
          a.first_name.toLowerCase().includes(q) ||
          a.last_name.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [applicants, query]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Main Speaker <span className="text-red-500">*</span>
      </label>

      {selectedApplicant ? (
        <div className="flex items-center gap-2 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-900">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{`${selectedApplicant.first_name} ${selectedApplicant.last_name}`}</span>
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              {selectedApplicant.email}
            </span>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                onClear();
                setQuery('');
              }}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 flex-shrink-0"
              aria-label="Clear selection"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      ) : (
        <div className="relative" ref={wrapperRef}>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => query.trim() && setShowDropdown(true)}
            placeholder="Search by email or name..."
            disabled={disabled}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          />
          {showDropdown && filteredApplicants.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-48 overflow-y-auto">
              {filteredApplicants.map((applicant) => (
                <button
                  key={applicant.id}
                  type="button"
                  onClick={() => {
                    onSelect(applicant.id);
                    setQuery('');
                    setShowDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50 transition-colors"
                >
                  <span className="font-medium text-gray-900 dark:text-gray-100">{`${applicant.first_name} ${applicant.last_name}`}</span>
                  <span className="ml-2 text-gray-500 dark:text-gray-400">{applicant.email}</span>
                </button>
              ))}
            </div>
          )}
          {showDropdown && query.trim() && filteredApplicants.length === 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-3 text-sm text-gray-500 dark:text-gray-400">
              No applicants found matching "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Co-speaker email search component
// ---------------------------------------------------------------------------

export function CospeakerSearch({
  applicants,
  selectedIds,
  existingCospeakers,
  onToggle,
  disabled,
}: {
  applicants: Applicant[];
  selectedIds: string[];
  existingCospeakers: Cospeaker[];
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  const [emailQuery, setEmailQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredApplicants = useMemo(() => {
    if (!emailQuery.trim()) return [];
    const q = emailQuery.toLowerCase();
    return applicants
      .filter(
        (a) =>
          !selectedIds.includes(a.id) &&
          (a.email.toLowerCase().includes(q) ||
            a.first_name.toLowerCase().includes(q) ||
            a.last_name.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [applicants, emailQuery, selectedIds]);

  // Build selected applicants with invitation status
  const selectedApplicants = useMemo(() => {
    return selectedIds.map((id) => {
      const applicant = applicants.find((a) => a.id === id);
      const existing = existingCospeakers.find((c) => c.applicant.id === id);
      return {
        id,
        name: applicant
          ? `${applicant.first_name} ${applicant.last_name}`
          : existing
            ? `${existing.applicant.first_name} ${existing.applicant.last_name}`
            : 'Unknown',
        email: applicant?.email || existing?.applicant.email || '',
        invitation_status: existing?.invitation_status || 'pending',
      };
    });
  }, [selectedIds, applicants, existingCospeakers]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Co-speakers <span className="text-gray-400 dark:text-gray-500 font-normal">(max 3)</span>
      </label>

      {/* Selected co-speakers as chips */}
      {selectedApplicants.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedApplicants.map((sa) => (
            <span
              key={sa.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-200"
            >
              <span>{sa.name}</span>
              <span className="text-primary-400 text-xs">({sa.email})</span>
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${INVITATION_STATUS_COLORS[sa.invitation_status] || 'bg-gray-100 text-gray-600'}`}
              >
                {sa.invitation_status}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onToggle(sa.id)}
                  className="ml-0.5 text-primary-400 hover:text-primary-700"
                >
                  <svg
                    className="w-3.5 h-3.5"
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
          ))}
        </div>
      )}

      {/* Email search input */}
      {!disabled && selectedIds.length < 3 && (
        <div className="relative" ref={wrapperRef}>
          <input
            type="text"
            value={emailQuery}
            onChange={(e) => {
              setEmailQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => emailQuery.trim() && setShowDropdown(true)}
            placeholder="Search by email or name..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
          />
          {showDropdown && filteredApplicants.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-48 overflow-y-auto">
              {filteredApplicants.map((applicant) => (
                <button
                  key={applicant.id}
                  type="button"
                  onClick={() => {
                    onToggle(applicant.id);
                    setEmailQuery('');
                    setShowDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50 transition-colors flex items-center justify-between"
                >
                  <div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{`${applicant.first_name} ${applicant.last_name}`}</span>
                    <span className="ml-2 text-gray-500 dark:text-gray-400">{applicant.email}</span>
                  </div>
                  <svg
                    className="w-4 h-4 text-primary-500 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </button>
              ))}
            </div>
          )}
          {showDropdown && emailQuery.trim() && filteredApplicants.length === 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-3 text-sm text-gray-500 dark:text-gray-400">
              No applicants found matching "{emailQuery}"
            </div>
          )}
        </div>
      )}

      {selectedIds.length > 0 && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {selectedIds.length}/3 co-speakers selected
        </p>
      )}
    </div>
  );
}
