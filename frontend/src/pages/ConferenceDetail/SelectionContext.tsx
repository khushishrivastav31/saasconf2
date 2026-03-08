import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Context for entity selection state within ConferenceDetail.
 *
 * This replaces prop drilling of selectedXxxId/setSelectedXxxId through
 * ConferenceDetail → tabs. Each tab can consume only the selection it needs.
 */

interface SelectionState {
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;
  selectedServiceProviderId: string | null;
  setSelectedServiceProviderId: (id: string | null) => void;
  selectedSponsorId: string | null;
  setSelectedSponsorId: (id: string | null) => void;
  selectedInvoiceId: string | null;
  setSelectedInvoiceId: (id: string | null) => void;
  selectedCommitteeMemberId: string | null;
  setSelectedCommitteeMemberId: (id: string | null) => void;
  selectedApplicantId: string | null;
  setSelectedApplicantId: (id: string | null) => void;
  selectedRegistrationId: string | null;
  setSelectedRegistrationId: (id: string | null) => void;
  /** Reset all selections (e.g. when switching tabs). */
  resetAll: () => void;
}

const SelectionContext = createContext<SelectionState | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedServiceProviderId, setSelectedServiceProviderId] = useState<string | null>(null);
  const [selectedSponsorId, setSelectedSponsorId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedCommitteeMemberId, setSelectedCommitteeMemberId] = useState<string | null>(null);
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);

  const resetAll = () => {
    setSelectedLocationId(null);
    setSelectedServiceProviderId(null);
    setSelectedSponsorId(null);
    setSelectedInvoiceId(null);
    setSelectedCommitteeMemberId(null);
    setSelectedApplicantId(null);
    setSelectedRegistrationId(null);
  };

  return (
    <SelectionContext.Provider
      value={{
        selectedLocationId,
        setSelectedLocationId,
        selectedServiceProviderId,
        setSelectedServiceProviderId,
        selectedSponsorId,
        setSelectedSponsorId,
        selectedInvoiceId,
        setSelectedInvoiceId,
        selectedCommitteeMemberId,
        setSelectedCommitteeMemberId,
        selectedApplicantId,
        setSelectedApplicantId,
        selectedRegistrationId,
        setSelectedRegistrationId,
        resetAll,
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error('useSelection must be used within a SelectionProvider');
  }
  return ctx;
}
