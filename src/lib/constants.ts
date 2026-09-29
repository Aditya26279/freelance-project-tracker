export const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD", "AED"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const PROJECT_STATUSES = ["active", "on_hold", "completed", "archived"] as const;
export const MILESTONE_STATUSES = [
  "pending",
  "in_progress",
  "submitted",
  "changes_requested",
  "approved",
] as const;
export const PROPOSAL_STATUSES = ["draft", "sent", "accepted", "declined"] as const;
export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export const PAYMENT_PROVIDERS = ["none", "stripe", "razorpay"] as const;

export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
  pending: "Not started",
  in_progress: "In progress",
  submitted: "Awaiting approval",
  changes_requested: "Changes requested",
  approved: "Approved",
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  paid: "Paid",
  void: "Void",
  overdue: "Overdue",
};
