import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export const metadata = {
  title: "Recovery Dashboard — RAPID",
  description:
    "Live recovery dashboard: detect at-risk revenue, watch recoveries, and track the full audit trail of every case.",
};

export default function DashboardPage() {
  return <DashboardShell />;
}
