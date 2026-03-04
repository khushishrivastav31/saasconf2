import type { TaxInfo } from '../../../../types';

interface TaxInfoSectionProps {
  taxInfo: TaxInfo | undefined;
  conferenceCountry: string | null;
  hasFiscalRep: boolean;
}

function TaxInfoSection({ taxInfo, conferenceCountry, hasFiscalRep }: TaxInfoSectionProps) {
  const isSelfRepresented = taxInfo?.representation_type === 'self';

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm text-gray-600 dark:text-gray-400">Tax Representation:</span>
        {isSelfRepresented ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
            Self-represented
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
            {hasFiscalRep ? 'Fiscal representative' : 'Fiscal representative needed'}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {isSelfRepresented
          ? `Conference is in the same country as the tenant (${taxInfo?.tenant_country || 'N/A'}). The tenant's VAT number is used on invoices.`
          : conferenceCountry
            ? `Conference is in ${conferenceCountry}, which differs from the tenant's country (${taxInfo?.tenant_country || 'N/A'}). A fiscal representative is required for VAT purposes.`
            : 'Set the conference country to determine tax representation.'}
      </p>
      {taxInfo?.effective_vat_number && (
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
          Effective VAT number:{' '}
          <span className="font-mono font-medium">{taxInfo.effective_vat_number}</span>
        </p>
      )}
    </div>
  );
}

export default TaxInfoSection;
