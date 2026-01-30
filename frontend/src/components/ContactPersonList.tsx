import { useState } from "react";
import type { LocationContactPerson } from "../types";
import RichTextEditor from "./common/RichTextEditor";
import RichTextDisplay from "./common/RichTextDisplay";
import { validatePhone } from "../utils/validators";

interface ContactPersonListProps {
  contacts: LocationContactPerson[];
  newContact: LocationContactPerson;
  setNewContact: (c: LocationContactPerson) => void;
  addContact: () => void;
  removeContact: (index: number) => void;
  updateContact?: (index: number, contact: LocationContactPerson) => void;
}

const inputClass =
  "block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500";

export default function ContactPersonList({
  contacts,
  newContact,
  setNewContact,
  addContact,
  removeContact,
  updateContact,
}: ContactPersonListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editData, setEditData] = useState<LocationContactPerson>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    comment: "",
  });
  const [editPhoneError, setEditPhoneError] = useState<string | null>(null);
  const [newPhoneError, setNewPhoneError] = useState<string | null>(null);

  const startEditing = (index: number) => {
    const contact = contacts[index];
    setEditData({
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email || "",
      phone: contact.phone || "",
      comment: contact.comment || "",
    });
    setEditPhoneError(null);
    setEditingIndex(index);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
  };

  const saveEditing = () => {
    if (editingIndex !== null && updateContact && editData.first_name.trim() && editData.last_name.trim() && !editPhoneError) {
      updateContact(editingIndex, { ...editData });
      setEditingIndex(null);
    }
  };

  return (
    <div>
      {contacts.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">
            Contact Persons
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
              {contacts.length}
            </span>
          </h4>
          <div className="space-y-2">
            {contacts.map((contact, index) => (
              <div
                key={index}
                className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
              >
                {editingIndex === index ? (
                  /* Inline edit form */
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="First Name *"
                        className={inputClass}
                        value={editData.first_name}
                        onChange={(e) =>
                          setEditData({ ...editData, first_name: e.target.value })
                        }
                      />
                      <input
                        type="text"
                        placeholder="Last Name *"
                        className={inputClass}
                        value={editData.last_name}
                        onChange={(e) =>
                          setEditData({ ...editData, last_name: e.target.value })
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="email"
                        placeholder="Email"
                        className={inputClass}
                        value={editData.email}
                        onChange={(e) =>
                          setEditData({ ...editData, email: e.target.value })
                        }
                      />
                      <div>
                        <input
                          type="tel"
                          placeholder="+491234545 or 00491234566"
                          className={`${inputClass} ${editPhoneError ? "border-red-300" : ""}`}
                          value={editData.phone}
                          onChange={(e) => {
                            const value = e.target.value;
                            setEditData({ ...editData, phone: value });
                            setEditPhoneError(validatePhone(value));
                          }}
                        />
                        {editPhoneError && <p className="mt-1 text-xs text-red-600">{editPhoneError}</p>}
                      </div>
                    </div>
                    <RichTextEditor
                      value={editData.comment}
                      onChange={(html) =>
                        setEditData({ ...editData, comment: html })
                      }
                      rows={2}
                      placeholder="Comment or notes..."
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={saveEditing}
                        disabled={!editData.first_name.trim() || !editData.last_name.trim() || !!editPhoneError}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Read-only display */
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-medium">
                          {(contact.first_name?.charAt(0) || "").toUpperCase()}{(contact.last_name?.charAt(0) || "").toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {[contact.first_name, contact.last_name].filter(Boolean).join(" ")}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            {contact.email && (
                              <span className="flex items-center gap-1">
                                <svg
                                  className="w-3 h-3"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                  />
                                </svg>
                                {contact.email}
                              </span>
                            )}
                            {contact.phone && (
                              <span className="flex items-center gap-1">
                                <svg
                                  className="w-3 h-3"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                  />
                                </svg>
                                {contact.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {contact.comment && (
                        <div className="mt-2 ml-11 text-sm text-gray-600 bg-white border border-gray-100 rounded px-3 py-1.5">
                          <RichTextDisplay content={contact.comment} />
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-1 ml-2">
                      {updateContact && (
                        <button
                          type="button"
                          onClick={() => startEditing(index)}
                          className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                          title="Edit contact"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeContact(index)}
                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                        title="Remove contact"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
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
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">
          Add New Contact
        </h4>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="First Name *"
              className={inputClass}
              value={newContact.first_name}
              onChange={(e) =>
                setNewContact({ ...newContact, first_name: e.target.value })
              }
            />
            <input
              type="text"
              placeholder="Last Name *"
              className={inputClass}
              value={newContact.last_name}
              onChange={(e) =>
                setNewContact({ ...newContact, last_name: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="email"
              placeholder="Email"
              className={inputClass}
              value={newContact.email}
              onChange={(e) =>
                setNewContact({ ...newContact, email: e.target.value })
              }
            />
            <div>
              <input
                type="tel"
                placeholder="+491234545 or 00491234566"
                className={`${inputClass} ${newPhoneError ? "border-red-300" : ""}`}
                value={newContact.phone}
                onChange={(e) => {
                  const value = e.target.value;
                  setNewContact({ ...newContact, phone: value });
                  setNewPhoneError(validatePhone(value));
                }}
              />
              {newPhoneError && <p className="mt-1 text-xs text-red-600">{newPhoneError}</p>}
            </div>
          </div>
          <RichTextEditor
            value={newContact.comment}
            onChange={(html) =>
              setNewContact({ ...newContact, comment: html })
            }
            rows={2}
            placeholder="Comment or notes..."
          />
        </div>
        <button
          type="button"
          onClick={() => {
            addContact();
            setNewPhoneError(null);
          }}
          disabled={!newContact.first_name.trim() || !newContact.last_name.trim() || !!newPhoneError}
          className="mt-3 inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          + Add Contact
        </button>
      </div>
    </div>
  );
}
