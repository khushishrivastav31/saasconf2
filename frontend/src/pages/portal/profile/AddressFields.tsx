import { COUNTRY_OPTIONS } from '../../../config/countries';

interface Props {
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  country: string;
  requiredFields?: string[];
  onAddressLine1Change: (v: string) => void;
  onAddressLine2Change: (v: string) => void;
  onCityChange: (v: string) => void;
  onPostalCodeChange: (v: string) => void;
  onCountryChange: (v: string) => void;
}

const inputClass =
  'w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100';

const Req = () => <span className="text-red-500"> *</span>;

export default function AddressFields({
  addressLine1,
  addressLine2,
  city,
  postalCode,
  country,
  requiredFields = [],
  onAddressLine1Change,
  onAddressLine2Change,
  onCityChange,
  onPostalCodeChange,
  onCountryChange,
}: Props) {
  const isAddressRequired = requiredFields.includes('address');

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Address</h3>
      <div className="space-y-3">
        <div>
          <label
            htmlFor="address-line-1"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Address Line 1{isAddressRequired && <Req />}
          </label>
          <input
            id="address-line-1"
            type="text"
            value={addressLine1}
            onChange={(e) => onAddressLine1Change(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="address-line-2"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Address Line 2
          </label>
          <input
            id="address-line-2"
            type="text"
            value={addressLine2}
            onChange={(e) => onAddressLine2Change(e.target.value)}
            className={inputClass}
            placeholder="Apartment, suite, etc. (optional)"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="address-city"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              City{isAddressRequired && <Req />}
            </label>
            <input
              id="address-city"
              type="text"
              value={city}
              onChange={(e) => onCityChange(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="address-postal"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Postal Code{isAddressRequired && <Req />}
            </label>
            <input
              id="address-postal"
              type="text"
              value={postalCode}
              onChange={(e) => onPostalCodeChange(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="address-country"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Country{isAddressRequired && <Req />}
            </label>
            <select
              id="address-country"
              value={country}
              onChange={(e) => onCountryChange(e.target.value)}
              className={inputClass}
            >
              <option value="">Select country...</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
