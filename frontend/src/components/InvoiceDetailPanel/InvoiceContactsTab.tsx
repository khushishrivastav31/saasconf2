import ContactPersonList from "../ContactPersonList";
import type { LocationContactPerson } from "../../types";

interface InvoiceContactsTabProps {
  contacts: LocationContactPerson[];
  newContact: LocationContactPerson;
  setNewContact: (contact: LocationContactPerson) => void;
  addContact: () => void;
  removeContact: (index: number) => void;
  updateContact: (index: number, contact: LocationContactPerson) => void;
}

export default function InvoiceContactsTab({
  contacts,
  newContact,
  setNewContact,
  addContact,
  removeContact,
  updateContact,
}: InvoiceContactsTabProps) {
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
