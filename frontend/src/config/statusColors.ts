export const PAPER_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  in_evaluation: "bg-yellow-100 text-yellow-700",
  evaluated: "bg-purple-100 text-purple-700",
  final_consideration: "bg-indigo-100 text-indigo-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export const PAPER_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_evaluation: "In Evaluation",
  evaluated: "Evaluated",
  final_consideration: "Final Consideration",
  accepted: "Accepted",
  rejected: "Rejected",
};

export const LEVEL_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  all_levels: "All Levels",
};

export const INVITATION_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
};

export const CFP_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  open: "bg-green-100 text-green-800",
  closed: "bg-red-100 text-red-800",
  review: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
};
