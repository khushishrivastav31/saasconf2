import ContactPersonList from '../ContactPersonList';
import type { LocationContactPerson } from '../../types';

interface InvoiceContactsTabProps {
  contacts: LocationContactPerson[];
  newContact: LocationContactPerson;
  setNewContact: (contact: LocationContactPerson) => void;
  addContact: () => void;
  removeContact: (index: number) => void;
  updateContact: (index: number, contact: LocationContactPerson) => void;
  readOnly?: boolean;
}

export default function InvoiceContactsTab({
  contacts,
  newContact,
  setNewContact,
  addContact,
  removeContact,
  updateContact,
  readOnly = false,
}: InvoiceContactsTabProps) {
  if (readOnly) {
    return (
      <div className="px-6 py-5">
        {contacts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No contact persons.</p>
        ) : (
          <div className="space-y-3">
            {contacts.map((contact, index) => (
              <div
                key={index}
                className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {contact.first_name} {contact.last_name}
                </p>
                {contact.email && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{contact.email}</p>
                )}
                {contact.phone && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{contact.phone}</p>
                )}
                {contact.comment && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {contact.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-6 py-5">
      <ContactPersonList
        contacts={contacts}
        newContact={newContact}
        setNewContact={setNewContact}
        addContact={addContact}
        removeContact={removeContact}
        updateContact={updateContact}
      />
    </div>
  );
}
