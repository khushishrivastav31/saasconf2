import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type { FiscalRepresentative, TaxInfo } from '../../../../types';
import TaxInfoSection from './TaxInfoSection';
import FiscalRepForm from './FiscalRepForm';
import VatRatesSection from './VatRatesSection';

interface FiscalRepSectionProps {
  conferenceId: string;
  conferenceCountry: string | null;
  isAdmin: boolean;
}

function FiscalRepSection({ conferenceId, conferenceCountry, isAdmin }: FiscalRepSectionProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // --- Data queries ---
  const { data: taxInfo, isLoading: taxInfoLoading } = useQuery({
    queryKey: queryKeys.fiscal.taxInfo(conferenceId, conferenceCountry ?? undefined),
    queryFn: async () => {
      const res = await api.get<TaxInfo>(`/conferences/${conferenceId}/tax-info`);
      return res.data;
    },
  });

  const { data: fiscalRep } = useQuery({
    queryKey: queryKeys.fiscal.representative(conferenceId),
    queryFn: async () => {
      const res = await api.get<FiscalRepresentative | null>(
        `/conferences/${conferenceId}/fiscal-representative`
      );
      return res.data;
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.fiscal.taxInfo(conferenceId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.fiscal.representative(conferenceId) });
  };

  if (taxInfoLoading) {
    return (
      <div className="border-t pt-4">
        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Tax & VAT</h5>
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  const isSelfRepresented = taxInfo?.representation_type === 'self';

  return (
    <div className="border-t pt-4">
      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Tax & VAT</h5>

      {error && (
        <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      <TaxInfoSection
        taxInfo={taxInfo}
        conferenceCountry={conferenceCountry}
        hasFiscalRep={!!fiscalRep}
      />

      {!isSelfRepresented && (
        <FiscalRepForm
          conferenceId={conferenceId}
          fiscalRep={fiscalRep ?? null}
          isAdmin={isAdmin}
          setError={setError}
          invalidateAll={invalidateAll}
        />
      )}

      <VatRatesSection conferenceCountry={conferenceCountry} taxInfo={taxInfo} />
    </div>
  );
}

export default FiscalRepSection;
