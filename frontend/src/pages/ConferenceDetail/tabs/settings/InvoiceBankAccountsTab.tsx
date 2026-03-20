import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { validateIBAN } from 'ibantools';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import type { Conference } from '../../../../types';

interface BankAccount {
  bank_name: string;
  iban: string;
  bic: string | null;
  is_default: boolean;
}

export default function InvoiceBankAccountsTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Bank accounts state
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // Edit state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editBankName, setEditBankName] = useState('');
  const [editIban, setEditIban] = useState('');
  const [editBic, setEditBic] = useState('');
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [editIbanError, setEditIbanError] = useState<string | null>(null);
  const [editBicError, setEditBicError] = useState<string | null>(null);

  // New bank account form state
  const [newBankName, setNewBankName] = useState('');
  const [newIban, setNewIban] = useState('');
  const [newBic, setNewBic] = useState('');
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [ibanError, setIbanError] = useState<string | null>(null);
  const [bicError, setBicError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  // Fetch invoice settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: queryKeys.invoiceSettings(conference.id),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conference.id}/settings/invoice-settings`);
      return res.data;
    },
  });

  // Update form state when settings load
  useEffect(() => {
    if (settings) {
      const info = settings.invoice_company_info || {};

      // Load bank accounts (array or legacy single fields)
      if (info.bank_accounts && info.bank_accounts.length > 0) {
        setBankAccounts(info.bank_accounts);
      } else if (info.bank_name || info.iban) {
        // Migrate legacy single bank fields to array
        setBankAccounts([
          {
            bank_name: info.bank_name || '',
            iban: info.iban || '',
            bic: info.bic || null,
            is_default: true,
          },
        ]);
      }
    }
  }, [settings]);

  // IBAN validation
  const validateIban = (iban: string): string | null => {
    if (!iban) return 'IBAN is required';
    const cleaned = iban.replace(/\s/g, '').toUpperCase();
    const validation = validateIBAN(cleaned);
    if (!validation.valid) {
      return 'Invalid IBAN format or checksum';
    }
    return null;
  };

  // BIC validation
  const validateBic = (bic: string): string | null => {
    if (!bic) return null; // BIC is optional
    const cleaned = bic.replace(/\s/g, '').toUpperCase();
    // BIC format: 4 chars (bank) + 2 chars (country) + 2 chars (location) + optional 3 chars (branch)
    const bicRegex = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
    if (!bicRegex.test(cleaned)) {
      return 'Invalid BIC format (must be 8 or 11 characters: AAAABBCCXXX)';
    }
    return null;
  };

  // Add bank account mutation (saves immediately)
  const addBankAccountMutation = useMutation({
    mutationFn: async (newAccount: BankAccount) => {
      // If marking as default, unmark all others
      const updatedAccounts = newAccount.is_default
        ? bankAccounts.map((acc) => ({ ...acc, is_default: false }))
        : bankAccounts;

      const allAccounts = [...updatedAccounts, newAccount];

      const payload = {
        invoice_company_info: {
          bank_accounts: allAccounts,
        },
      };

      console.log('[BANK ACCOUNTS] Adding and saving:', JSON.stringify(payload, null, 2));

      const res = await api.put(`/conferences/${conference.id}/settings/invoice-settings`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoiceSettings(conference.id) });
      showToast('Bank account added and saved successfully', 'success');
      setError(null);
      // Reset form
      setNewBankName('');
      setNewIban('');
      setNewBic('');
      setNewIsDefault(false);
      setIbanError(null);
      setBicError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  // Add bank account
  const handleAddBankAccount = () => {
    const ibanErr = validateIban(newIban);
    if (ibanErr) {
      setIbanError(ibanErr);
      return;
    }

    const bicErr = validateBic(newBic);
    if (bicErr) {
      setBicError(bicErr);
      return;
    }

    const newAccount: BankAccount = {
      bank_name: newBankName.trim(),
      iban: newIban.replace(/\s/g, '').toUpperCase(),
      bic: newBic ? newBic.replace(/\s/g, '').toUpperCase() : null,
      is_default: newIsDefault || bankAccounts.length === 0,
    };

    // Save immediately
    addBankAccountMutation.mutate(newAccount);
  };

  // Remove bank account mutation (saves immediately)
  const removeBankAccountMutation = useMutation({
    mutationFn: async (index: number) => {
      const account = bankAccounts[index];
      const updated = bankAccounts.filter((_, i) => i !== index);

      // If removing default account and others exist, mark first as default
      if (account.is_default && updated.length > 0) {
        updated[0].is_default = true;
      }

      const payload = {
        invoice_company_info: {
          bank_accounts: updated,
        },
      };

      const res = await api.put(`/conferences/${conference.id}/settings/invoice-settings`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoiceSettings(conference.id) });
      showToast('Bank account removed successfully', 'success');
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  // Remove bank account
  const handleRemoveBankAccount = (index: number) => {
    removeBankAccountMutation.mutate(index);
  };

  // Edit bank account mutation (saves immediately)
  const editBankAccountMutation = useMutation({
    mutationFn: async (params: { index: number; updatedAccount: BankAccount }) => {
      const { index, updatedAccount } = params;
      const updated = [...bankAccounts];

      // If marking as default, unmark all others
      if (updatedAccount.is_default) {
        updated.forEach((acc, i) => {
          if (i !== index) acc.is_default = false;
        });
      }

      updated[index] = updatedAccount;

      const payload = {
        invoice_company_info: {
          bank_accounts: updated,
        },
      };

      const res = await api.put(`/conferences/${conference.id}/settings/invoice-settings`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoiceSettings(conference.id) });
      showToast('Bank account updated successfully', 'success');
      setError(null);
      setEditingIndex(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  // Start editing
  const handleStartEdit = (index: number) => {
    const account = bankAccounts[index];
    setEditingIndex(index);
    setEditBankName(account.bank_name);
    setEditIban(account.iban);
    setEditBic(account.bic || '');
    setEditIsDefault(account.is_default);
    setEditIbanError(null);
    setEditBicError(null);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditBankName('');
    setEditIban('');
    setEditBic('');
    setEditIsDefault(false);
    setEditIbanError(null);
    setEditBicError(null);
  };

  // Save edit
  const handleSaveEdit = () => {
    const ibanErr = validateIban(editIban);
    if (ibanErr) {
      setEditIbanError(ibanErr);
      return;
    }

    const bicErr = validateBic(editBic);
    if (bicErr) {
      setEditBicError(bicErr);
      return;
    }

    const updatedAccount: BankAccount = {
      bank_name: editBankName.trim(),
      iban: editIban.replace(/\s/g, '').toUpperCase(),
      bic: editBic ? editBic.replace(/\s/g, '').toUpperCase() : null,
      is_default: editIsDefault,
    };

    editBankAccountMutation.mutate({ index: editingIndex!, updatedAccount });
  };

  if (settingsLoading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Bank Accounts</h2>

      {error && <ErrorBanner message={error} />}

      {/* Existing Bank Accounts */}
      <div className="space-y-4 mb-8">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Existing Accounts</h3>
        {bankAccounts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No bank accounts configured</p>
        ) : (
          <div className="space-y-3">
            {bankAccounts.map((account, index) => (
              <div
                key={index}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                {editingIndex === index ? (
                  // Edit mode
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Bank Name
                      </label>
                      <input
                        type="text"
                        value={editBankName}
                        onChange={(e) => setEditBankName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        IBAN <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editIban}
                        onChange={(e) => {
                          setEditIban(e.target.value);
                          if (editIbanError) setEditIbanError(null);
                        }}
                        onBlur={() => {
                          const err = validateIban(editIban);
                          setEditIbanError(err);
                        }}
                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 ${
                          editIbanError
                            ? 'border-red-500 dark:border-red-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      />
                      {editIbanError && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {editIbanError}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        BIC (optional)
                      </label>
                      <input
                        type="text"
                        value={editBic}
                        onChange={(e) => {
                          setEditBic(e.target.value);
                          if (editBicError) setEditBicError(null);
                        }}
                        onBlur={() => {
                          const err = validateBic(editBic);
                          setEditBicError(err);
                        }}
                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 ${
                          editBicError
                            ? 'border-red-500 dark:border-red-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      />
                      {editBicError && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {editBicError}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`edit-is-default-${index}`}
                        checked={editIsDefault}
                        onChange={(e) => setEditIsDefault(e.target.checked)}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <label
                        htmlFor={`edit-is-default-${index}`}
                        className="text-sm text-gray-700 dark:text-gray-300"
                      >
                        Set as default bank account
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={editBankAccountMutation.isPending}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {editBankAccountMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={editBankAccountMutation.isPending}
                        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {account.bank_name}
                        </p>
                        {account.is_default && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                        IBAN: {account.iban}
                      </p>
                      {account.bic && (
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          BIC: {account.bic}
                        </p>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleStartEdit(index)}
                          className="p-2 text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                          title="Edit bank account"
                        >
                          <svg
                            className="w-5 h-5"
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
                        <button
                          onClick={() => handleRemoveBankAccount(index)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Remove bank account"
                        >
                          <svg
                            className="w-5 h-5"
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
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add New Bank Account */}
      {isAdmin && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Add Bank Account
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Bank Name
              </label>
              <input
                type="text"
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                IBAN <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newIban}
                onChange={(e) => {
                  setNewIban(e.target.value);
                  if (ibanError) setIbanError(null);
                }}
                onBlur={() => {
                  const err = validateIban(newIban);
                  setIbanError(err);
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 ${
                  ibanError
                    ? 'border-red-500 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              {ibanError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{ibanError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                BIC (optional)
              </label>
              <input
                type="text"
                value={newBic}
                onChange={(e) => {
                  setNewBic(e.target.value);
                  if (bicError) setBicError(null);
                }}
                onBlur={() => {
                  const err = validateBic(newBic);
                  setBicError(err);
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 ${
                  bicError
                    ? 'border-red-500 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              {bicError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{bicError}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="new-is-default"
                checked={newIsDefault}
                onChange={(e) => setNewIsDefault(e.target.checked)}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="new-is-default" className="text-sm text-gray-700 dark:text-gray-300">
                Set as default bank account
              </label>
            </div>

            <button
              onClick={handleAddBankAccount}
              disabled={!newIban || addBankAccountMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addBankAccountMutation.isPending ? 'Adding...' : 'Add Bank Account'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
