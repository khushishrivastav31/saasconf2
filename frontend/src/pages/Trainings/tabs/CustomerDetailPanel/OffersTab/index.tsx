import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { useToast } from '../../../../../components/Toast';
import { parseApiError } from '../../../../../utils/apiError';
import { queryKeys } from '../../../../../config/queryKeys';
import { usePlatformCurrencies } from '../../../../../hooks/api/usePlatformCurrencies';
import type { CustomerOffer, AvailablePlacement } from '../../../../../types/training';
import OfferDocumentsSection from '../../OfferDocumentsSection';
import OfferInvoiceForm from '../../OfferInvoiceForm';
import RichTextEditor from '../../../../../components/common/RichTextEditor';
import OfferRow from './OfferRow';
import PlacementRowWithAttendees from './PlacementRowWithAttendees';
import { STATUS_COLORS, PLACEMENT_TYPE_COLORS } from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OfferForm {
  attendees: number | null;
  training_price: number | null;
  certification_price: number | null;
  currency: string;
  status: 'draft' | 'sent' | 'rejected' | 'accepted';
  comments: string | null;
  notes: string | null;
  po_number: string | null;
}

interface CreateOfferForm {
  placement_ids: string[];
  attendees: number | null;
  training_price: number | null;
  certification_price: number | null;
  currency: string;
  comments: string | null;
  notes: string | null;
  po_number: string | null;
}

// ---------------------------------------------------------------------------
// OffersTab — main component (list / create / detail views)
// ---------------------------------------------------------------------------

function OffersTab({
  customerId,
  customerName,
  initialOfferId,
  contactPersons,
}: {
  customerId: string;
  customerName: string;
  initialOfferId?: string;
  contactPersons: Array<{ first_name: string; last_name: string; email: string; phone?: string }>;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: currencies = [] } = usePlatformCurrencies();

  const [selectedOffer, setSelectedOffer] = useState<CustomerOffer | null>(null);
  const [initialOfferHandled, setInitialOfferHandled] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [offerType, setOfferType] = useState<'inhouse' | 'open' | null>(null);
  const [editForm, setEditForm] = useState<OfferForm | null>(null);
  const [showAddPlacements, setShowAddPlacements] = useState(false);
  const [showOfferInvoiceForm, setShowOfferInvoiceForm] = useState(false);
  const [addPlacementIds, setAddPlacementIds] = useState<string[]>([]);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [confirmDeleteOffer, setConfirmDeleteOffer] = useState(false);
  const [placementSearch, setPlacementSearch] = useState('');

  const [createForm, setCreateForm] = useState<CreateOfferForm>({
    placement_ids: [],
    attendees: null,
    training_price: null,
    certification_price: null,
    currency: 'EUR',
    comments: null,
    notes: null,
    po_number: null,
  });

  // Fetch offers
  const { data: offersData, isLoading } = useQuery<CustomerOffer[]>({
    queryKey: queryKeys.customerOffers(customerId),
    queryFn: async () => {
      const res = await api.get(`/trainings/offers?customer_id=${customerId}`);
      return res.data.items ?? res.data;
    },
  });
  const offers = useMemo(() => offersData ?? [], [offersData]);

  // Determine offer type: from offerType state when creating, or from offer's stored offer_type
  const placementTypeFilter = showCreate
    ? (offerType ?? undefined)
    : showAddPlacements && selectedOffer
      ? selectedOffer.offer_type
      : undefined;
  const { data: availableData } = useQuery<AvailablePlacement[]>({
    queryKey: queryKeys.availablePlacements(placementTypeFilter),
    queryFn: async () => {
      const params = placementTypeFilter ? `?type=${placementTypeFilter}` : '';
      const res = await api.get(`/trainings/offers/available-placements${params}`);
      return res.data;
    },
    staleTime: 10_000,
  });
  const availablePlacements = useMemo(() => availableData ?? [], [availableData]);

  // Group available placements by year, filtered by search
  const placementsByYear = useMemo(() => {
    const searchLower = placementSearch.toLowerCase().trim();
    const filtered = searchLower
      ? availablePlacements.filter(
          (p) =>
            p.training_name.toLowerCase().includes(searchLower) ||
            (p.training_slug?.toLowerCase().includes(searchLower) ?? false) ||
            (p.location_name?.toLowerCase().includes(searchLower) ?? false) ||
            p.start_date.includes(searchLower) ||
            new Date(p.start_date).toLocaleDateString('de-DE').includes(searchLower)
        )
      : availablePlacements;
    const grouped: Record<number, AvailablePlacement[]> = {};
    for (const p of filtered) {
      if (!grouped[p.program_year]) grouped[p.program_year] = [];
      grouped[p.program_year].push(p);
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, placements]) => ({ year: Number(year), placements }));
  }, [availablePlacements, placementSearch]);

  const invalidateOffers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.customerOffers(customerId) });
    queryClient.invalidateQueries({ queryKey: ['available-placements'] });
  }, [queryClient, customerId]);

  // Keep selectedOffer in sync with refetched data
  React.useEffect(() => {
    if (selectedOffer && offers.length > 0) {
      const fresh = offers.find((o) => o.id === selectedOffer.id);
      if (fresh) {
        setSelectedOffer(fresh);
      } else {
        setSelectedOffer(null);
        setEditForm(null);
      }
    }
  }, [offers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Select offer and init edit form
  const handleSelectOffer = useCallback((offer: CustomerOffer) => {
    setSelectedOffer(offer);
    setEditForm({
      attendees: offer.attendees,
      training_price: offer.training_price,
      certification_price: offer.certification_price,
      currency: offer.currency,
      status: offer.status,
      comments: offer.comments,
      notes: offer.notes,
      po_number: offer.po_number,
    });
    setShowCreate(false);
  }, []);

  // Auto-select offer from deep link
  React.useEffect(() => {
    if (initialOfferId && !initialOfferHandled && offers.length > 0) {
      const target = offers.find((o) => o.id === initialOfferId);
      if (target) {
        handleSelectOffer(target);
      }
      setInitialOfferHandled(true);
    }
  }, [initialOfferId, initialOfferHandled, offers, handleSelectOffer]);

  const handleBackToList = useCallback(() => {
    setSelectedOffer(null);
    setEditForm(null);
    setShowAddPlacements(false);
    setRemoveConfirm(null);
    setConfirmDeleteOffer(false);
  }, []);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/trainings/offers', {
        customer_id: customerId,
        offer_type: offerType ?? 'inhouse',
        placement_ids: createForm.placement_ids,
        attendees: createForm.attendees,
        training_price: createForm.training_price,
        certification_price: createForm.certification_price,
        currency: createForm.currency,
        comments: createForm.comments,
        notes: createForm.notes,
        po_number: createForm.po_number,
      });
      return res.data as CustomerOffer;
    },
    onSuccess: (newOffer) => {
      invalidateOffers();
      showToast('Offer created', 'success');
      setShowCreate(false);
      setOfferType(null);
      setCreateForm({
        placement_ids: [],
        attendees: null,
        training_price: null,
        certification_price: null,
        currency: 'EUR',
        comments: null,
        notes: null,
        po_number: null,
      });
      handleSelectOffer(newOffer);
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOffer || !editForm) return;
      const res = await api.put(`/trainings/offers/${selectedOffer.id}`, editForm);
      return res.data as CustomerOffer;
    },
    onSuccess: (updated) => {
      invalidateOffers();
      showToast('Offer updated', 'success');
      if (updated) handleSelectOffer(updated);
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  // Delete offer mutation
  const deleteOfferMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOffer) return;
      await api.delete(`/trainings/offers/${selectedOffer.id}`);
    },
    onSuccess: () => {
      invalidateOffers();
      showToast('Offer deleted', 'success');
      handleBackToList();
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  // Add placements mutation
  const addPlacementsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOffer) return;
      const res = await api.post(`/trainings/offers/${selectedOffer.id}/placements`, {
        placement_ids: addPlacementIds,
      });
      return res.data as CustomerOffer;
    },
    onSuccess: (updated) => {
      invalidateOffers();
      showToast('Trainings added', 'success');
      setShowAddPlacements(false);
      setAddPlacementIds([]);
      if (updated) handleSelectOffer(updated);
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  // Remove placement mutation
  const removePlacementMutation = useMutation({
    mutationFn: async ({
      placementId,
      deleteFromProgram,
    }: {
      placementId: string;
      deleteFromProgram: boolean;
    }) => {
      if (!selectedOffer) return;
      const res = await api.delete(
        `/trainings/offers/${selectedOffer.id}/placements/${placementId}?delete_from_program=${deleteFromProgram}`
      );
      return res.data as CustomerOffer;
    },
    onSuccess: () => {
      invalidateOffers();
      showToast('Training removed from offer', 'success');
      setRemoveConfirm(null);
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
      setRemoveConfirm(null);
    },
  });

  const inputClass =
    'block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100';

  // ---------- CREATE FORM ----------
  if (showCreate) {
    const createTitle =
      offerType === 'open' ? 'Create Open Training Offer' : 'Create Inhouse/Hybrid Offer';
    const placementLabel =
      offerType === 'open'
        ? 'Select Open Training Placements'
        : 'Select Trainings (Inhouse/Hybrid placements)';
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {createTitle}
          </h4>
          <button
            type="button"
            onClick={() => {
              setShowCreate(false);
              setOfferType(null);
            }}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Cancel
          </button>
        </div>

        {/* Placement selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {placementLabel}
          </label>
          {/* Search bar for placements */}
          <input
            type="text"
            placeholder="Search placements..."
            className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100 mb-2"
            value={placementSearch}
            onChange={(e) => setPlacementSearch(e.target.value)}
          />
          {placementsByYear.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No available placements found.
            </p>
          ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-60 overflow-y-auto">
              {placementsByYear.map(({ year, placements }) => (
                <div key={year}>
                  <div className="sticky top-0 px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                    {year}
                  </div>
                  {placements.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={createForm.placement_ids.includes(p.id)}
                        onChange={(e) => {
                          setCreateForm((prev) => ({
                            ...prev,
                            placement_ids: e.target.checked
                              ? [...prev.placement_ids, p.id]
                              : prev.placement_ids.filter((id) => id !== p.id),
                          }));
                        }}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {p.training_slug || p.training_name}
                        </span>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          {new Date(p.start_date).toLocaleDateString()}
                        </span>
                        {p.location_name && (
                          <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                            {p.location_name}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PLACEMENT_TYPE_COLORS[p.placement_type] || PLACEMENT_TYPE_COLORS.open}`}
                      >
                        {p.placement_type}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Attendees
            </label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={createForm.attendees ?? ''}
              onChange={(e) =>
                setCreateForm((prev) => ({
                  ...prev,
                  attendees: e.target.value ? Number(e.target.value) : null,
                }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Training Price
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              value={createForm.training_price ?? ''}
              onChange={(e) =>
                setCreateForm((prev) => ({
                  ...prev,
                  training_price: e.target.value ? Number(e.target.value) : null,
                }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Certification Price
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              value={createForm.certification_price ?? ''}
              onChange={(e) =>
                setCreateForm((prev) => ({
                  ...prev,
                  certification_price: e.target.value ? Number(e.target.value) : null,
                }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Currency
            </label>
            <select
              className={inputClass}
              value={createForm.currency}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, currency: e.target.value }))}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              PO Number
            </label>
            <input
              type="text"
              className={inputClass}
              value={createForm.po_number ?? ''}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, po_number: e.target.value || null }))
              }
              placeholder="Optional"
            />
          </div>
        </div>

        {/* Comments */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Comments
          </label>
          <RichTextEditor
            value={createForm.comments ?? ''}
            onChange={(html) => setCreateForm((prev) => ({ ...prev, comments: html || null }))}
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setShowCreate(false);
              setOfferType(null);
            }}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || createForm.placement_ids.length === 0}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Offer'}
          </button>
        </div>
      </div>
    );
  }

  // ---------- DETAIL VIEW ----------
  if (selectedOffer && editForm) {
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackToList}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              &larr; Back to list
            </button>
            <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {selectedOffer.offer_number}
            </h4>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[selectedOffer.status] || STATUS_COLORS.draft}`}
            >
              {selectedOffer.status}
            </span>
          </div>
        </div>

        {/* Assigned Placements */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Assigned Trainings ({selectedOffer.placements?.length ?? 0})
            </h5>
            <button
              type="button"
              onClick={() => {
                setShowAddPlacements(true);
                setAddPlacementIds([]);
              }}
              className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md px-2.5 py-1 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              + Add Training
            </button>
          </div>

          {(selectedOffer.placements?.length ?? 0) > 0 ? (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-6" />
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Training
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Location
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Type
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {(selectedOffer.placements ?? []).map((p) => (
                    <PlacementRowWithAttendees
                      key={p.id}
                      placement={p}
                      offerId={selectedOffer.id}
                      offerAttendeeLimit={selectedOffer.attendees}
                      totalAttendeeCount={selectedOffer.attendee_count ?? 0}
                      onRemove={() => setRemoveConfirm(p.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              No trainings assigned yet.
            </p>
          )}
        </div>

        {/* Add placements picker */}
        {showAddPlacements && (
          <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50/50 dark:bg-blue-900/20">
            <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
              Add Trainings to Offer
            </h5>
            {placementsByYear.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No available placements found.
              </p>
            ) : (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-48 overflow-y-auto bg-white dark:bg-gray-800">
                {placementsByYear.map(({ year, placements }) => {
                  const existingIds = new Set((selectedOffer.placements ?? []).map((p) => p.id));
                  const filtered = placements.filter((p) => !existingIds.has(p.id));
                  if (filtered.length === 0) return null;
                  return (
                    <div key={year}>
                      <div className="sticky top-0 px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                        {year}
                      </div>
                      {filtered.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={addPlacementIds.includes(p.id)}
                            onChange={(e) => {
                              setAddPlacementIds((prev) =>
                                e.target.checked
                                  ? [...prev, p.id]
                                  : prev.filter((id) => id !== p.id)
                              );
                            }}
                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {p.training_slug || p.training_name}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(p.start_date).toLocaleDateString()}
                          </span>
                          {p.location_name && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {p.location_name}
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PLACEMENT_TYPE_COLORS[p.placement_type] || PLACEMENT_TYPE_COLORS.open}`}
                          >
                            {p.placement_type}
                          </span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddPlacements(false);
                  setAddPlacementIds([]);
                }}
                className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => addPlacementsMutation.mutate()}
                disabled={addPlacementIds.length === 0 || addPlacementsMutation.isPending}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addPlacementsMutation.isPending ? 'Adding...' : `Add (${addPlacementIds.length})`}
              </button>
            </div>
          </div>
        )}

        {/* Documents */}
        <OfferDocumentsSection
          offerId={selectedOffer.id}
          offerNumber={selectedOffer.offer_number}
          customerName={customerName}
          contactPersons={contactPersons}
        />

        {/* Pricing */}
        <div>
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pricing</h5>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Attendees
              </label>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={editForm.attendees ?? ''}
                onChange={(e) =>
                  setEditForm((prev) =>
                    prev
                      ? { ...prev, attendees: e.target.value ? Number(e.target.value) : null }
                      : prev
                  )
                }
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Training Price
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                value={editForm.training_price ?? ''}
                onChange={(e) =>
                  setEditForm((prev) =>
                    prev
                      ? { ...prev, training_price: e.target.value ? Number(e.target.value) : null }
                      : prev
                  )
                }
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Certification Price
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                value={editForm.certification_price ?? ''}
                onChange={(e) =>
                  setEditForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          certification_price: e.target.value ? Number(e.target.value) : null,
                        }
                      : prev
                  )
                }
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Currency
              </label>
              <select
                className={inputClass}
                value={editForm.currency}
                onChange={(e) =>
                  setEditForm((prev) => (prev ? { ...prev, currency: e.target.value } : prev))
                }
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* PO Number + Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              PO Number
            </label>
            <input
              type="text"
              className={inputClass}
              value={editForm.po_number ?? ''}
              onChange={(e) =>
                setEditForm((prev) =>
                  prev ? { ...prev, po_number: e.target.value || null } : prev
                )
              }
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            {editForm.status === 'draft' ? (
              <span className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                Draft — send a quote to change status
              </span>
            ) : (
              <select
                className={inputClass}
                value={editForm.status}
                onChange={(e) =>
                  setEditForm((prev) =>
                    prev ? { ...prev, status: e.target.value as OfferForm['status'] } : prev
                  )
                }
              >
                <option value="sent">Sent</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
            )}
          </div>
        </div>

        {/* Comments */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Comments
          </label>
          <RichTextEditor
            value={editForm.comments ?? ''}
            onChange={(html) =>
              setEditForm((prev) => (prev ? { ...prev, comments: html || null } : prev))
            }
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setConfirmDeleteOffer(true)}
            className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 border border-red-200 dark:border-red-800 rounded-md transition-colors"
          >
            Delete Offer
          </button>
          <div className="flex items-center gap-2">
            {editForm.status === 'accepted' && (
              <button
                type="button"
                onClick={() => setShowOfferInvoiceForm(true)}
                className="px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700 rounded-md hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              >
                Create Invoice
              </button>
            )}
            <button
              type="button"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Remove placement confirm dialog */}
        {removeConfirm &&
          (() => {
            const removePlacement = (selectedOffer.placements ?? []).find(
              (p) => p.id === removeConfirm
            );
            const isOpen = removePlacement?.placement_type === 'open';
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Remove from offer?
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                    {isOpen
                      ? 'This open training will be removed from the offer but stays in the program.'
                      : 'Also delete this placement from the program?'}
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setRemoveConfirm(null)}
                      className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        removePlacementMutation.mutate({
                          placementId: removeConfirm,
                          deleteFromProgram: false,
                        })
                      }
                      disabled={removePlacementMutation.isPending}
                      className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isOpen ? 'Remove' : 'Remove only'}
                    </button>
                    {!isOpen && (
                      <button
                        type="button"
                        onClick={() =>
                          removePlacementMutation.mutate({
                            placementId: removeConfirm,
                            deleteFromProgram: true,
                          })
                        }
                        disabled={removePlacementMutation.isPending}
                        className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                      >
                        Remove &amp; delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

        {/* Create Invoice from Offer */}
        {showOfferInvoiceForm && selectedOffer && (
          <OfferInvoiceForm
            offerId={selectedOffer.id}
            onClose={() => setShowOfferInvoiceForm(false)}
            onCreated={() => {
              setShowOfferInvoiceForm(false);
              invalidateOffers();
            }}
          />
        )}

        {/* Delete offer confirm dialog */}
        {confirmDeleteOffer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Delete Offer?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                This will permanently delete offer &quot;{selectedOffer.offer_number}&quot;. This
                action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOffer(false)}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteOfferMutation.mutate()}
                  disabled={deleteOfferMutation.isPending}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteOfferMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- LIST VIEW ----------
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">Offers</h4>
          {offers.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              {offers.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setOfferType('inhouse');
              setShowCreate(true);
              setCreateForm((prev) => ({ ...prev, placement_ids: [] }));
            }}
            className="px-3 py-1.5 text-sm font-medium text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-md hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors"
          >
            + Inhouse/Hybrid Offer
          </button>
          <button
            type="button"
            onClick={() => {
              setOfferType('open');
              setShowCreate(true);
              setCreateForm((prev) => ({ ...prev, placement_ids: [] }));
            }}
            className="px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
          >
            + Open Training Offer
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
      ) : offers.length > 0 ? (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Offer Number
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Trainings
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Training Price
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Cert. Price
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {offers.map((offer) => (
                <OfferRow key={offer.id} offer={offer} onClick={handleSelectOffer} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          No offers yet. Create one to get started.
        </div>
      )}
    </div>
  );
}

export default OffersTab;
