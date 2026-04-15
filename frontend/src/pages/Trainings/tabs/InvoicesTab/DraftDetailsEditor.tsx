import { useState } from 'react';
import { TypeBadge } from './formatters';
import { COUNTRIES_BY_CONTINENT } from '../../../../config/countries';
import VatNumberInput from '../../../../components/common/VatNumberInput';
import { validateEmail } from '../../../../utils/validators';

export default function DraftDetailsEditor(props: {
  editRecipientName: string;
  setEditRecipientName: (v: string) => void;
  editRecipientEmail: string;
  setEditRecipientEmail: (v: string) => void;
  editAddress: string;
  setEditAddress: (v: string) => void;
  editCity: string;
  setEditCity: (v: string) => void;
  editPostalCode: string;
  setEditPostalCode: (v: string) => void;
  editCountry: string;
  setEditCountry: (v: string) => void;
  editVat: string;
  setEditVat: (v: string) => void;
  editIssueDate: string;
  setEditIssueDate: (v: string) => void;
  editDueDate: string;
  setEditDueDate: (v: string) => void;
  editNotes: string;
  setEditNotes: (v: string) => void;
  templateType: string;
  currency: string | null;
}) {
  const [emailError, setEmailError] = useState<string | null>(null);

  const inputCls =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100';
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Template Type
          </label>
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm">
            <TypeBadge type={props.templateType} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Issue Date
          </label>
          <input
            type="date"
            value={props.editIssueDate}
            onChange={(e) => props.setEditIssueDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Due Date
          </label>
          <input
            type="date"
            value={props.editDueDate}
            onChange={(e) => props.setEditDueDate(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Recipient</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Name
            </label>
            <input
              type="text"
              value={props.editRecipientName}
              onChange={(e) => props.setEditRecipientName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Email
            </label>
            <input
              type="email"
              value={props.editRecipientEmail}
              onChange={(e) => {
                props.setEditRecipientEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              onBlur={() => {
                const err = validateEmail(props.editRecipientEmail);
                setEmailError(err);
              }}
              className={`${inputCls} ${emailError ? 'border-red-500 dark:border-red-500' : ''}`}
            />
            {emailError && (
              <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{emailError}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Address
            </label>
            <input
              type="text"
              value={props.editAddress}
              onChange={(e) => props.setEditAddress(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              City
            </label>
            <input
              type="text"
              value={props.editCity}
              onChange={(e) => props.setEditCity(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Postal Code
            </label>
            <input
              type="text"
              value={props.editPostalCode}
              onChange={(e) => props.setEditPostalCode(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Country
            </label>
            <select
              value={props.editCountry}
              onChange={(e) => props.setEditCountry(e.target.value)}
              className={inputCls}
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
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              VAT Number
            </label>
            <VatNumberInput
              value={props.editVat}
              onChange={props.setEditVat}
              country={props.editCountry}
              placeholder="e.g., DE123456789"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Currency
            </label>
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100">
              {props.currency ?? '—'}
            </div>
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
          Notes
        </label>
        <textarea
          value={props.editNotes}
          onChange={(e) => props.setEditNotes(e.target.value)}
          rows={3}
          className={inputCls}
        />
      </div>
    </div>
  );
}
