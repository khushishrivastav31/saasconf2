import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Modal from '../../../../components/Modal';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type {
  BookingOption,
  BookingPeriod,
  BulkDiscountCodeCreate,
  BulkDiscountEntry,
  PlatformCurrency,
  Sponsor,
  Applicant,
  CommitteeMember,
  RecipientListResponse,
  RecipientListDetailResponse,
} from '../../../../types';

type SourceType = 'sponsors' | 'speakers' | 'committee' | 'recipient_list';

interface PersonEntry {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string;
  email: string;
}

interface BulkDiscountModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: BulkDiscountCodeCreate) => void;
  conferenceId: string;
  conferenceSlug: string;
  bookingOptions: BookingOption[];
  bookingPeriods: BookingPeriod[];
  currencyOptions: PlatformCurrency[] | undefined;
  conferenceCurrency?: string | null;
  isPending?: boolean;
  error?: string;
}

const TEMPLATE_VARS = [
  { label: 'ConferenceSlug', example: 'AGILETD2026' },
  { label: 'FirstName', example: 'Lisa' },
  { label: 'LastName', example: 'Crispin' },
  { label: 'FullName', example: 'Lisa Crispin' },
  { label: 'CompanyName', example: 'Acme Corp' },
  { label: 'Email', example: 'lisa@acme.com' },
  { label: 'Counter', example: '001' },
];

function resolveTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\[(\w+)\]/g, (match, key) => vars[key] ?? match);
}

export default function BulkDiscountModal({
  open,
  onClose,
  onSubmit,
  conferenceId,
  conferenceSlug,
  bookingOptions,
  bookingPeriods,
  currencyOptions,
  conferenceCurrency,
  isPending,
  error,
}: BulkDiscountModalProps) {
  const isCurrencyLocked = !!conferenceCurrency;

  // Step state
  const [step, setStep] = useState<1 | 2>(1);

  // Source
  const [source, setSource] = useState<SourceType>('sponsors');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());

  // Templates
  const [descTemplate, setDescTemplate] = useState('[ConferenceSlug] discount for [FullName]');
  const [codeTemplate, setCodeTemplate] = useState('[ConferenceSlug][LastName]_[Counter]');
  const [counterStart, setCounterStart] = useState(1);
  const [counterPadding, setCounterPadding] = useState(3);

  // Shared settings
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [currency, setCurrency] = useState(conferenceCurrency || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [isCombinable, setIsCombinable] = useState(false);
  const [applicableOptions, setApplicableOptions] = useState<string[]>([]);
  const [applicablePeriods, setApplicablePeriods] = useState<string[]>([]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedPeople(new Set());
      setDiscountValue('');
      setCurrency(conferenceCurrency || '');
      setStartDate('');
      setEndDate('');
      setMaxUses('1');
      setIsActive(true);
      setIsCombinable(false);
      setApplicableOptions([]);
      setApplicablePeriods([]);
    }
  }, [open, conferenceCurrency]);

  // Data queries
  const { data: sponsors } = useQuery({
    queryKey: queryKeys.sponsors.byConference(conferenceId),
    queryFn: async () => {
      const res = await api.get<{ items: Sponsor[] }>(`/conferences/${conferenceId}/sponsors`);
      return res.data.items;
    },
    enabled: open && source === 'sponsors',
  });

  const { data: speakers } = useQuery({
    queryKey: queryKeys.cfp.applicants(conferenceId),
    queryFn: async () => {
      const res = await api.get<{ items: Applicant[] }>(`/cfp/applicants`, {
        params: { conference_id: conferenceId },
      });
      return res.data.items;
    },
    enabled: open && source === 'speakers',
  });

  const { data: committee } = useQuery({
    queryKey: queryKeys.cfp.committeeMembers(conferenceId),
    queryFn: async () => {
      const res = await api.get<{ items: CommitteeMember[] }>(`/cfp/committee-members`, {
        params: { conference_id: conferenceId, limit: 500 },
      });
      return res.data.items;
    },
    enabled: open && source === 'committee',
  });

  const { data: recipientLists } = useQuery({
    queryKey: queryKeys.messaging.recipientLists(conferenceId),
    queryFn: async () => {
      const res = await api.get<{ items: RecipientListResponse[] }>(
        `/conferences/${conferenceId}/messaging/recipient-lists`
      );
      return res.data.items;
    },
    enabled: open && source === 'recipient_list',
  });

  const { data: recipientListDetail } = useQuery({
    queryKey: queryKeys.messaging.recipientListDetail(conferenceId, selectedListId),
    queryFn: async () => {
      const res = await api.get<RecipientListDetailResponse>(
        `/conferences/${conferenceId}/messaging/recipient-lists/${selectedListId}`
      );
      return res.data;
    },
    enabled: open && source === 'recipient_list' && !!selectedListId,
  });

  // Map source data to normalized PersonEntry
  const people: PersonEntry[] = useMemo(() => {
    switch (source) {
      case 'sponsors':
        return (sponsors || []).map((s) => {
          const cp = (s.contact_persons || [])[0];
          return {
            id: s.id,
            first_name: cp?.first_name || s.company_name || 'Sponsor',
            last_name: cp?.last_name || s.company_name || 'Sponsor',
            company_name: s.company_name,
            email: cp?.email || '',
          };
        });
      case 'speakers':
        return (speakers || []).map((a) => ({
          id: a.id,
          first_name: a.first_name || a.email || 'Speaker',
          last_name: a.last_name || a.company || 'Speaker',
          company_name: a.company || '',
          email: a.email || '',
        }));
      case 'committee':
        return (committee || []).map((m) => ({
          id: m.id,
          first_name: m.first_name || m.email || 'Member',
          last_name: m.last_name || m.company || 'Member',
          company_name: m.company || '',
          email: m.email || '',
        }));
      case 'recipient_list':
        return (recipientListDetail?.members || []).map((m) => ({
          id: m.id,
          first_name: m.first_name || m.email || 'Recipient',
          last_name: m.last_name || 'Recipient',
          company_name: '',
          email: m.email || '',
        }));
    }
  }, [source, sponsors, speakers, committee, recipientListDetail]);

  // Reset selection when source changes
  useEffect(() => {
    setSelectedPeople(new Set());
    setSelectedListId('');
  }, [source]);

  const togglePerson = (id: string) => {
    setSelectedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedPeople.size === people.length) {
      setSelectedPeople(new Set());
    } else {
      setSelectedPeople(new Set(people.map((p) => p.id)));
    }
  };

  const selectedEntries = people.filter((p) => selectedPeople.has(p.id));
  const slug = conferenceSlug.toUpperCase().replace(/\s+/g, '');

  // Preview data
  const preview = useMemo(() => {
    return selectedEntries.map((entry, i) => {
      const counter = counterStart + i;
      const vars: Record<string, string> = {
        ConferenceSlug: slug,
        FirstName: entry.first_name,
        LastName: entry.last_name,
        FullName: `${entry.first_name} ${entry.last_name}`,
        CompanyName: entry.company_name,
        Email: entry.email,
        Counter: String(counter).padStart(counterPadding, '0'),
      };
      return {
        code: resolveTemplate(codeTemplate, vars).toUpperCase().replace(/\s+/g, ''),
        description: resolveTemplate(descTemplate, vars),
        entry,
      };
    });
  }, [selectedEntries, codeTemplate, descTemplate, counterStart, counterPadding, slug]);

  const duplicateCodes = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const p of preview) {
      if (seen.has(p.code)) dupes.add(p.code);
      seen.add(p.code);
    }
    return dupes;
  }, [preview]);

  const canSubmit =
    selectedEntries.length > 0 &&
    descTemplate.trim() &&
    codeTemplate.trim() &&
    discountValue &&
    parseFloat(discountValue) > 0 &&
    duplicateCodes.size === 0;

  const handleSubmit = () => {
    if (!canSubmit) return;

    const effectiveCurrency = isCurrencyLocked ? conferenceCurrency : currency;

    const entries: BulkDiscountEntry[] = selectedEntries.map((p) => ({
      first_name: p.first_name,
      last_name: p.last_name,
      company_name: p.company_name,
      email: p.email,
    }));

    onSubmit({
      description_template: descTemplate,
      code_template: codeTemplate,
      discount_type: discountType,
      discount_value: parseFloat(discountValue),
      currency: discountType === 'fixed' && effectiveCurrency ? effectiveCurrency : null,
      start_date: startDate || null,
      end_date: endDate || null,
      max_uses: parseInt(maxUses) || 0,
      is_active: isActive,
      is_combinable: isCombinable,
      applicable_option_ids: applicableOptions.length > 0 ? applicableOptions : undefined,
      applicable_period_ids: applicablePeriods.length > 0 ? applicablePeriods : undefined,
      entries,
      counter_start: counterStart,
      counter_padding: counterPadding,
    });
  };

  const insertVar = (setter: React.Dispatch<React.SetStateAction<string>>, varName: string) => {
    setter((prev) => prev + `[${varName}]`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 1 ? 'Generate Bulk Discount Codes' : 'Preview & Confirm'}
      size="max-w-3xl"
    >
      {step === 1 ? (
        <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Source selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              People Source
            </label>
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  { value: 'sponsors', label: 'Sponsors' },
                  { value: 'speakers', label: 'Speakers' },
                  { value: 'committee', label: 'Program Committee' },
                  { value: 'recipient_list', label: 'Recipient List' },
                ] as const
              ).map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSource(s.value)}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    source === s.value
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recipient list picker */}
          {source === 'recipient_list' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Select List
              </label>
              <select
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
                className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Choose a recipient list...</option>
                {(recipientLists || []).map((rl) => (
                  <option key={rl.id} value={rl.id}>
                    {rl.name} ({rl.member_count} members)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* People selection */}
          {people.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select People ({selectedPeople.size}/{people.length})
                </label>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  {selectedPeople.size === people.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-md p-2 bg-gray-50 dark:bg-gray-900 max-h-48 overflow-y-auto space-y-1">
                {people.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-2 py-1 text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-white dark:hover:bg-gray-800 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPeople.has(p.id)}
                      onChange={() => togglePerson(p.id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="font-medium">
                      {p.first_name} {p.last_name}
                    </span>
                    {p.company_name && (
                      <span className="text-gray-400 dark:text-gray-500">— {p.company_name}</span>
                    )}
                    {p.email && (
                      <span className="text-gray-400 dark:text-gray-500 text-xs ml-auto">
                        {p.email}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {people.length === 0 && source !== 'recipient_list' && (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No people found for this source.
            </p>
          )}

          {/* Template fields */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description Template
              </label>
              <input
                type="text"
                value={descTemplate}
                onChange={(e) => setDescTemplate(e.target.value)}
                className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {TEMPLATE_VARS.map((v) => (
                  <button
                    key={v.label}
                    type="button"
                    onClick={() => insertVar(setDescTemplate, v.label)}
                    className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 font-mono"
                    title={v.example}
                  >
                    [{v.label}]
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Code Template
              </label>
              <input
                type="text"
                value={codeTemplate}
                onChange={(e) => setCodeTemplate(e.target.value)}
                className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm font-mono dark:bg-gray-800 dark:text-gray-100"
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {TEMPLATE_VARS.map((v) => (
                  <button
                    key={v.label}
                    type="button"
                    onClick={() => insertVar(setCodeTemplate, v.label)}
                    className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 font-mono"
                    title={v.example}
                  >
                    [{v.label}]
                  </button>
                ))}
              </div>
              {duplicateCodes.size > 0 && selectedEntries.length > 0 && (
                <div className="mt-1.5 p-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 rounded-md text-xs text-amber-700 dark:text-amber-300">
                  <p>
                    {duplicateCodes.size} duplicate code{duplicateCodes.size !== 1 ? 's' : ''}{' '}
                    detected after resolving variables:{' '}
                    <span className="font-mono font-medium">
                      {[...duplicateCodes].slice(0, 5).join(', ')}
                      {duplicateCodes.size > 5 && ', ...'}
                    </span>
                  </p>
                  {!codeTemplate.includes('[Counter]') && (
                    <p className="mt-1">
                      Add{' '}
                      <button
                        type="button"
                        onClick={() => insertVar(setCodeTemplate, 'Counter')}
                        className="font-mono underline hover:text-amber-900"
                      >
                        [Counter]
                      </button>{' '}
                      to your template to make each code unique.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Counter Start
                </label>
                <input
                  type="number"
                  min="0"
                  value={counterStart}
                  onChange={(e) => setCounterStart(parseInt(e.target.value) || 0)}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Zero-padding
                </label>
                <input
                  type="number"
                  min="1"
                  max="6"
                  value={counterPadding}
                  onChange={(e) => setCounterPadding(parseInt(e.target.value) || 3)}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Shared discount settings */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Discount Settings
            </h4>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Type
                </label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as 'fixed' | 'percentage')}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Value *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={discountType === 'percentage' ? '100' : undefined}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              {discountType === 'fixed' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Currency
                  </label>
                  {isCurrencyLocked ? (
                    <input
                      type="text"
                      value={conferenceCurrency || ''}
                      disabled
                      className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-sm text-gray-600 dark:text-gray-300"
                    />
                  ) : (
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
                    >
                      <option value="">Select...</option>
                      {(currencyOptions || []).map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (endDate && e.target.value && endDate < e.target.value)
                      setEndDate(e.target.value);
                  }}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Max Uses (0=∞)
                </label>
                <input
                  type="number"
                  min="0"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="flex gap-6">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCombinable}
                  onChange={(e) => setIsCombinable(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Combinable
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Active
              </label>
            </div>

            {bookingOptions.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Applies to Options
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {bookingOptions.map((opt) => (
                    <label
                      key={opt.id}
                      className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={applicableOptions.includes(opt.id)}
                        onChange={() =>
                          setApplicableOptions((prev) =>
                            prev.includes(opt.id)
                              ? prev.filter((x) => x !== opt.id)
                              : [...prev, opt.id]
                          )
                        }
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      {opt.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {bookingPeriods.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Applies to Periods
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {bookingPeriods.map((per) => (
                    <label
                      key={per.id}
                      className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={applicablePeriods.includes(per.id)}
                        onChange={() =>
                          setApplicablePeriods((prev) =>
                            prev.includes(per.id)
                              ? prev.filter((x) => x !== per.id)
                              : [...prev, per.id]
                          )
                        }
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      {per.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Step 2: Preview */
        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            {preview.length} discount code{preview.length !== 1 ? 's' : ''} will be created:
          </p>
          {duplicateCodes.size > 0 && (
            <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
              Duplicate codes detected! Adjust your template or selection.
            </div>
          )}
          <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                    #
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Code
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Description
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Person
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {preview.map((row, i) => (
                  <tr
                    key={i}
                    className={duplicateCodes.has(row.code) ? 'bg-red-50 dark:bg-red-900/30' : ''}
                  >
                    <td className="px-3 py-1.5 text-gray-400 dark:text-gray-500">{i + 1}</td>
                    <td className="px-3 py-1.5 font-mono font-medium text-gray-900 dark:text-gray-100">
                      {row.code}
                    </td>
                    <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">
                      {row.description}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">
                      {row.entry.first_name} {row.entry.last_name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      {error && (
        <div className="px-6 py-2">
          <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        </div>
      )}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-between">
        {step === 2 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Back
          </button>
        ) : (
          <div />
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          {step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canSubmit}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Preview ({selectedEntries.length})
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={duplicateCodes.size > 0 || isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Creating...' : `Create ${preview.length} Codes`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
