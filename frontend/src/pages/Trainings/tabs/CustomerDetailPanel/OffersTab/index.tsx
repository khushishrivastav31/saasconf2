import { useCallback, useEffect, useState } from 'react';
import { usePlatformCurrencies } from '../../../../../hooks/api/usePlatformCurrencies';
import type { CustomerOffer } from '../../../../../types/training';
import OfferInvoiceForm from '../../OfferInvoiceForm';
import OffersListView from './OffersListView';
import CreateOfferView from './CreateOfferView';
import OfferDetailView from './OfferDetailView';
import RemovePlacementDialog from './RemovePlacementDialog';
import DeleteOfferDialog from './DeleteOfferDialog';
import { useOffersData } from './useOffersData';
import { useOffersMutations } from './useOffersMutations';
import type { ContactPerson, CreateOfferForm, OfferForm, OfferType } from './types';

const EMPTY_CREATE_FORM: CreateOfferForm = {
  placement_ids: [],
  attendees: null,
  training_price: null,
  certification_price: null,
  currency: 'EUR',
  comments: null,
  notes: null,
  po_number: null,
};

interface Props {
  customerId: string;
  customerName: string;
  initialOfferId?: string;
  contactPersons: ContactPerson[];
}

function OffersTab({ customerId, customerName, initialOfferId, contactPersons }: Props) {
  const { data: currencies = [] } = usePlatformCurrencies();

  const [selectedOffer, setSelectedOffer] = useState<CustomerOffer | null>(null);
  const [initialOfferHandled, setInitialOfferHandled] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [offerType, setOfferType] = useState<OfferType | null>(null);
  const [editForm, setEditForm] = useState<OfferForm | null>(null);
  const [createForm, setCreateForm] = useState<CreateOfferForm>(EMPTY_CREATE_FORM);
  const [showAddPlacements, setShowAddPlacements] = useState(false);
  const [showOfferInvoiceForm, setShowOfferInvoiceForm] = useState(false);
  const [addPlacementIds, setAddPlacementIds] = useState<string[]>([]);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [confirmDeleteOffer, setConfirmDeleteOffer] = useState(false);
  const [placementSearch, setPlacementSearch] = useState('');

  const placementTypeFilter: OfferType | undefined = showCreate
    ? (offerType ?? undefined)
    : showAddPlacements && selectedOffer
      ? (selectedOffer.offer_type as OfferType)
      : undefined;

  const { offersQuery, offers, placementsByYear } = useOffersData({
    customerId,
    placementTypeFilter,
    placementSearch,
  });

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

  const handleBackToList = useCallback(() => {
    setSelectedOffer(null);
    setEditForm(null);
    setShowAddPlacements(false);
    setRemoveConfirm(null);
    setConfirmDeleteOffer(false);
  }, []);

  const mutations = useOffersMutations({
    customerId,
    onOfferCreated: (newOffer) => {
      setShowCreate(false);
      setOfferType(null);
      setCreateForm(EMPTY_CREATE_FORM);
      handleSelectOffer(newOffer);
    },
    onOfferUpdated: (updated) => handleSelectOffer(updated),
    onOfferDeleted: handleBackToList,
    onPlacementsAdded: (updated) => {
      setShowAddPlacements(false);
      setAddPlacementIds([]);
      handleSelectOffer(updated);
    },
    onPlacementRemoved: () => setRemoveConfirm(null),
    onPlacementRemoveError: () => setRemoveConfirm(null),
  });

  // Keep selectedOffer in sync with refetched data
  useEffect(() => {
    if (selectedOffer && offers.length > 0) {
      const fresh = offers.find((o) => o.id === selectedOffer.id);
      if (fresh) {
        setSelectedOffer(fresh);
      } else {
        setSelectedOffer(null);
        setEditForm(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers]);

  // Auto-select offer from deep link
  useEffect(() => {
    if (initialOfferId && !initialOfferHandled && offers.length > 0) {
      const target = offers.find((o) => o.id === initialOfferId);
      if (target) handleSelectOffer(target);
      setInitialOfferHandled(true);
    }
  }, [initialOfferId, initialOfferHandled, offers, handleSelectOffer]);

  const handleCreateClick = (type: OfferType) => {
    setOfferType(type);
    setShowCreate(true);
    setCreateForm({ ...EMPTY_CREATE_FORM });
  };

  const handleCancelCreate = () => {
    setShowCreate(false);
    setOfferType(null);
  };

  const handleToggleAddPlacement = (id: string, checked: boolean) => {
    setAddPlacementIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  // CREATE view
  if (showCreate && offerType) {
    return (
      <CreateOfferView
        offerType={offerType}
        form={createForm}
        onFormChange={setCreateForm}
        placementsByYear={placementsByYear}
        placementSearch={placementSearch}
        onPlacementSearchChange={setPlacementSearch}
        currencies={currencies}
        onCancel={handleCancelCreate}
        onSubmit={() => mutations.createOffer.mutate({ offerType, form: createForm })}
        isPending={mutations.createOffer.isPending}
      />
    );
  }

  // DETAIL view
  if (selectedOffer && editForm) {
    const removePlacement = removeConfirm
      ? (selectedOffer.placements ?? []).find((p) => p.id === removeConfirm)
      : null;

    return (
      <>
        <OfferDetailView
          offer={selectedOffer}
          form={editForm}
          onFormChange={setEditForm}
          customerName={customerName}
          contactPersons={contactPersons}
          currencies={currencies}
          showAddPlacements={showAddPlacements}
          onShowAddPlacements={() => {
            setShowAddPlacements(true);
            setAddPlacementIds([]);
          }}
          onHideAddPlacements={() => {
            setShowAddPlacements(false);
            setAddPlacementIds([]);
          }}
          placementsByYear={placementsByYear}
          addPlacementIds={addPlacementIds}
          onTogglePlacement={handleToggleAddPlacement}
          onConfirmAddPlacements={() =>
            mutations.addPlacements.mutate({
              offerId: selectedOffer.id,
              placementIds: addPlacementIds,
            })
          }
          isAddPending={mutations.addPlacements.isPending}
          onBack={handleBackToList}
          onRemovePlacement={setRemoveConfirm}
          onSave={() => mutations.updateOffer.mutate({ offerId: selectedOffer.id, form: editForm })}
          isSaving={mutations.updateOffer.isPending}
          onDeleteClick={() => setConfirmDeleteOffer(true)}
          onCreateInvoiceClick={() => setShowOfferInvoiceForm(true)}
        />

        {removeConfirm && (
          <RemovePlacementDialog
            isOpenType={removePlacement?.placement_type === 'open'}
            onCancel={() => setRemoveConfirm(null)}
            onRemoveOnly={() =>
              mutations.removePlacement.mutate({
                offerId: selectedOffer.id,
                placementId: removeConfirm,
                deleteFromProgram: false,
              })
            }
            onRemoveAndDelete={() =>
              mutations.removePlacement.mutate({
                offerId: selectedOffer.id,
                placementId: removeConfirm,
                deleteFromProgram: true,
              })
            }
            isPending={mutations.removePlacement.isPending}
          />
        )}

        {showOfferInvoiceForm && (
          <OfferInvoiceForm
            offerId={selectedOffer.id}
            onClose={() => setShowOfferInvoiceForm(false)}
            onCreated={() => {
              setShowOfferInvoiceForm(false);
              mutations.invalidateOffers();
            }}
          />
        )}

        {confirmDeleteOffer && (
          <DeleteOfferDialog
            offerNumber={selectedOffer.offer_number}
            onCancel={() => setConfirmDeleteOffer(false)}
            onConfirm={() => mutations.deleteOffer.mutate(selectedOffer.id)}
            isPending={mutations.deleteOffer.isPending}
          />
        )}
      </>
    );
  }

  // LIST view
  return (
    <OffersListView
      offers={offers}
      isLoading={offersQuery.isLoading}
      onCreate={handleCreateClick}
      onSelect={handleSelectOffer}
    />
  );
}

export default OffersTab;
