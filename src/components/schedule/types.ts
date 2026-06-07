export interface SchedulePhase {
  id: string;
  project_id: string;
  phase_number: number;
  phase_name: string;
  sub_phase_number: string;
  sub_phase_name: string;
  start_date: string | null;
  end_date: string | null;
}

export interface ScheduleMilestone {
  id: string;
  project_id: string;
  sub_phase_id: string;
  name: string;
  planned_date: string | null;
  actual_date: string | null;
  status: "Upcoming" | "In Progress" | "Complete" | "At Risk" | "Delayed";
  notes: string | null;
  is_custom: boolean;
  source?: "clickup" | "manual";
  created_at: string;
  updated_at: string;
}

export const PHASE_COLORS: Record<number, { bg: string; light: string; text: string }> = {
  1: { bg: "hsl(var(--chart-1))", light: "hsl(var(--chart-1) / 0.15)", text: "hsl(var(--chart-1))" },
  2: { bg: "hsl(var(--chart-2))", light: "hsl(var(--chart-2) / 0.15)", text: "hsl(var(--chart-2))" },
  3: { bg: "hsl(var(--chart-3))", light: "hsl(var(--chart-3) / 0.15)", text: "hsl(var(--chart-3))" },
  4: { bg: "hsl(var(--chart-4))", light: "hsl(var(--chart-4) / 0.15)", text: "hsl(var(--chart-4))" },
};

export const STATUS_COLORS: Record<string, string> = {
  "Upcoming": "hsl(var(--muted-foreground))",
  "In Progress": "hsl(var(--chart-1))",
  "Complete": "hsl(142 71% 45%)",
  "At Risk": "hsl(38 92% 50%)",
  "Delayed": "hsl(0 84% 60%)",
};

export const PHASE_STRUCTURE = [
  {
    phase_number: 1,
    phase_name: "Land Acquisition",
    sub_phases: [
      { sub_phase_number: "1.1", sub_phase_name: "Due Diligence" },
      { sub_phase_number: "1.2", sub_phase_name: "Entitlements" },
      { sub_phase_number: "1.3", sub_phase_name: "Closing" },
    ],
  },
  {
    phase_number: 2,
    phase_name: "Pre-Development",
    sub_phases: [
      { sub_phase_number: "2.1", sub_phase_name: "Feasibility" },
      { sub_phase_number: "2.2", sub_phase_name: "Design" },
      { sub_phase_number: "2.3", sub_phase_name: "Permitting" },
    ],
  },
  {
    phase_number: 3,
    phase_name: "Pre-Construction",
    sub_phases: [
      { sub_phase_number: "3.1", sub_phase_name: "GC Bidding & Selection" },
      { sub_phase_number: "3.2", sub_phase_name: "Capitalization" },
    ],
  },
  {
    phase_number: 4,
    phase_name: "Construction",
    sub_phases: [
      { sub_phase_number: "4.1", sub_phase_name: "Superstructure Construction" },
      { sub_phase_number: "4.2", sub_phase_name: "FF&E Procurement" },
      { sub_phase_number: "4.3", sub_phase_name: "Pre-Opening & Closeout" },
      { sub_phase_number: "4.4", sub_phase_name: "Franchise / Local Approvals" },
    ],
  },
];

export const DEFAULT_MILESTONES: { sub_phase_number: string; name: string }[] = [
  { sub_phase_number: "1.1", name: "PSA Executed" },
  { sub_phase_number: "1.1", name: "Due Diligence Period Expiration" },
  { sub_phase_number: "1.3", name: "Closing" },
  { sub_phase_number: "2.1", name: "Design Kickoff" },
  { sub_phase_number: "2.3", name: "Franchise Approval" },
  { sub_phase_number: "2.3", name: "Permits Approved" },
  { sub_phase_number: "3.1", name: "General Contractor Selection" },
  { sub_phase_number: "3.2", name: "Loan Approval" },
  { sub_phase_number: "4.1", name: "Notice to Proceed" },
  { sub_phase_number: "4.1", name: "Substantial Completion" },
  { sub_phase_number: "4.3", name: "Certificate of Occupancy" },
  { sub_phase_number: "4.4", name: "Franchise Approval" },
];
