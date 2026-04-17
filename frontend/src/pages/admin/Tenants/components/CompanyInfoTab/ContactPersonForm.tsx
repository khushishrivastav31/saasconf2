import { useState } from 'react';
import { validatePhone, validateEmail } from '../../../../../utils/validators';
import type { ContactPerson } from '../../../../../types';
import { emptyContact } from './schema';

interface Props {
  onAdd: (contact: ContactPerson) => void;
}

export default function ContactPersonForm({ onAdd }: Props) {
  const [newContact, setNewContact] = useState<ContactPerson>(emptyContact);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1';
  const inputBaseClass =
    'w-full rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100';

  const canAdd =
    newContact.first_name.trim() && newContact.last_name.trim() && !phoneError && !emailError;

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd({ ...newContact });
    setNewContact(emptyContact);
    setPhoneError(null);
    setEmailError(null);
  };

  return (
    <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
      <h6 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-3">Add New Contact</h6>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>First Name *</label>
          <input
            type="text"
            placeholder="First name"
            className={`${inputBaseClass} border border-gray-300 dark:border-gray-600`}
            value={newContact.first_name}
            onChange={(e) => setNewContact({ ...newContact, first_name: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Last Name *</label>
          <input
            type="text"
            placeholder="Last name"
            className={`${inputBaseClass} border border-gray-300 dark:border-gray-600`}
            value={newContact.last_name}
            onChange={(e) => setNewContact({ ...newContact, last_name: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Role</label>
          <input
            type="text"
            placeholder="e.g., Manager, Technical"
            className={`${inputBaseClass} border border-gray-300 dark:border-gray-600`}
            value={newContact.role}
            onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            placeholder="email@example.com"
            className={`${inputBaseClass} border ${emailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
            value={newContact.email}
            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
            onBlur={(e) => setEmailError(validateEmail(e.target.value))}
          />
          {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input
            type="tel"
            placeholder="+491234545 or 00491234566"
            className={`${inputBaseClass} border ${phoneError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
            value={newContact.phone}
            onChange={(e) => {
              setNewContact({ ...newContact, phone: e.target.value });
              if (phoneError) setPhoneError(null);
            }}
            onBlur={(e) => setPhoneError(validatePhone(e.target.value))}
          />
          {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Contact
        </button>
      </div>
    </div>
  );
}
