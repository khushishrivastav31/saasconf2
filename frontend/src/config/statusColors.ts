export const PAPER_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  submitted: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  in_evaluation: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  evaluated: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  final_consideration: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  accepted: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  rejected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

export const PAPER_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  in_evaluation: 'In Evaluation',
  evaluated: 'Evaluated',
  final_consideration: 'Final Consideration',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

export const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  all_levels: 'All Levels',
};

export const INVITATION_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  accepted: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  declined: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

export const CFP_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300',
  open: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  closed: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  review: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
  completed: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
};

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  paid: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  overdue: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  cancelled: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
};

export const EXPENSE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  submitted: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  approved: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  rejected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  paid: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
};

export const REGISTRATION_STATUS_COLORS: Record<string, string> = {
  registered_pending_invoice:
    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
  invoiced: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  paid: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
};
