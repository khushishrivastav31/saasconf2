import { useState, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import api from '../../config/api';
import { validateEmail, validatePhone } from '../../utils/validators';
import type { PronounOption } from '../../types';

interface Registration {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  booking_option_name: string | null;
  items: Array<{
    id: string;
    item_name: string;
  }>;
}

interface ReplaceAttendeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  registration: Registration;
  conferenceId: string;
}

export default function ReplaceAttendeeModal({
  isOpen,
  onClose,
  registration,
  conferenceId,
}: ReplaceAttendeeModalProps) {
  console.log('ReplaceAttendeeModal RENDER - isOpen:', isOpen, 'registration:', registration);

  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [pronouns, setPronouns] = useState('');

  const [replacementReason, setReplacementReason] = useState('');
  const [cancellationMessage, setCancellationMessage] = useState('');

  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Additional items state
  const [additionalItems, setAdditionalItems] = useState<
    Array<{
      item_type: 'booking_option' | 'tutorial';
      booking_option_id?: string;
      program_session_id?: string;
      item_name?: string;
    }>
  >([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemType, setAddItemType] = useState<'booking_option' | 'tutorial'>('booking_option');
  const [addItemOptionId, setAddItemOptionId] = useState('');

  // Fetch pronoun options
  const { data: pronounOptions } = useQuery({
    queryKey: ['pronoun-options', conferenceId],
    queryFn: async () => {
      const response = await api.get<{ items: PronounOption[] }>(
        `/conferences/${conferenceId}/settings/pronouns`
      );
      return response.data.items.filter((p) => p.is_active);
    },
    enabled: !!conferenceId,
  });

  // Fetch booking options
  const { data: bookingOptions = [] } = useQuery({
    queryKey: ['booking-options', conferenceId],
    queryFn: async () => {
      const response = await api.get<{
        items: Array<{ id: string; name: string; is_active: boolean }>;
      }>(`/conferences/${conferenceId}/booking-options`);
      return response.data.items;
    },
    enabled: !!conferenceId,
  });

  // Check if registration has a tutorial-based booking option
  const hasTutorial = useMemo(() => {
    return (
      registration.booking_option_name?.toLowerCase().includes('tutorial') ||
      registration.items.some((item) => item.item_name.toLowerCase().includes('tutorial'))
    );
  }, [registration.booking_option_name, registration.items]);

  // Filter out items already in registration or already added
  const availableBookingOptions = useMemo(() => {
    return bookingOptions.filter((o) => {
      // Only show active options
      if (!o.is_active) return false;

      // Filter out the current booking option itself
      if (registration.booking_option_name === o.name) return false;

      // Filter out items already in the current registration (add-ons)
      const alreadyHas = registration.items.some((item) => item.item_name === o.name);
      if (alreadyHas) return false;

      // Filter out items already added to additional items
      const alreadyAdded = additionalItems.some((item) => item.item_name === o.name);
      if (alreadyAdded) return false;

      return true;
    });
  }, [bookingOptions, registration.booking_option_name, registration.items, additionalItems]);

  const replaceMutation = useMutation({
    mutationFn: async (data: {
      new_attendee: {
        first_name: string;
        last_name: string;
        email: string;
        phone?: string;
        job_title?: string;
        department?: string;
        pronouns?: string;
      };
      additional_items: Array<{
        item_type: 'booking_option' | 'tutorial';
        booking_option_id?: string;
        program_session_id?: string;
        item_name?: string;
      }>;
      replacement_reason?: string;
      cancellation_message?: string;
    }) => {
      const response = await api.post(
        `/conferences/${conferenceId}/registrations/${registration.id}/replace`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registrations', conferenceId] });
      queryClient.invalidateQueries({ queryKey: ['invoices', conferenceId] });
      handleClose();
    },
  });

  const handleClose = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setJobTitle('');
    setDepartment('');
    setPronouns('');
    setReplacementReason('');
    setCancellationMessage('');
    setEmailError(null);
    setPhoneError(null);
    setAdditionalItems([]);
    setShowAddItem(false);
    setAddItemOptionId('');
    onClose();
  };

  const handleAddItem = () => {
    if (addItemType === 'booking_option' && addItemOptionId) {
      const option = bookingOptions.find((o) => o.id === addItemOptionId);
      setAdditionalItems([
        ...additionalItems,
        {
          item_type: 'booking_option',
          booking_option_id: addItemOptionId,
          item_name: option?.name,
        },
      ]);
      setAddItemOptionId('');
      setShowAddItem(false);
    }
  };

  const handleRemoveItem = (index: number) => {
    setAdditionalItems(additionalItems.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const emailValidation = validateEmail(email);
    if (emailValidation) {
      setEmailError(emailValidation);
      return;
    }

    replaceMutation.mutate({
      new_attendee: {
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || undefined,
        job_title: jobTitle || undefined,
        department: department || undefined,
        pronouns: pronouns || undefined,
      },
      additional_items: additionalItems,
      replacement_reason: replacementReason || undefined,
      cancellation_message: cancellationMessage || undefined,
    });
  };

  if (!isOpen) return null;

  const isValid = firstName.trim() && lastName.trim() && email.trim() && !emailError && !phoneError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Replace Attendee
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Replace {registration.first_name} {registration.last_name} with a new attendee
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
          {/* New Attendee Information */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              New Attendee Information
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError(null);
                  }}
                  onBlur={(e) => setEmailError(validateEmail(e.target.value))}
                  className={`w-full border ${
                    emailError
                      ? 'border-red-500 dark:border-red-500'
                      : 'border-gray-300 dark:border-gray-600'
                  } rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100`}
                />
                {emailError && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{emailError}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setPhoneError(null);
                    }}
                    onBlur={(e) => {
                      if (e.target.value) {
                        setPhoneError(validatePhone(e.target.value));
                      }
                    }}
                    placeholder="+1234567890"
                    className={`w-full border ${
                      phoneError
                        ? 'border-red-500 dark:border-red-500'
                        : 'border-gray-300 dark:border-gray-600'
                    } rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100`}
                  />
                  {phoneError && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{phoneError}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Pronouns
                  </label>
                  <select
                    value={pronouns}
                    onChange={(e) => setPronouns(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="">Select pronouns...</option>
                    {pronounOptions?.map((opt) => (
                      <option key={opt.id} value={opt.name}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Current Selections (Read-only) */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
              Current Booking (Will Be Kept)
            </h3>
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-md p-3 space-y-1 text-sm">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Booking Option:
                </span>{' '}
                <span className="text-gray-600 dark:text-gray-300">
                  {registration.booking_option_name || 'N/A'}
                </span>
              </div>
              {registration.items.length > 0 && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Add-ons:</span>
                  <ul className="list-disc list-inside ml-2 text-gray-600 dark:text-gray-300">
                    {registration.items.map((item) => (
                      <li key={item.id}>{item.item_name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Additional Items (Optional - creates invoice for these) */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Additional Items (Optional)
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Add extra items - a new invoice will be created for these items only
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddItem(!showAddItem)}
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 font-medium"
              >
                {showAddItem ? 'Cancel' : '+ Add Item'}
              </button>
            </div>

            {showAddItem && (
              <div className="flex items-end gap-3 mb-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-md">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Type
                  </label>
                  <select
                    value={addItemType}
                    onChange={(e) => {
                      setAddItemType(e.target.value as 'booking_option' | 'tutorial');
                      setAddItemOptionId('');
                    }}
                    className="rounded-md border-gray-300 dark:border-gray-600 text-sm dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="booking_option">Booking Option</option>
                    <option value="tutorial" disabled={hasTutorial}>
                      Tutorial{hasTutorial ? ' (Already has tutorial)' : ''}
                    </option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    {addItemType === 'booking_option' ? 'Option' : 'Tutorial Session'}
                  </label>
                  {addItemType === 'booking_option' ? (
                    <select
                      value={addItemOptionId}
                      onChange={(e) => setAddItemOptionId(e.target.value)}
                      className="w-full rounded-md border-gray-300 dark:border-gray-600 text-sm dark:bg-gray-800 dark:text-gray-100"
                    >
                      <option value="">
                        {availableBookingOptions.length === 0
                          ? 'No additional items available'
                          : 'Select option...'}
                      </option>
                      {availableBookingOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Tutorial will be assigned as pending"
                      disabled
                      className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-sm"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={
                    addItemType === 'booking_option' &&
                    (!addItemOptionId || availableBookingOptions.length === 0)
                  }
                  className="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            )}

            {additionalItems.length > 0 && (
              <div className="space-y-2">
                {additionalItems.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded">
                        {item.item_type === 'booking_option' ? 'Option' : 'Tutorial'}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {item.item_name || 'Pending'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <p className="text-xs text-blue-600 dark:text-blue-400 italic mt-2">
                  💡 A new invoice will be created for {additionalItems.length}{' '}
                  {additionalItems.length === 1 ? 'item' : 'items'}
                </p>
              </div>
            )}
          </div>

          {/* Replacement Details */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Replacement Details
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reason for Replacement (Internal)
                </label>
                <textarea
                  value={replacementReason}
                  onChange={(e) => setReplacementReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Employee transfer, name change, etc."
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Message to Old Attendee (Email)
                </label>
                <textarea
                  value={cancellationMessage}
                  onChange={(e) => setCancellationMessage(e.target.value)}
                  rows={2}
                  placeholder="Optional message to include in cancellation email"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Summary</h4>
            <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-300">
              <li>✓ Old attendee: Registration will be cancelled, access removed</li>
              <li>✓ New attendee: Will receive welcome email with portal access</li>
              <li>
                ✓ Billing:{' '}
                {additionalItems.length > 0 ? (
                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                    New invoice will be created for {additionalItems.length}{' '}
                    {additionalItems.length === 1 ? 'item' : 'items'}
                  </span>
                ) : (
                  'No changes to existing invoice'
                )}
              </li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleClose}
              disabled={replaceMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || replaceMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {replaceMutation.isPending ? 'Replacing...' : 'Replace Attendee'}
            </button>
          </div>

          {replaceMutation.isError && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 rounded text-sm">
              {replaceMutation.error instanceof Error
                ? replaceMutation.error.message
                : 'Failed to replace attendee. Please try again.'}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
