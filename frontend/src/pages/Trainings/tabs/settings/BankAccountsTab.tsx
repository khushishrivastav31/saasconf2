import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';

interface BankAccount {
  bank_name: string;
  iban: string;
  bic: string;
  is_default: boolean;
}

interface BankAccountsResponse {
  bank_accounts: BankAccount[];
}

const EMPTY_ACCOUNT: BankAccount = { bank_name: '', iban: '', bic: '', is_default: false };

export default function BankAccountsTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery<BankAccountsResponse>({
    queryKey: [...queryKeys.trainingFinance, 'bank-accounts'],
    queryFn: async () => {
      const res = await api.get('/trainings/finance/bank-accounts');
      return res.data;
    },
  });

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setAccounts(data.bank_accounts || []);
      setIsDirty(false);
    }
  }, [data]);

  const updateAccount = (index: number, key: keyof BankAccount, value: string | boolean) => {
    setAccounts((prev) => {
      const updated = [...prev];
      if (key === 'is_default' && value === true) {
        // Only one default
        updated.forEach((a, i) => {
          updated[i] = { ...a, is_default: i === index };
        });
      } else {
        updated[index] = { ...updated[index], [key]: value };
      }
      return updated;
    });
    setIsDirty(true);
  };

  const addAccount = () => {
    const isFirst = accounts.length === 0;
    setAccounts((prev) => [...prev, { ...EMPTY_ACCOUNT, is_default: isFirst }]);
    setIsDirty(true);
  };

  const removeAccount = (index: number) => {
    setAccounts((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      // If removed the default, mark first as default
      if (prev[index]?.is_default && updated.length > 0) {
        updated[0] = { ...updated[0], is_default: true };
      }
      return updated;
    });
    setIsDirty(true);
  };

  const mutation = useMutation({
    mutationFn: async (payload: BankAccount[]) => {
      await api.put('/trainings/finance/bank-accounts', { bank_accounts: payload });
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingFinance });
      showToast('Bank accounts saved', 'success');
    },
    onError: (err: unknown) => showToast(parseApiError(err), 'error'),
  });

  const handleDiscard = () => {
    if (data) {
      setAccounts(data.bank_accounts || []);
      setIsDirty(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Bank Accounts</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Bank accounts shown on training invoices for bank transfer payments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={handleDiscard}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Discard
            </button>
          )}
          <button
            onClick={() => mutation.mutate(accounts)}
            disabled={!isDirty || mutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {mutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {accounts.length === 0 && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No bank accounts configured yet.
          </div>
        )}

        {accounts.map((account, index) => (
          <div
            key={index}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Account {index + 1}
                </h4>
                {account.is_default && (
                  <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                    Default
                  </span>
                )}
              </div>
              <button
                onClick={() => removeAccount(index)}
                className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
              >
                Remove
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={account.bank_name}
                  onChange={(e) => updateAccount(index, 'bank_name', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    IBAN
                  </label>
                  <input
                    type="text"
                    value={account.iban}
                    onChange={(e) => updateAccount(index, 'iban', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    BIC
                  </label>
                  <input
                    type="text"
                    value={account.bic}
                    onChange={(e) => updateAccount(index, 'bic', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              {!account.is_default && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={account.is_default}
                    onChange={(e) => updateAccount(index, 'is_default', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Set as default account
                  </span>
                </label>
              )}
            </div>
          </div>
        ))}

        <button
          onClick={addAccount}
          className="w-full px-4 py-3 text-sm font-medium text-primary-600 dark:text-primary-400 bg-white dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          + Add Bank Account
        </button>
      </div>
    </div>
  );
}
