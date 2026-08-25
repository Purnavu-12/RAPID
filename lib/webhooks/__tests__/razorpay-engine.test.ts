/// <reference types="vitest/globals" />
/**
 * Wave 1.1 (§47) unit tests for the rule-first recovery engine.
 *
 * These are the deterministic, I/O-free pieces of lib/webhooks/razorpay.ts:
 * the failure-code normalization, §11 rule-based diagnosis, §14 decision
 * (incl. the §16/§17 amount threshold boundary), §48 signature verification,
 * and §4.2/§28 idempotency-key generation. The §45 scenario table at the end
 * is the repeatable regression harness for "the engine handles every payment
 * failure type" — it runs with no DB and no secrets.
 */
import { createHmac } from "node:crypto";
import {
  normalizeFailureCode,
  diagnose,
  decide,
  verifyRazorpaySignature,
  buildIdempotencyKey,
} from "@/lib/webhooks/razorpay";

describe("normalizeFailureCode (§11.1 rule-first normalization)", () => {
  it.each([
    ["insufficient_funds", "Insufficient Funds", "insufficient_funds"],
    ["balance_declined", "balance_declined", "insufficient_funds"],
    ["card_expired", "Card Expired", "card_expired"],
    ["authentication_failure", "Authentication Failed", "authentication_failure"],
    ["invalid_cvv", "Security code is invalid", "authentication_failure"],
    ["gateway_timeout", "Gateway Timeout", "issuer_timeout"],
    ["", "timed out", "issuer_timeout"], // reason-only timeout (space, not underscore)
    ["unavailable", "Service unavailable", "issuer_timeout"],
    ["duplicate", "Duplicate Transaction", "duplicate_transaction"],
    ["processing", "processing", "duplicate_transaction"],
    ["card_declined", "Card Declined", "ambiguous"], // hard decline w/ no known code
    ["", "", "ambiguous"],
  ])("normalizeFailureCode(%j, %j) => %j", (code, reason, expected) => {
    expect(normalizeFailureCode(code, reason)).toBe(expected);
  });
});

describe("diagnose (§11.1 rule-first diagnosis)", () => {
  it("maps known codes to their root cause with high confidence", () => {
    const d = diagnose("insufficient_funds");
    expect(d.rootCause).toBe("Insufficient Funds");
    expect(d.confidence).toBe(0.92);
    expect(d.method).toBe("rule");
    expect(d.evidenceCodes).toContain("DECLINE_CODE_MATCHED");
  });

  it.each([
    "card_expired",
    "authentication_failure",
    "issuer_timeout",
    "duplicate_transaction",
  ])("diagnose(%j) is a known root cause", (code) => {
    expect(diagnose(code).rootCause).not.toBe("Ambiguous");
    expect(diagnose(code).confidence).toBe(0.92);
  });

  it("falls back to Ambiguous with low confidence for unknown codes", () => {
    const d = diagnose("ambiguous");
    expect(d.rootCause).toBe("Ambiguous");
    expect(d.confidence).toBe(0.45);
    expect(d.evidenceCodes).toContain("REQUIRES_HUMAN_REVIEW");
  });
});

describe("decide (§14 Decision Engine + §16 policy table)", () => {
  it("low-value Insufficient Funds → CREATE_PAYMENT_LINK (P=.84)", () => {
    const d = decide("Insufficient Funds", 59900);
    expect(d.actionClass).toBe("CREATE_PAYMENT_LINK");
    expect(d.requiresHuman).toBe(false);
    expect(d.probability).toBe(0.84);
    expect(d.expectedRecoveryMinor).toBe(59900);
    expect(d.reasonCodes).toContain("WITHIN_AUTO_LIMIT");
  });

  it("Gateway Failure → RETRY_LATER (P=.65)", () => {
    const d = decide("Gateway Failure", 199900);
    expect(d.actionClass).toBe("RETRY_LATER");
    expect(d.requiresHuman).toBe(false);
    expect(d.probability).toBe(0.65);
  });

  it("Authentication → RETRY_LATER (P=.65)", () => {
    expect(decide("Authentication", 9900).actionClass).toBe("RETRY_LATER");
  });

  it("ambiguous → ESCALATE_HUMAN (P=.48)", () => {
    const d = decide("Ambiguous", 49900);
    expect(d.actionClass).toBe("ESCALATE_HUMAN");
    expect(d.requiresHuman).toBe(true);
    expect(d.probability).toBe(0.48);
  });

  // §16/§17 amount threshold: strictly greater than 500000 paise (₹5,000).
  describe("high-value threshold boundary (§16)", () => {
    it("amount == 500000 (₹5,000 exactly) is NOT escalated", () => {
      expect(decide("Insufficient Funds", 500_000).actionClass).toBe(
        "CREATE_PAYMENT_LINK"
      );
    });
    it("amount == 500001 (₹5,000.01) IS escalated", () => {
      const d = decide("Insufficient Funds", 500_001);
      expect(d.actionClass).toBe("ESCALATE_HUMAN");
      expect(d.requiresHuman).toBe(true);
      expect(d.probability).toBe(0.55);
      expect(d.expectedRecoveryMinor).toBe(500_001);
    });
    it("high-value duplicate/exhausted-cause → ESCALATE_HUMAN", () => {
      expect(decide("Duplicate Transaction", 750_000).requiresHuman).toBe(true);
    });
    it("low-value ambiguous → ESCALATE_HUMAN (ambiguous beats amount)", () => {
      expect(decide("Ambiguous", 100).actionClass).toBe("ESCALATE_HUMAN");
    });
  });
});

describe("verifyRazorpaySignature (§48 forged-webhook defense)", () => {
  const secret = "whsec_test_secret";
  const raw = JSON.stringify({ event: "payment_link.paid", event_id: "evt_123" });
  const sig = createHmac("sha256", secret).update(raw, "utf8").digest("hex");

  it("accepts a valid signature", () => {
    expect(verifyRazorpaySignature(raw, sig, secret)).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifyRazorpaySignature(raw + "x", sig, secret)).toBe(false);
  });
  it("rejects a wrong secret", () => {
    expect(verifyRazorpaySignature(raw, sig, "other_secret")).toBe(false);
  });
  it("rejects a missing signature", () => {
    expect(verifyRazorpaySignature(raw, null, secret)).toBe(false);
    expect(verifyRazorpaySignature(raw, undefined, secret)).toBe(false);
  });
});

describe("buildIdempotencyKey (§4.2/§28 idempotency)", () => {
  it("formats as case:<risk_event_id>:<action>:<attempt>", () => {
    expect(buildIdempotencyKey("re_abc", "CREATE_PAYMENT_LINK", 1)).toBe(
      "case:re_abc:CREATE_PAYMENT_LINK:1"
    );
  });
  it("defaults attemptNo to 1", () => {
    expect(buildIdempotencyKey("re_abc", "RETRY_LATER")).toBe(
      "case:re_abc:RETRY_LATER:1"
    );
  });
  it("changes per attempt (retry is a new key, not a re-mint)", () => {
    expect(buildIdempotencyKey("re_abc", "CREATE_PAYMENT_LINK", 1)).not.toBe(
      buildIdempotencyKey("re_abc", "CREATE_PAYMENT_LINK", 2)
    );
  });
});

/** §45 Synthetic Event Simulator — repeatable regression table.
 *  Each row: the Razorpay decline envelope → the engine's full
 *  normalizeFailureCode → diagnose → decide chain → the spec-correct action. */
describe("§45 scenario decision table (engine handles every failure type)", () => {
  const scenarios: Array<{
    name: string;
    errorCode: string;
    errorReason: string;
    amount: number;
    expectedAction: string;
  }> = [
    { name: "payment_failure_soft", errorCode: "insufficient_funds", errorReason: "Insufficient Funds", amount: 59900, expectedAction: "CREATE_PAYMENT_LINK" },
    { name: "payment_failure_hard", errorCode: "card_declined", errorReason: "Card Declined", amount: 59900, expectedAction: "ESCALATE_HUMAN" },
    { name: "gateway_timeout", errorCode: "gateway_timeout", errorReason: "Gateway Timeout", amount: 59900, expectedAction: "RETRY_LATER" },
    { name: "insufficient_funds", errorCode: "insufficient_funds", errorReason: "Insufficient Funds", amount: 59900, expectedAction: "CREATE_PAYMENT_LINK" },
    { name: "expired_instrument", errorCode: "card_expired", errorReason: "Card Expired", amount: 59900, expectedAction: "CREATE_PAYMENT_LINK" },
    { name: "authentication_failure", errorCode: "authentication_failure", errorReason: "Authentication Failed", amount: 59900, expectedAction: "RETRY_LATER" },
    { name: "subscription_failure", errorCode: "insufficient_funds", errorReason: "Insufficient Funds", amount: 59900, expectedAction: "CREATE_PAYMENT_LINK" },
    { name: "provider_duplicate_event", errorCode: "duplicate", errorReason: "Duplicate Transaction", amount: 59900, expectedAction: "CREATE_PAYMENT_LINK" },
    { name: "high_value", errorCode: "insufficient_funds", errorReason: "Insufficient Funds", amount: 750_000, expectedAction: "ESCALATE_HUMAN" },
  ];

  it.each(scenarios)(
    "$name → $expectedAction",
    (s) => {
      const code = normalizeFailureCode(s.errorCode, s.errorReason);
      const diag = diagnose(code);
      const d = decide(diag.rootCause, s.amount);
      expect(d.actionClass).toBe(s.expectedAction);
    }
  );
});
