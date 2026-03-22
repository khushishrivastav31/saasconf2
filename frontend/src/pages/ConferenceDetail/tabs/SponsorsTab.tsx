import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { queryKeys } from '../../../config/queryKeys';
import { validatePhone, normalizeUrl } from '../../../utils/validators';
import VatNumberInput from '../../../components/common/VatNumberInput';
import { COUNTRIES_BY_CONTINENT } from '../../../config/countries';
import type {
  Conference,
  Sponsor,
  SponsorCreate,
  SponsorUpdate,
  SponsorPackage,
  PlatformCurrency,
  LocationContactPerson,
  PaginatedResponse,
} from '../../../types';
import { parseApiError } from '../../../utils/apiError';
import SponsorDetailPanel from '../../../components/SponsorDetailPanel';
import ConfirmDialog from '../../../components/ConfirmDialog';
import RichTextEditor from '../../../components/common/RichTextEditor';
import ContactPersonList from '../../../components/ContactPersonList';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { ChevronLeftIcon, DeleteIcon, DeactivateIcon } from '../icons';
import { useSelection } from '../SelectionContext';

function ConferenceSponsorsTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const { selectedSponsorId, setSelectedSponsorId } = useSelection();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sponsor | null>(null);

  const emptyCreateForm: SponsorCreate = {
    company_name: '',
    sponsor_package_id: undefined,
    price: undefined,
    currency: conference.currency || '',
    phone: '',
    website: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
    vat_number: '',
    comments: '',
    contact_persons: [],
    is_active: true,
  };

  // Form state for create
  const [createForm, setCreateForm] = useState<SponsorCreate>(emptyCreateForm);
  const [createPhoneError, setCreatePhoneError] = useState<string | null>(null);
  const [createNewContact, setCreateNewContact] = useState<LocationContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    comment: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.sponsors.byConference(conference.id),
    queryFn: async () => {
      const response = await api.get<{
        items: Sponsor[];
        total: number;
      }>(`/conferences/${conference.id}/sponsors`);
      return response.data;
    },
  });

  // Sponsor packages for dropdowns
  const { data: sponsorPackagesData } = useQuery({
    queryKey: queryKeys.sponsors.packages(conference.id),
    queryFn: async () => {
      const response = await api.get<{
        items: SponsorPackage[];
        total: number;
      }>(`/conferences/${conference.id}/settings/sponsor-packages`);
      return response.data;
    },
  });

  // Platform currencies for dropdowns
  const { data: currenciesData } = useQuery({
    queryKey: queryKeys.settings.platformCurrencies,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        '/admin/settings/currencies',
        { params: { page_size: 100, is_active: true } }
      );
      return response.data.items;
    },
  });

  const selectedSponsor = data?.items?.find((s) => s.id === selectedSponsorId);

  const createMutation = useMutation({
    mutationFn: async (sponsorData: SponsorCreate) => {
      const response = await api.post<Sponsor>(
        `/conferences/${conference.id}/sponsors`,
        sponsorData
      );
      return response.data;
    },
    onSuccess: (newSponsor) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sponsors.byConference(conference.id),
      });
      setIsAdding(false);
      setCreateForm(emptyCreateForm);
      setCreatePhoneError(null);
      setCreateNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
      setError(null);
      setSelectedSponsorId(newSponsor.id);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create sponsor'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: sponsorData }: { id: string; data: SponsorUpdate }) => {
      const response = await api.put<Sponsor>(
        `/conferences/${conference.id}/sponsors/${id}`,
        sponsorData
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sponsors.byConference(conference.id),
      });
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update sponsor'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conference.id}/sponsors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sponsors.byConference(conference.id),
      });
      setSelectedSponsorId(null);
      setDeleteTarget(null);
    },
    onError: (err: unknown) => {
      setDeleteTarget(null);
      setError(parseApiError(err, 'Failed to delete sponsor'));
    },
  });

  const handleCreatePackageChange = (packageId: string) => {
    if (!packageId) {
      // No package - use conference default currency
      setCreateForm({
        ...createForm,
        sponsor_package_id: undefined,
        currency: conference.currency || '',
      });
      return;
    }
    const pkg = (sponsorPackagesData?.items || []).find((p) => p.id === packageId);
    if (pkg) {
      const updates: Partial<SponsorCreate> = {
        sponsor_package_id: pkg.id,
        // Always use package currency (or fall back to conference default)
        currency: pkg.currency || conference.currency || '',
      };
      if (!createForm.price && pkg.price != null) {
        updates.price = pkg.price;
      }
      setCreateForm({ ...createForm, ...updates });
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createPhoneError) return;
    const finalData = { ...createForm };
    if (createNewContact.first_name.trim() && createNewContact.last_name.trim()) {
      finalData.contact_persons = [...(finalData.contact_persons || []), { ...createNewContact }];
    }
    // Derive currency from package (or use conference default)
    const pkg = (sponsorPackagesData?.items || []).find(
      (p) => p.id === finalData.sponsor_package_id
    );
    finalData.currency = pkg?.currency || conference.currency || '';
    createMutation.mutate(finalData);
  };

  const addCreateContact = () => {
    if (createNewContact.first_name.trim() && createNewContact.last_name.trim()) {
      setCreateForm({
        ...createForm,
        contact_persons: [...(createForm.contact_persons || []), { ...createNewContact }],
      });
      setCreateNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
    }
  };

  const removeCreateContact = (index: number) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateCreateContact = (index: number, contact: LocationContactPerson) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons?.map((c, i) => (i === index ? contact : c)) || [],
    });
  };

  const sponsorCount = data?.items?.length || 0;

  return (
    <div>
      {/* === DETAIL PANEL VIEW === */}
      {selectedSponsor ? (
        <>
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setSelectedSponsorId(null)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <ChevronLeftIcon />
              Back to sponsors list
            </button>
          </div>

          <ErrorBanner message={error} />

          <SponsorDetailPanel
            sponsor={selectedSponsor}
            sponsorPackages={sponsorPackagesData?.items || []}
            currencies={currenciesData || []}
            defaultCurrency={conference.currency || undefined}
            conferenceId={conference.id}
            onSave={async (sponsorData) => {
              await updateMutation.mutateAsync({
                id: selectedSponsor.id,
                data: sponsorData,
              });
            }}
            onDelete={selectedSponsor.has_invoices ? undefined : (id) => deleteMutation.mutate(id)}
            onDeactivate={
              selectedSponsor.has_invoices && selectedSponsor.is_active
                ? () =>
                    updateMutation.mutate({
                      id: selectedSponsor.id,
                      data: { is_active: false },
                    })
                : undefined
            }
          />
        </>
      ) : (
        <>
          {/* === TABLE LIST VIEW === */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Sponsors
                {sponsorCount > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                    {sponsorCount}
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Manage sponsors for this conference.
              </p>
            </div>
            {isAdmin && !isAdding && (
              <button
                type="button"
                onClick={() => {
                  setIsAdding(true);
                  setError(null);
                }}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
              >
                + Add Sponsor
              </button>
            )}
          </div>

          <ErrorBanner message={error} />

          {/* Create form */}
          {isAdding && (
            <form
              onSubmit={handleCreateSubmit}
              className="mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4"
            >
              <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">New Sponsor</h5>

              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={createForm.company_name}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      company_name: e.target.value,
                    })
                  }
                />
              </div>

              {/* Package + Active */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Sponsor Package
                  </label>
                  <select
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.sponsor_package_id || ''}
                    onChange={(e) => handleCreatePackageChange(e.target.value)}
                  >
                    <option value="">-- No Package --</option>
                    {(sponsorPackagesData?.items || []).map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={createForm.is_active ?? true}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          is_active: e.target.checked,
                        })
                      }
                      className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-medium">Visible</span>
                      <span className="text-gray-500 dark:text-gray-400 ml-1">
                        (show on website)
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Price + Currency */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.price ?? ''}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        price: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Currency
                  </label>
                  <div className="block w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-md py-2 px-3 text-sm text-gray-700 dark:text-gray-300">
                    {(() => {
                      const pkg = (sponsorPackagesData?.items || []).find(
                        (p) => p.id === createForm.sponsor_package_id
                      );
                      const currencyCode = pkg?.currency || conference.currency;
                      if (!currencyCode) return '—';
                      const currency = (currenciesData || []).find((c) => c.code === currencyCode);
                      return currency ? `${currency.code} - ${currency.name}` : currencyCode;
                    })()}
                  </div>
                </div>
              </div>

              {/* Phone + Website */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    className={`block w-full border rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${createPhoneError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
                    value={createForm.phone || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCreateForm({
                        ...createForm,
                        phone: value,
                      });
                      setCreatePhoneError(validatePhone(value));
                    }}
                    placeholder="+491234545 or 00491234566"
                  />
                  {createPhoneError && (
                    <p className="mt-1 text-xs text-red-600">{createPhoneError}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Website
                  </label>
                  <input
                    type="text"
                    placeholder="example.com"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.website || ''}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        website: e.target.value,
                      })
                    }
                    onBlur={(e) =>
                      setCreateForm({
                        ...createForm,
                        website: normalizeUrl(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              {/* Address */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.address_line1 || ''}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        address_line1: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Address Line 2
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.address_line2 || ''}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        address_line2: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              {/* City, State, Postal Code, Country */}
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.city || ''}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        city: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.state || ''}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        state: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.postal_code || ''}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        postal_code: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Country
                  </label>
                  <select
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.country || ''}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        country: e.target.value,
                      })
                    }
                  >
                    <option value="">Select a country</option>
                    {COUNTRIES_BY_CONTINENT.map((group) => (
                      <optgroup key={group.continent} label={group.continent}>
                        {group.countries.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              {/* VAT Number */}
              <VatNumberInput
                value={createForm.vat_number || ''}
                onChange={(val) => setCreateForm({ ...createForm, vat_number: val })}
                country={createForm.country || undefined}
                placeholder="e.g., DE123456789"
              />

              {/* Comments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Comments
                </label>
                <RichTextEditor
                  value={createForm.comments || ''}
                  onChange={(html) =>
                    setCreateForm({
                      ...createForm,
                      comments: html,
                    })
                  }
                  rows={2}
                />
              </div>

              {/* Contact Persons */}
              <ContactPersonList
                contacts={createForm.contact_persons || []}
                newContact={createNewContact}
                setNewContact={setCreateNewContact}
                addContact={addCreateContact}
                removeContact={removeCreateContact}
                updateContact={updateCreateContact}
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={createMutation.isPending || !!createPhoneError}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setError(null);
                    setCreateForm(emptyCreateForm);
                    setCreatePhoneError(null);
                    setCreateNewContact({
                      first_name: '',
                      last_name: '',
                      email: '',
                      phone: '',
                      comment: '',
                    });
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Sponsors table */}
          {isLoading ? (
            <LoadingSpinner />
          ) : data?.items && data.items.length > 0 ? (
            <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Company Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Package
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      City
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Visible
                    </th>
                    {isAdmin && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {data.items.map((sponsor) => (
                    <tr
                      key={sponsor.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      onClick={() => setSelectedSponsorId(sponsor.id)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {sponsor.company_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {sponsor.sponsor_package_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {sponsor.price != null
                          ? `${sponsor.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${sponsor.currency ? ` ${sponsor.currency}` : ''}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {sponsor.city || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            sponsor.is_active
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {sponsor.is_active ? 'Yes' : 'No'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-2">
                            {sponsor.has_invoices ? (
                              <button
                                type="button"
                                onClick={() =>
                                  updateMutation.mutate({
                                    id: sponsor.id,
                                    data: { is_active: false },
                                  })
                                }
                                disabled={updateMutation.isPending || !sponsor.is_active}
                                className="group relative text-gray-400 dark:text-gray-500 hover:text-amber-500 p-1 rounded transition-colors disabled:opacity-50"
                                title={
                                  sponsor.is_active
                                    ? 'Deactivate (has invoices)'
                                    : 'Already deactivated'
                                }
                              >
                                <DeactivateIcon />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                                  {sponsor.is_active
                                    ? 'Deactivate (has invoices)'
                                    : 'Already deactivated'}
                                </span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(sponsor)}
                                disabled={deleteMutation.isPending}
                                className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                                title="Delete"
                                aria-label="Delete"
                              >
                                <DeleteIcon />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !isAdding && (
              <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                No sponsors yet. Click "+ Add Sponsor" to get started.
              </div>
            )
          )}
        </>
      )}

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Sponsor"
        message={`Are you sure you want to delete "${deleteTarget?.company_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default ConferenceSponsorsTab;
