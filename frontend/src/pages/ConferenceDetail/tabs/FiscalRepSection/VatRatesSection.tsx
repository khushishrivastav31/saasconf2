import type { TaxInfo } from '../../../../types';
import EuVatRatesReference from './EuVatRatesReference';

interface VatRatesSectionProps {
  conferenceCountry: string | null;
  taxInfo: TaxInfo | undefined;
}

function VatRatesSection({ conferenceCountry, taxInfo }: VatRatesSectionProps) {
  return (
    <>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="mb-3">
          <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Conference Tax/VAT Rate
          </h6>
          <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
            <p>
              The tax rate is automatically determined from the conference country and your Country
              VAT/Tax Rates list below.
            </p>
          </div>
        </div>

        {taxInfo?.current_vat_rate !== null && taxInfo?.current_vat_rate !== undefined ? (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
            <p className="text-sm text-green-800 dark:text-green-200">
              <strong>Current tax rate for {taxInfo.conference_country}:</strong>{' '}
              <span className="text-lg font-bold">{taxInfo.current_vat_rate}%</span>
            </p>
            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
              Pulled from your Country VAT/Tax Rates list. To change this rate, edit the country
              rate below.
            </p>
          </div>
        ) : conferenceCountry ? (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Warning:</strong> {conferenceCountry} is not in your Country VAT/Tax Rates
              list.
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              Please add {conferenceCountry} to the Country VAT/Tax Rates section below to enable
              automatic tax calculation.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No conference country set. Please set the conference country in the general settings.
          </p>
        )}
      </div>

      <EuVatRatesReference />
    </>
  );
}

export default VatRatesSection;
