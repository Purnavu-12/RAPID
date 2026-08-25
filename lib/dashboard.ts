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
  /** §14 engine decision surfaced from the recovery_cases projection
   *  (dec.action_class as `proposed_action`). Shows *how* the engine handled
   *  each case — e.g. CREATE_PAYMENT_LINK / RETRY_LATER / ESCALATE_HUMAN. */
  actionClass?: string | null;
  /** §11 diagnosis confidence (0–1). */
  confidence?: number | null;
  /** §14 P(success) for the chosen action (dec.probability_of_success). */
  probability?: number | null;
}

export interface RecoveryPayload {
  metrics: RecoveryMetrics;
  trend: TrendPoint[];
  cases: RecoveryCase[];
  generatedAt: string;
}
