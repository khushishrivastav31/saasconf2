import { useState } from 'react';
import { validatePhone, validateEmail } from '../../../../../utils/validators';
import type { ContactPerson } from '../../../../../types';

interface Props {
  contact: ContactPerson;
  isEditing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onRequestDelete: () => void;
  onChange: (contact: ContactPerson) => void;
}

export default function ContactPersonItem({
  contact,
  isEditing,
  onEdit,
  onDone,
  onRequestDelete,
  onChange,
}: Props) {
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1';
  const inputBaseClass =
    'w-full rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100';

  const handleDone = () => {
    onDone();
    setPhoneError(null);
    setEmailError(null);
  };

  if (isEditing) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>First Name *</label>
              <input
                type="text"
                className={`${inputBaseClass} border border-gray-300 dark:border-gray-600`}
                value={contact.first_name}
                onChange={(e) => onChange({ ...contact, first_name: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Last Name *</label>
              <input
                type="text"
                className={`${inputBaseClass} border border-gray-300 dark:border-gray-600`}
                value={contact.last_name}
                onChange={(e) => onChange({ ...contact, last_name: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Role</label>
              <input
                type="text"
                className={`${inputBaseClass} border border-gray-300 dark:border-gray-600`}
                value={contact.role || ''}
                onChange={(e) => onChange({ ...contact, role: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                className={`${inputBaseClass} border ${emailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
                value={contact.email || ''}
                onChange={(e) => onChange({ ...contact, email: e.target.value })}
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
                value={contact.phone || ''}
                onChange={(e) => {
                  onChange({ ...contact, phone: e.target.value });
                  if (phoneError) setPhoneError(null);
                }}
                onBlur={(e) => setPhoneError(validatePhone(e.target.value))}
              />
              {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleDone}
              disabled={!!phoneError || !!emailError}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {`${contact.first_name} ${contact.last_name}`.trim()}
            </span>
            {contact.role && (
              <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                {contact.role}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 space-x-3">
            {contact.email && <span>{contact.email}</span>}
            {contact.phone && <span>{contact.phone}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onRequestDelete}
            className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
