import { useState } from 'react';
import ConfirmDialog from '../../../../../components/ConfirmDialog';
import type { ContactPerson } from '../../../../../types';
import ContactPersonItem from './ContactPersonItem';
import ContactPersonForm from './ContactPersonForm';

interface Props {
  contacts: ContactPerson[];
  onAdd: (contact: ContactPerson) => void;
  onUpdate: (index: number, contact: ContactPerson) => void;
  onRemove: (index: number) => void;
}

export default function ContactPersonsSection({ contacts, onAdd, onUpdate, onRemove }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const deletingName =
    deleteIndex !== null
      ? `${contacts[deleteIndex]?.first_name ?? ''} ${contacts[deleteIndex]?.last_name ?? ''}`.trim()
      : '';

  return (
    <div className="border-t dark:border-gray-700 pt-4">
      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contact Persons</h5>

      {contacts.length > 0 && (
        <div className="mb-4 space-y-2">
          {contacts.map((contact, index) => (
            <ContactPersonItem
              key={index}
              contact={contact}
              isEditing={editingIndex === index}
              onEdit={() => setEditingIndex(index)}
              onDone={() => setEditingIndex(null)}
              onRequestDelete={() => setDeleteIndex(index)}
              onChange={(c) => onUpdate(index, c)}
            />
          ))}
        </div>
      )}

      <ContactPersonForm onAdd={onAdd} />

      <ConfirmDialog
        open={deleteIndex !== null}
        title="Delete Contact"
        message={`Are you sure you want to delete "${deletingName}"?`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteIndex !== null) onRemove(deleteIndex);
          setDeleteIndex(null);
        }}
        onCancel={() => setDeleteIndex(null)}
      />
    </div>
  );
}
