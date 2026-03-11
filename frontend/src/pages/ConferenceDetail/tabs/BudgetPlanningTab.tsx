import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { queryKeys } from '../../../config/queryKeys';
import { formatCurrency } from '../../../utils/formatCurrency';
import type { Conference } from '../../../types';
import type { Budget, BudgetCategory, BudgetLineItem } from '../../../types/conference';

interface BudgetPlanningTabProps {
  conference: Conference;
  isAdmin: boolean;
}

export default function BudgetPlanningTab({ conference, isAdmin }: BudgetPlanningTabProps) {
  const queryClient = useQueryClient();
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newBudgetName, setNewBudgetName] = useState('');
  const [showCategories, setShowCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<BudgetLineItem>>({});
  const [newItem, setNewItem] = useState({
    description: '',
    planned_amount: 0,
    actual_amount: 0,
    category_id: '' as string | null,
    vendor_name: '',
  });

  // ── Queries ──

  const { data: budgetsData } = useQuery({
    queryKey: queryKeys.budgets.byConference(conference.id),
    queryFn: async () => {
      const { data } = await api.get(`/conferences/${conference.id}/budgets`);
      return data as { items: Budget[]; total: number };
    },
  });

  const { data: categories } = useQuery({
    queryKey: queryKeys.budgets.categories(conference.id),
    queryFn: async () => {
      const { data } = await api.get(`/conferences/${conference.id}/budgets/categories`);
      return data as BudgetCategory[];
    },
  });

  const activeBudget = useMemo(() => {
    if (!budgetsData?.items) return null;
    if (selectedBudgetId) return budgetsData.items.find((b) => b.id === selectedBudgetId) || null;
    return budgetsData.items[0] || null;
  }, [budgetsData, selectedBudgetId]);

  const { data: budgetDetail } = useQuery({
    queryKey: queryKeys.budgets.detail(conference.id, activeBudget?.id || ''),
    queryFn: async () => {
      const { data } = await api.get(`/conferences/${conference.id}/budgets/${activeBudget!.id}`);
      return data as Budget;
    },
    enabled: !!activeBudget?.id,
  });

  // ── Mutations ──

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.budgets.byConference(conference.id) });
    if (activeBudget?.id) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.budgets.detail(conference.id, activeBudget.id),
      });
    }
  }, [queryClient, conference.id, activeBudget?.id]);

  const createBudget = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post(`/conferences/${conference.id}/budgets`, {
        name,
        currency: conference.currency || 'EUR',
      });
      return data;
    },
    onSuccess: () => {
      invalidate();
      setShowNewForm(false);
      setNewBudgetName('');
    },
  });

  const deleteBudget = useMutation({
    mutationFn: async (budgetId: string) => {
      await api.delete(`/conferences/${conference.id}/budgets/${budgetId}`);
    },
    onSuccess: () => {
      invalidate();
      setSelectedBudgetId(null);
    },
  });

  const createItem = useMutation({
    mutationFn: async () => {
      await api.post(`/conferences/${conference.id}/budgets/${activeBudget!.id}/items`, {
        description: newItem.description,
        planned_amount: newItem.planned_amount,
        actual_amount: newItem.actual_amount,
        category_id: newItem.category_id || null,
        vendor_name: newItem.vendor_name || null,
      });
    },
    onSuccess: () => {
      invalidate();
      setNewItem({
        description: '',
        planned_amount: 0,
        actual_amount: 0,
        category_id: null,
        vendor_name: '',
      });
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ itemId, values }: { itemId: string; values: Partial<BudgetLineItem> }) => {
      await api.put(
        `/conferences/${conference.id}/budgets/${activeBudget!.id}/items/${itemId}`,
        values
      );
    },
    onSuccess: () => {
      invalidate();
      setEditingItemId(null);
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      await api.delete(`/conferences/${conference.id}/budgets/${activeBudget!.id}/items/${itemId}`);
    },
    onSuccess: invalidate,
  });

  const invalidateCategories = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.budgets.categories(conference.id) });
  }, [queryClient, conference.id]);

  const createCategory = useMutation({
    mutationFn: async () => {
      await api.post(`/conferences/${conference.id}/budgets/categories`, {
        name: newCategoryName,
        color: newCategoryColor,
      });
    },
    onSuccess: () => {
      invalidateCategories();
      setNewCategoryName('');
      setNewCategoryColor('#6366f1');
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (categoryId: string) => {
      await api.delete(`/conferences/${conference.id}/budgets/categories/${categoryId}`);
    },
    onSuccess: invalidateCategories,
  });

  const currency = activeBudget?.currency || conference.currency || 'EUR';
  const items = useMemo(() => budgetDetail?.items || [], [budgetDetail?.items]);
  const totalPlanned = budgetDetail?.total_planned || 0;
  const totalActual = budgetDetail?.total_actual || 0;
  const totalRemaining = totalPlanned - totalActual;
  const pctUsed = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

  const pctColor =
    pctUsed > 90
      ? 'text-red-600 dark:text-red-400'
      : pctUsed > 75
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-green-600 dark:text-green-400';

  // Group items by category
  interface CategoryGroup {
    categoryId: string | null;
    categoryName: string;
    color: string | null;
    items: BudgetLineItem[];
    totalPlanned: number;
    totalActual: number;
    totalVariance: number;
  }

  const categoryGroups = useMemo(() => {
    const groups: Record<string, CategoryGroup> = {};
    for (const item of items) {
      const key = item.category_id || '__uncategorized__';
      if (!groups[key]) {
        // Find category color from the categories list
        const cat = categories?.find((c) => c.id === item.category_id);
        groups[key] = {
          categoryId: item.category_id,
          categoryName: item.category_name || 'Uncategorized',
          color: cat?.color || null,
          items: [],
          totalPlanned: 0,
          totalActual: 0,
          totalVariance: 0,
        };
      }
      groups[key].items.push(item);
      groups[key].totalPlanned += Number(item.planned_amount);
      groups[key].totalActual += Number(item.actual_amount);
      groups[key].totalVariance += Number(item.variance);
    }
    // Sort: named categories first (alphabetically), uncategorized last
    return Object.values(groups).sort((a, b) => {
      if (!a.categoryId) return 1;
      if (!b.categoryId) return -1;
      return a.categoryName.localeCompare(b.categoryName);
    });
  }, [items, categories]);

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (key: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Budget Planning</h2>
        <div className="flex items-center gap-2">
          {budgetsData?.items && budgetsData.items.length > 1 && (
            <select
              value={selectedBudgetId || activeBudget?.id || ''}
              onChange={(e) => setSelectedBudgetId(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              {budgetsData.items.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowNewForm(true)}
              className="text-sm px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              New Budget
            </button>
          )}
        </div>
      </div>

      {/* New budget form */}
      {showNewForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <input
            type="text"
            placeholder="Budget name..."
            value={newBudgetName}
            onChange={(e) => setNewBudgetName(e.target.value)}
            className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <button
            onClick={() => createBudget.mutate(newBudgetName)}
            disabled={!newBudgetName.trim()}
            className="text-sm px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            Create
          </button>
          <button
            onClick={() => setShowNewForm(false)}
            className="text-sm px-3 py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Cancel
          </button>
        </div>
      )}

      {!activeBudget && !showNewForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            No budgets yet. Create one to start planning.
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowNewForm(true)}
              className="text-sm px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Create Budget
            </button>
          )}
        </div>
      )}

      {activeBudget && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Total Budget
              </p>
              <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-1">
                {formatCurrency(totalPlanned, currency)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Total Spent
              </p>
              <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-1">
                {formatCurrency(totalActual, currency)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Remaining
              </p>
              <p
                className={`text-xl font-semibold mt-1 ${totalRemaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}
              >
                {formatCurrency(totalRemaining, currency)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                % Used
              </p>
              <p className={`text-xl font-semibold mt-1 ${pctColor}`}>{pctUsed.toFixed(1)}%</p>
            </div>
          </div>

          {/* Budget actions */}
          {isAdmin && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  if (confirm(`Delete budget "${activeBudget.name}"?`))
                    deleteBudget.mutate(activeBudget.id);
                }}
                className="text-sm px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
              >
                Delete Budget
              </button>
            </div>
          )}

          {/* Category management */}
          {isAdmin && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowCategories(!showCategories)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <span>Manage Categories ({categories?.length || 0})</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showCategories ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {showCategories && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
                  {/* Existing categories */}
                  <div className="flex flex-wrap gap-2">
                    {categories?.map((cat) => (
                      <div
                        key={cat.id}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-full text-sm text-gray-900 dark:text-gray-100"
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color || '#6366f1' }}
                        />
                        {cat.name}
                        <button
                          onClick={() => {
                            if (confirm(`Delete category "${cat.name}"?`))
                              deleteCategory.mutate(cat.id);
                          }}
                          className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                    {(!categories || categories.length === 0) && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No categories yet.</p>
                    )}
                  </div>
                  {/* Add new category */}
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newCategoryColor}
                      onChange={(e) => setNewCategoryColor(e.target.value)}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    />
                    <input
                      type="text"
                      placeholder="New category name..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newCategoryName.trim()) createCategory.mutate();
                      }}
                      className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    <button
                      onClick={() => createCategory.mutate()}
                      disabled={!newCategoryName.trim()}
                      className="text-sm px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add new item form */}
          {isAdmin && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Add Line Item
              </p>
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Category
                  </label>
                  <select
                    value={newItem.category_id || ''}
                    onChange={(e) =>
                      setNewItem({ ...newItem, category_id: e.target.value || null })
                    }
                    className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">None</option>
                    {categories?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-50">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    placeholder="Description..."
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Planned
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={newItem.planned_amount || ''}
                    onChange={(e) =>
                      setNewItem({ ...newItem, planned_amount: Number(e.target.value) })
                    }
                    className="w-28 text-right text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Actual
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={newItem.actual_amount || ''}
                    onChange={(e) =>
                      setNewItem({ ...newItem, actual_amount: Number(e.target.value) })
                    }
                    className="w-28 text-right text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Vendor
                  </label>
                  <input
                    type="text"
                    placeholder="Vendor..."
                    value={newItem.vendor_name}
                    onChange={(e) => setNewItem({ ...newItem, vendor_name: e.target.value })}
                    className="w-32 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <button
                  onClick={() => createItem.mutate()}
                  disabled={!newItem.description.trim()}
                  className="text-sm px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Line items grouped by category */}
          <div className="space-y-3">
            {categoryGroups.map((group) => {
              const groupKey = group.categoryId || '__uncategorized__';
              const isCollapsed = collapsedCategories.has(groupKey);
              const groupVarianceColor =
                group.totalVariance < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400';

              return (
                <div
                  key={groupKey}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  {/* Category header */}
                  <button
                    onClick={() => toggleCategory(groupKey)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${!isCollapsed ? 'rotate-90' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8.25 4.5l7.5 7.5-7.5 7.5"
                        />
                      </svg>
                      {group.color && (
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: group.color }}
                        />
                      )}
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {group.categoryName}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-right">
                        <span className="text-gray-500 dark:text-gray-400 mr-1">Planned:</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {formatCurrency(group.totalPlanned, currency)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-500 dark:text-gray-400 mr-1">Actual:</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {formatCurrency(group.totalActual, currency)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-500 dark:text-gray-400 mr-1">Variance:</span>
                        <span className={`font-medium ${groupVarianceColor}`}>
                          {formatCurrency(group.totalVariance, currency)}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Category items */}
                  {!isCollapsed && (
                    <div className="border-t border-gray-200 dark:border-gray-700">
                      <table className="w-full text-sm table-fixed">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
                              Description
                            </th>
                            <th className="text-right px-4 py-2 text-gray-500 dark:text-gray-400 font-medium w-[14%]">
                              Planned
                            </th>
                            <th className="text-right px-4 py-2 text-gray-500 dark:text-gray-400 font-medium w-[14%]">
                              Actual
                            </th>
                            <th className="text-right px-4 py-2 text-gray-500 dark:text-gray-400 font-medium w-[14%]">
                              Variance
                            </th>
                            <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium w-[14%]">
                              Vendor
                            </th>
                            {isAdmin && (
                              <th className="px-4 py-2 text-gray-500 dark:text-gray-400 font-medium w-16"></th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {group.items.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                              {editingItemId === item.id ? (
                                <>
                                  <td className="px-4 py-2">
                                    <div className="flex gap-2">
                                      <select
                                        value={editValues.category_id || ''}
                                        onChange={(e) =>
                                          setEditValues({
                                            ...editValues,
                                            category_id: e.target.value || null,
                                          })
                                        }
                                        className="w-32 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                      >
                                        <option value="">None</option>
                                        {categories?.map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {c.name}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="text"
                                        value={editValues.description || ''}
                                        onChange={(e) =>
                                          setEditValues({
                                            ...editValues,
                                            description: e.target.value,
                                          })
                                        }
                                        className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="number"
                                      value={editValues.planned_amount || 0}
                                      onChange={(e) =>
                                        setEditValues({
                                          ...editValues,
                                          planned_amount: Number(e.target.value),
                                        })
                                      }
                                      className="w-full text-right text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="number"
                                      value={editValues.actual_amount || 0}
                                      onChange={(e) =>
                                        setEditValues({
                                          ...editValues,
                                          actual_amount: Number(e.target.value),
                                        })
                                      }
                                      className="w-full text-right text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    />
                                  </td>
                                  <td></td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="text"
                                      value={
                                        (editValues as Record<string, string>).vendor_name || ''
                                      }
                                      onChange={(e) =>
                                        setEditValues({
                                          ...editValues,
                                          vendor_name: e.target.value,
                                        })
                                      }
                                      className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() =>
                                          updateItem.mutate({ itemId: item.id, values: editValues })
                                        }
                                        className="text-xs text-primary-600 hover:underline"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => setEditingItemId(null)}
                                        className="text-xs text-gray-500 hover:underline"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">
                                    {item.description}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-gray-900 dark:text-gray-100">
                                    {formatCurrency(item.planned_amount, currency)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-gray-900 dark:text-gray-100">
                                    {formatCurrency(item.actual_amount, currency)}
                                  </td>
                                  <td
                                    className={`px-4 py-2.5 text-right ${item.variance < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
                                  >
                                    {formatCurrency(item.variance, currency)}
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">
                                    {item.vendor_name || '—'}
                                  </td>
                                  {isAdmin && (
                                    <td className="px-4 py-2.5">
                                      <div className="flex gap-1">
                                        <button
                                          onClick={() => {
                                            setEditingItemId(item.id);
                                            setEditValues({
                                              category_id: item.category_id,
                                              description: item.description,
                                              planned_amount: item.planned_amount,
                                              actual_amount: item.actual_amount,
                                              vendor_name: item.vendor_name,
                                            });
                                          }}
                                          className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
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
                                              strokeWidth={2}
                                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                            />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={() => {
                                            if (confirm('Delete this line item?'))
                                              deleteItem.mutate(item.id);
                                          }}
                                          className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
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
                                              strokeWidth={2}
                                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                            />
                                          </svg>
                                        </button>
                                      </div>
                                    </td>
                                  )}
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {items.length === 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                No line items yet. Add your first budget item below.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
