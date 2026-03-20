import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Conference } from '../../../../types';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';

interface SpeakerExpenseSettings {
  expenses_enabled: boolean;
}

interface ExpenseTier {
  id: string;
  name: string;
  max_amount: number;
  currency: string;
  sort_order: number;
  is_active: boolean;
  conference_id: string;
}

function SpeakerExpenseSettingsTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [newTierName, setNewTierName] = useState('');
  const [newTierAmount, setNewTierAmount] = useState('');
  const [newTierCurrency, setNewTierCurrency] = useState('EUR');
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState('');

  // Fetch settings
  const { data: settings } = useQuery({
    queryKey: queryKeys.speakerExpenses.settings(conference.id),
    queryFn: async () => {
      const { data } = await api.get<SpeakerExpenseSettings>(
        `/conferences/${conference.id}/settings/speaker-expense-settings`
      );
      return data;
    },
  });

  // Fetch tiers
  const { data: tiers = [] } = useQuery({
    queryKey: queryKeys.speakerExpenses.tiers(conference.id),
    queryFn: async () => {
      const { data } = await api.get<ExpenseTier[]>(
        `/conferences/${conference.id}/speaker-expenses/tiers`
      );
      return data;
    },
  });

  // Toggle expenses enabled
  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await api.put(`/conferences/${conference.id}/settings/speaker-expense-settings`, {
        expenses_enabled: enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.speakerExpenses.settings(conference.id),
      });
    },
  });

  // Create tier
  const createTierMutation = useMutation({
    mutationFn: async (data: { name: string; max_amount: number; currency: string }) => {
      await api.post(`/conferences/${conference.id}/speaker-expenses/tiers`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.speakerExpenses.tiers(conference.id),
      });
      setNewTierName('');
      setNewTierAmount('');
    },
  });

  // Update tier
  const updateTierMutation = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name: string;
      max_amount: number;
      currency: string;
    }) => {
      await api.put(`/conferences/${conference.id}/speaker-expenses/tiers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.speakerExpenses.tiers(conference.id),
      });
      setEditingTier(null);
    },
  });

  // Delete tier
  const deleteTierMutation = useMutation({
    mutationFn: async (tierId: string) => {
      await api.delete(`/conferences/${conference.id}/speaker-expenses/tiers/${tierId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.speakerExpenses.tiers(conference.id),
      });
    },
  });

  const handleToggle = useCallback(() => {
    toggleMutation.mutate(!settings?.expenses_enabled);
  }, [settings?.expenses_enabled, toggleMutation]);

  const handleCreateTier = useCallback(() => {
    const amount = parseFloat(newTierAmount);
    if (!newTierName.trim() || isNaN(amount) || amount <= 0) return;
    createTierMutation.mutate({
      name: newTierName.trim(),
      max_amount: amount,
      currency: newTierCurrency,
    });
  }, [newTierName, newTierAmount, newTierCurrency, createTierMutation]);

  const startEditing = useCallback((tier: ExpenseTier) => {
    setEditingTier(tier.id);
    setEditName(tier.name);
    setEditAmount(String(tier.max_amount));
    setEditCurrency(tier.currency);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingTier) return;
    const amount = parseFloat(editAmount);
    if (!editName.trim() || isNaN(amount) || amount <= 0) return;
    updateTierMutation.mutate({
      id: editingTier,
      name: editName.trim(),
      max_amount: amount,
      currency: editCurrency,
    });
  }, [editingTier, editName, editAmount, editCurrency, updateTierMutation]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Speaker Expenses</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Enable speaker expense submissions and manage expense tiers.
        </p>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Enable Speaker Expenses
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              When enabled, accepted speakers can submit expenses via the portal.
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={!isAdmin || toggleMutation.isPending}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings?.expenses_enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
            } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings?.expenses_enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Expense Tiers */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Expense Tiers</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Define budget tiers that can be assigned to speakers (e.g. &ldquo;Speaker 700
            EUR&rdquo;, &ldquo;Keynote 1500 EUR&rdquo;).
          </p>
        </div>

        {/* Existing tiers */}
        {tiers.length > 0 && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {tiers.map((tier) => (
              <div key={tier.id} className="px-4 py-3 flex items-center gap-3">
                {editingTier === tier.id ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm"
                    />
                    <input
                      type="number"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-28 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm"
                      step="0.01"
                      min="0"
                    />
                    <input
                      type="text"
                      value={editCurrency}
                      onChange={(e) => setEditCurrency(e.target.value.toUpperCase())}
                      maxLength={3}
                      className="w-16 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm"
                    />
                    <button
                      onClick={handleSaveEdit}
                      disabled={updateTierMutation.isPending}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingTier(null)}
                      className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-300"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {tier.name}
                      </span>
                      {!tier.is_active && (
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                          (inactive)
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {Number(tier.max_amount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}{' '}
                      {tier.currency}
                    </span>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditing(tier)}
                          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-300"
                          title="Edit"
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
                              strokeWidth={1.5}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete tier "${tier.name}"?`)) {
                              deleteTierMutation.mutate(tier.id);
                            }
                          }}
                          className="text-sm text-red-500 hover:text-red-700"
                          title="Delete"
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
                              strokeWidth={1.5}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add new tier */}
        {isAdmin && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Tier name (e.g. Speaker)"
                value={newTierName}
                onChange={(e) => setNewTierName(e.target.value)}
                className="flex-1 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                placeholder="Amount"
                value={newTierAmount}
                onChange={(e) => setNewTierAmount(e.target.value)}
                className="w-28 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1.5 text-sm"
                step="0.01"
                min="0"
              />
              <input
                type="text"
                value={newTierCurrency}
                onChange={(e) => setNewTierCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                className="w-16 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1.5 text-sm"
              />
              <button
                onClick={handleCreateTier}
                disabled={!newTierName.trim() || !newTierAmount || createTierMutation.isPending}
                className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {tiers.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No expense tiers defined yet. Add tiers above to create budget categories for speakers.
          </div>
        )}
      </div>
    </div>
  );
}

export default SpeakerExpenseSettingsTab;
