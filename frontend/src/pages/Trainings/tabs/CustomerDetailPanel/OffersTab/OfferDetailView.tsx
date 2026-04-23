import type { AvailablePlacement, CustomerOffer } from '../../../../../types/training';
import RichTextEditor from '../../../../../components/common/RichTextEditor';
import OfferDocumentsSection from '../../OfferDocumentsSection';
import AssignedPlacementsTable from './AssignedPlacementsTable';
import AddPlacementsInline from './AddPlacementsInline';
import PricingFieldsGrid from './PricingFieldsGrid';
import { STATUS_COLORS } from './constants';
import { inputClass } from './styles';
import type { ContactPerson, OfferForm } from './types';

interface Currency {
  code: string;
  name: string;
}

interface Props {
  offer: CustomerOffer;
  form: OfferForm;
  onFormChange: (form: OfferForm) => void;
  customerName: string;
  contactPersons: ContactPerson[];
  currencies: Currency[];

  showAddPlacements: boolean;
  onShowAddPlacements: () => void;
  onHideAddPlacements: () => void;
  placementsByYear: Array<{ year: number; placements: AvailablePlacement[] }>;
  addPlacementIds: string[];
  onTogglePlacement: (id: string, checked: boolean) => void;
  onConfirmAddPlacements: () => void;
  isAddPending: boolean;

  onBack: () => void;
  onRemovePlacement: (placementId: string) => void;
  onSave: () => void;
  isSaving: boolean;
  onDeleteClick: () => void;
  onCreateInvoiceClick: () => void;
}

export default function OfferDetailView({
  offer,
  form,
  onFormChange,
  customerName,
  contactPersons,
  currencies,
  showAddPlacements,
  onShowAddPlacements,
  onHideAddPlacements,
  placementsByYear,
  addPlacementIds,
  onTogglePlacement,
  onConfirmAddPlacements,
  isAddPending,
  onBack,
  onRemovePlacement,
  onSave,
  isSaving,
  onDeleteClick,
  onCreateInvoiceClick,
}: Props) {
  const updatePricing = (
    field: 'attendees' | 'training_price' | 'certification_price' | 'currency',
    value: number | string | null
  ) => {
    onFormChange({ ...form, [field]: value });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            &larr; Back to list
          </button>
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {offer.offer_number}
          </h4>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[offer.status] || STATUS_COLORS.draft}`}
          >
            {offer.status}
          </span>
        </div>
      </div>

      <AssignedPlacementsTable
        offer={offer}
        onAddClick={onShowAddPlacements}
        onRemove={onRemovePlacement}
      />

      {showAddPlacements && (
        <AddPlacementsInline
          placementsByYear={placementsByYear}
          offer={offer}
          selectedIds={addPlacementIds}
          onToggle={onTogglePlacement}
          onCancel={onHideAddPlacements}
          onConfirm={onConfirmAddPlacements}
          isPending={isAddPending}
        />
      )}

      <OfferDocumentsSection
        offerId={offer.id}
        offerNumber={offer.offer_number}
        customerName={customerName}
        contactPersons={contactPersons}
      />

      <div>
        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pricing</h5>
        <PricingFieldsGrid
          attendees={form.attendees}
          trainingPrice={form.training_price}
          certificationPrice={form.certification_price}
          currency={form.currency}
          currencies={currencies}
          onChange={updatePricing}
          compactLabels
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            PO Number
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.po_number ?? ''}
            onChange={(e) => onFormChange({ ...form, po_number: e.target.value || null })}
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Status
          </label>
          {form.status === 'draft' ? (
            <span className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              Draft — send a quote to change status
            </span>
          ) : (
            <select
              className={inputClass}
              value={form.status}
              onChange={(e) =>
                onFormChange({ ...form, status: e.target.value as OfferForm['status'] })
              }
            >
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Comments
        </label>
        <RichTextEditor
          value={form.comments ?? ''}
          onChange={(html) => onFormChange({ ...form, comments: html || null })}
          rows={2}
        />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onDeleteClick}
          disabled={(offer.invoice_count ?? 0) > 0}
          title={
            (offer.invoice_count ?? 0) > 0
              ? 'Cannot delete — this offer has invoices linked. Delete the invoices first.'
              : undefined
          }
          className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 border border-red-200 dark:border-red-800 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-red-600 dark:disabled:hover:text-red-400"
        >
          Delete Offer
        </button>
        <div className="flex items-center gap-2">
          {form.status === 'accepted' && (
            <button
              type="button"
              onClick={onCreateInvoiceClick}
              className="px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700 rounded-md hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
            >
              Create Invoice
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
