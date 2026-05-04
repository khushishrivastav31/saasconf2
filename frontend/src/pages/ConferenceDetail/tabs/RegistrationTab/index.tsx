import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Conference, Registration } from '../../../../types';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import ReplaceAttendeeModal from '../../../../components/modals/ReplaceAttendeeModal';
import BulkCancelDialog from '../../../../components/trainings/BulkCancelDialog';
import { useRegistrationQueries } from './hooks/useRegistrationQueries';
import { useRegistrationMutations } from './hooks/useRegistrationMutations';
import { useCreateFormState } from './hooks/useCreateFormState';
import RegistrationDetailPanel from './RegistrationDetailPanel';
import RegistrationCreateForm from './RegistrationCreateForm';
import RegistrationListView from './RegistrationListView';

// ---------------------------------------------------------------------------
// Main Tab
// ---------------------------------------------------------------------------

export default function RegistrationTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [showBulkCancel, setShowBulkCancel] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Registration | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<Registration | null>(null);
  const queryClient = useQueryClient();

  // ---- Queries ----
  const { data, isLoading, options, periods, invoiceMap } = useRegistrationQueries(
    conference.id,
    page,
    search,
    statusFilter
  );

  const selectedReg = data?.items?.find((r) => r.id === selectedId);

  // ---- Create form state ----
  const createFormState = useCreateFormState(conference.id, options, periods);

  // ---- Mutations ----
  const mutations = useRegistrationMutations(conference.id, {
    onSuccess: (msg) => setSuccess(msg),
    onError: (msg) => setError(msg),
    onCreateSuccess: (res) => {
      createFormState.resetCreateForm();
      setShowCreate(false);
      setError(null);
      if (res.total_created === 1) {
        const reg = res.registrations[0];
        setSuccess(`Registration created for ${reg.first_name} ${reg.last_name}`);
        setSelectedId(reg.id);
      } else {
        setSuccess(`${res.total_created} registration(s) created successfully`);
      }
    },
    onDeleteSuccess: () => {
      setDeleteTarget(null);
      setSelectedId(null);
    },
    onAddItemSuccess: () => {
      // Item added - success message handled by onSuccess
    },
  });

  // ---- Handlers ----
  const handleCreateSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(null);

      const { billing, attendees: validAttendees } = createFormState.buildCreatePayload();
      if (validAttendees.length === 0) {
        setError('Please fill in all required fields for at least one attendee');
        return;
      }

      mutations.createMutation.mutate({ billing, attendees: validAttendees });
    },
    [createFormState, mutations.createMutation]
  );

  const handleCancel = useCallback(() => {
    createFormState.resetCreateForm();
    setShowCreate(false);
    setError(null);
  }, [createFormState]);

  // ---- Detail view ----
  if (selectedId && selectedReg) {
    return (
      <>
        <RegistrationDetailPanel
          registration={selectedReg}
          conferenceId={conference.id}
          isAdmin={isAdmin}
          options={options}
          invoiceMap={invoiceMap}
          error={error}
          success={success}
          onBack={() => {
            setSelectedId(null);
            setSuccess(null);
          }}
          onDelete={setDeleteTarget}
          onReplace={setReplaceTarget}
          onAddItem={(regId, payload) => mutations.addItemMutation.mutate({ regId, data: payload })}
          onRemoveItem={(regId, itemId) => mutations.removeItemMutation.mutate({ regId, itemId })}
          onUpdateItemSession={(regId, itemId, sessionId) =>
            mutations.updateItemSessionMutation.mutate({ regId, itemId, sessionId })
          }
          onUpdateMainSession={(regId, sessionId) =>
            mutations.updateMainSessionMutation.mutate({ regId, sessionId })
          }
        />

        <ConfirmDialog
          open={!!deleteTarget}
          title="Delete Registration"
          message={`Are you sure you want to delete the registration for ${deleteTarget?.first_name} ${deleteTarget?.last_name}?`}
          onConfirm={() => deleteTarget && mutations.deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />

        {replaceTarget && (
          <ReplaceAttendeeModal
            isOpen={!!replaceTarget}
            onClose={() => setReplaceTarget(null)}
            registration={replaceTarget}
            conferenceId={conference.id}
          />
        )}
      </>
    );
  }

  // ---- Create form ----
  if (showCreate) {
    return (
      <RegistrationCreateForm
        conference={conference}
        options={options}
        periods={periods}
        error={error}
        isCreating={mutations.createMutation.isPending}
        attendees={createFormState.attendees}
        setAttendees={createFormState.setAttendees}
        attendeeOptionIds={createFormState.attendeeOptionIds}
        setAttendeeOptionIds={createFormState.setAttendeeOptionIds}
        attendeeSessionSelections={createFormState.attendeeSessionSelections}
        setAttendeeSessionSelections={createFormState.setAttendeeSessionSelections}
        billing={createFormState.billing}
        setBilling={createFormState.setBilling}
        discountValidation={createFormState.discountValidation}
        vatCalculation={createFormState.vatCalculation}
        publicBookingOptions={createFormState.publicBookingOptions}
        publicBookingPeriods={createFormState.publicBookingPeriods}
        portalAttendees={createFormState.portalAttendees}
        onCancel={handleCancel}
        onSubmit={handleCreateSubmit}
      />
    );
  }

  // ---- List view ----
  return (
    <>
      <RegistrationListView
        data={data}
        isLoading={isLoading}
        isAdmin={isAdmin}
        invoiceMap={invoiceMap}
        search={search}
        statusFilter={statusFilter}
        page={page}
        error={error}
        success={success}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onStatusFilterChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
        onPageChange={setPage}
        onSelectRegistration={(id) => {
          setSelectedId(id);
          setError(null);
          setSuccess(null);
        }}
        onShowCreate={() => {
          setShowCreate(true);
          setError(null);
          setSuccess(null);
        }}
        onShowBulkCancel={isAdmin ? () => setShowBulkCancel(true) : undefined}
      />

      <BulkCancelDialog
        open={showBulkCancel}
        onClose={() => setShowBulkCancel(false)}
        previewUrl={`/conferences/${conference.id}/registrations/bulk-cancel/preview`}
        confirmUrl={`/conferences/${conference.id}/registrations/bulk-cancel/confirm`}
        onCompleted={(result) => {
          setSuccess(
            `Cancelled ${result.cancelled} registration${result.cancelled === 1 ? '' : 's'} (${result.credit_notes_created} credit notes, ${result.emails_sent} emails)`
          );
          queryClient.invalidateQueries({ queryKey: ['conference-registrations', conference.id] });
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Registration"
        message={`Are you sure you want to delete the registration for ${deleteTarget?.first_name} ${deleteTarget?.last_name}?`}
        onConfirm={() => deleteTarget && mutations.deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      {replaceTarget && (
        <ReplaceAttendeeModal
          isOpen={!!replaceTarget}
          onClose={() => setReplaceTarget(null)}
          registration={replaceTarget}
          conferenceId={conference.id}
        />
      )}
    </>
  );
}
