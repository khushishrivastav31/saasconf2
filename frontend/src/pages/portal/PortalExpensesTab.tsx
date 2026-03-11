import { useState, useRef } from 'react';
import { useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

interface PortalExpense {
  id: string;
  conference_id: string;
  conference_name: string | null;
  title: string;
  category_id: string | null;
  category_name: string | null;
  description: string | null;
  expense_date: string;
  original_amount: number;
  original_currency: string;
  session_id: string | null;
  session_title: string | null;
  status: string;
  rejection_reason: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PortalAllowance {
  conference_id: string;
  conference_name: string | null;
  max_amount: number;
  currency: string;
  total_claimed: number;
  total_approved: number;
  remaining: number;
}

interface PortalAttachment {
  id: string;
  filename: string;
  content_type: string;
  file_size: number;
}

interface PortalCurrency {
  code: string;
  name: string;
  symbol: string;
}

const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  paid: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

export default function PortalExpensesTab() {
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [createError, setCreateError] = useState('');
  const [newExpense, setNewExpense] = useState({
    title: '',
    expense_date: new Date().toISOString().split('T')[0],
    original_amount: '',
    original_currency: 'EUR',
    description: '',
    notes: '',
  });

  // ── Queries ──

  const { data: expensesData, isLoading } = useQuery({
    queryKey: ['portal-expenses', conferenceId],
    queryFn: async () => {
      const { data } = await portalApi.get<{ items: PortalExpense[]; total: number }>(
        '/portal/expenses',
        { params: { conference_id: conferenceId } }
      );
      return data;
    },
    enabled: !!conferenceId,
  });

  const { data: allowancesData } = useQuery({
    queryKey: ['portal-expense-allowances', conferenceId],
    queryFn: async () => {
      const { data } = await portalApi.get<{ items: PortalAllowance[] }>(
        '/portal/expenses/allowances',
        { params: { conference_id: conferenceId } }
      );
      return data;
    },
    enabled: !!conferenceId,
  });

  const { data: currenciesData } = useQuery({
    queryKey: ['portal-currencies'],
    queryFn: async () => {
      const { data } = await portalApi.get<{ items: PortalCurrency[] }>('/portal/currencies');
      return data;
    },
    staleTime: 5 * 60 * 1000, // currencies rarely change
  });

  const currencies = currenciesData?.items ?? [];

  // ── Mutations ──

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['portal-expenses', conferenceId] });
    queryClient.invalidateQueries({ queryKey: ['portal-expense-allowances', conferenceId] });
  };

  const createExpense = useMutation({
    mutationFn: async () => {
      if (!conferenceId) throw new Error('No conference selected.');
      setCreateError('');
      const { data } = await portalApi.post('/portal/expenses', {
        conference_id: conferenceId,
        title: newExpense.title,
        expense_date: newExpense.expense_date,
        original_amount: Number(newExpense.original_amount),
        original_currency: newExpense.original_currency,
        description: newExpense.description || null,
        notes: newExpense.notes || null,
      });
      return data as PortalExpense;
    },
    onSuccess: async (expense) => {
      // Upload receipt if selected
      if (receiptFile && expense?.id) {
        const form = new FormData();
        form.append('file', receiptFile);
        form.append('entity_type', 'speaker_expense');
        form.append('entity_id', expense.id);
        form.append('description', 'Receipt');
        try {
          await portalApi.post('/portal/attachments', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          // Expense created but receipt upload failed — user can re-upload later
        }
      }
      invalidate();
      setShowNewForm(false);
      setReceiptFile(null);
      setFileError('');
      setCreateError('');
      setNewExpense({
        title: '',
        expense_date: new Date().toISOString().split('T')[0],
        original_amount: '',
        original_currency: 'EUR',
        description: '',
        notes: '',
      });
    },
    onError: (error: Error) => {
      setCreateError(error.message || 'Failed to create expense');
    },
  });

  const submitExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      await portalApi.post(`/portal/expenses/${expenseId}/submit`);
    },
    onSuccess: invalidate,
  });

  const deleteExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      await portalApi.delete(`/portal/expenses/${expenseId}`);
    },
    onSuccess: invalidate,
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError('');
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setFileError('Only images (JPEG, PNG, WebP, HEIC) and PDF files are allowed.');
      setReceiptFile(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError('File is too large. Maximum size is 10 MB.');
      setReceiptFile(null);
      return;
    }
    setReceiptFile(file);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  const expenses = expensesData?.items || [];
  const allowances = allowancesData?.items || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">My Expenses</h1>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="text-sm px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          {showNewForm ? 'Cancel' : 'New Expense'}
        </button>
      </div>

      {/* Allowance summary */}
      {allowances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allowances.map((a) => (
            <div
              key={a.conference_id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                {a.conference_name || 'Conference'}
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Allowance:</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">
                  {a.max_amount.toLocaleString()} {a.currency}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Claimed:</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {a.total_claimed.toLocaleString()} {a.currency}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Remaining:</span>
                <span
                  className={`font-medium ${a.remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
                >
                  {a.remaining.toLocaleString()} {a.currency}
                </span>
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${a.total_approved / a.max_amount > 0.9 ? 'bg-red-500' : a.total_approved / a.max_amount > 0.75 ? 'bg-amber-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min((a.total_approved / a.max_amount) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New expense form */}
      {showNewForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">New Expense</h3>
          {createError && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">
              {createError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Title</label>
              <input
                type="text"
                value={newExpense.title}
                onChange={(e) => setNewExpense({ ...newExpense, title: e.target.value })}
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Date</label>
              <input
                type="date"
                value={newExpense.expense_date}
                onChange={(e) => setNewExpense({ ...newExpense, expense_date: e.target.value })}
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                value={newExpense.original_amount}
                onChange={(e) => setNewExpense({ ...newExpense, original_amount: e.target.value })}
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                Currency
              </label>
              <select
                value={newExpense.original_currency}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, original_currency: e.target.value })
                }
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={newExpense.description}
              onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
              rows={2}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>
          {/* Receipt upload */}
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Receipt</label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                <span className="inline-flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  Upload Receipt
                </span>
              </button>
              {receiptFile && (
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <svg
                    className="w-4 h-4 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="truncate max-w-50">{receiptFile.name}</span>
                  <button
                    onClick={() => {
                      setReceiptFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            {fileError && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fileError}</p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Images (JPEG, PNG, WebP) or PDF. Max 10 MB.
            </p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => createExpense.mutate()}
              disabled={
                !newExpense.title.trim() ||
                !newExpense.original_amount ||
                !conferenceId ||
                createExpense.isPending
              }
              className="text-sm px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {createExpense.isPending ? 'Creating...' : 'Create Expense'}
            </button>
          </div>
        </div>
      )}

      {/* Expenses list */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                Date
              </th>
              <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                Title
              </th>
              <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                Amount
              </th>
              <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                Receipt
              </th>
              <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                Status
              </th>
              <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {expenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                onSubmit={() => submitExpense.mutate(expense.id)}
                onDelete={() => {
                  if (confirm('Delete this expense?')) deleteExpense.mutate(expense.id);
                }}
              />
            ))}
          </tbody>
        </table>
        {expenses.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            No expenses yet. Create your first expense claim.
          </div>
        )}
      </div>
    </div>
  );
}

// Separate row component to handle per-expense attachment queries
function ExpenseRow({
  expense,
  onSubmit,
  onDelete,
}: {
  expense: PortalExpense;
  onSubmit: () => void;
  onDelete: () => void;
}) {
  const { data: attachments } = useQuery({
    queryKey: ['portal-expense-attachments', expense.id],
    queryFn: async () => {
      const { data } = await portalApi.get<{ items: PortalAttachment[] }>(
        `/portal/expenses/${expense.id}/attachments`
      );
      return data.items;
    },
  });

  const hasReceipt = attachments && attachments.length > 0;

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
      <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{expense.expense_date}</td>
      <td className="px-4 py-3">
        <div className="text-gray-900 dark:text-gray-100">{expense.title}</div>
        {expense.rejection_reason && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
            Rejected: {expense.rejection_reason}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
        {expense.original_amount.toLocaleString()} {expense.original_currency}
      </td>
      <td className="px-4 py-3 text-center">
        {hasReceipt ? (
          <svg
            className="w-4 h-4 mx-auto text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        ) : (
          <svg
            className="w-4 h-4 mx-auto text-gray-300 dark:text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[expense.status] || ''}`}
        >
          {expense.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          {expense.status === 'draft' && (
            <>
              <button
                onClick={onSubmit}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
              >
                Submit
              </button>
              <button
                onClick={onDelete}
                className="text-xs text-red-600 dark:text-red-400 hover:underline"
              >
                Delete
              </button>
            </>
          )}
          {expense.status === 'rejected' && (
            <span className="text-xs text-gray-500 dark:text-gray-400">Edit to re-submit</span>
          )}
          {expense.status === 'paid' && expense.payment_reference && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Ref: {expense.payment_reference}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
