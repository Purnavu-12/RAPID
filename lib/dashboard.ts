/** Shape of the /api/recovery response. Shared between the dashboard page
 *  and its child components so the wiring stays type-safe end-to-end. */

export interface RecoveryMetrics {
  recoveryRate: number;
  recovered: number;
  atRisk: number;
  latency: number;
}

export interface TrendPoint {
  day: string;
  recovered: number;
  atRisk: number;
}

export interface RecoveryCase {
  id: string;
  customer: string;
  riskType: string;
  reason: string;
  amount: number;
  currency: string;
  status: "RECOVERED" | "SCHEDULED" | "ESCALATED" | "EXHAUSTED" | "OUTCOME_PENDING";
  recovered: number;
  createdAt: string;
}

export interface RecoveryPayload {
  metrics: RecoveryMetrics;
  trend: TrendPoint[];
  cases: RecoveryCase[];
  generatedAt: string;
}
