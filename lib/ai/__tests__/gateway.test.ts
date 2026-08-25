/// <reference types="vitest/globals" />
/**
 * Phase 2 (§11.2 LLM ambiguity resolution) unit tests for the AI Gateway.
 *
 * Tests the pure validation logic and the fail-safe behavior of
 * lib/ai/gateway.ts using mocked fetch â€” no real API calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the global fetch before importing the module
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import {
  validateOutput,
  diagnoseAmbiguous,
  ALLOWED_ROOT_CAUSES,
  ALLOWED_ACTION_CLASSES,
  getAiMetadata,
  type LlmDiagnosis,
  type DiagnosisContext,
} from "@/lib/ai/gateway";

// Helper: create a valid LLM JSON response string
function validLlmResponse(
  overrides: Partial<{
    rootCause: string;
    confidence: number;
    evidenceCodes: string[];
    recommendedActionClass: string;
    reasonSummary: string;
  }> = {}
): string {
  return JSON.stringify({
    rootCause: "Insufficient Funds",
    confidence: 0.92,
    evidenceCodes: ["DECLINE_CODE_51", "HIGH_HISTORICAL_SUCCESS"],
    recommendedActionClass: "CREATE_PAYMENT_LINK",
    reasonSummary:
      "The payment has a known balance-related failure and the customer historically completes payments after a short delay.",
    ...overrides,
  });
}

describe("ALLOWED_ROOT_CAUSES (§13 action catalog vocabulary)", () => {
  it("contains all spec-required root causes", () => {
    expect(ALLOWED_ROOT_CAUSES).toContain("Insufficient Funds");
    expect(ALLOWED_ROOT_CAUSES).toContain("Expired Instrument");
    expect(ALLOWED_ROOT_CAUSES).toContain("Authentication");
    expect(ALLOWED_ROOT_CAUSES).toContain("Ambiguous");
  });
});

describe("ALLOWED_ACTION_CLASSES (§13 action catalog)", () => {
  it("contains all spec-required action classes", () => {
    expect(ALLOWED_ACTION_CLASSES).toContain("CREATE_PAYMENT_LINK");
    expect(ALLOWED_ACTION_CLASSES).toContain("RETRY_LATER");
    expect(ALLOWED_ACTION_CLASSES).toContain("ESCALATE_HUMAN");
    expect(ALLOWED_ACTION_CLASSES).toContain("MARK_EXHAUSTED");
    expect(ALLOWED_ACTION_CLASSES).toContain("SEND_PAYMENT_REMINDER");
  });
});

describe("validateOutput (§29.2 schema validation + §4.4 AI constraints)", () => {
  const modelVersion = "poolside/laguna-s-2.1";
  const promptVersion = "recovery-diagnosis-v1";
  const latencyMs = 1234;

  it("accepts valid LLM output with all required fields", () => {
    const result = validateOutput(
      validLlmResponse(),
      modelVersion,
      promptVersion,
      latencyMs
    );
    expect(result).not.toBeNull();
    expect(result!.rootCause).toBe("Insufficient Funds");
    expect(result!.confidence).toBe(0.92);
    expect(result!.evidenceCodes).toEqual([
      "DECLINE_CODE_51",
      "HIGH_HISTORICAL_SUCCESS",
    ]);
    expect(result!.recommendedActionClass).toBe("CREATE_PAYMENT_LINK");
    expect(result!.modelVersion).toBe(modelVersion);
    expect(result!.promptVersion).toBe(promptVersion);
    expect(result!.latencyMs).toBe(latencyMs);
  });

  // §4.4: LLM can only return from approved vocabularies
  it("rejects unknown root causes (§4.4 never invents causes)", () => {
    const result = validateOutput(
      validLlmResponse({ rootCause: "Made Up Cause" }),
      modelVersion,
      promptVersion,
      latencyMs
    );
    expect(result).toBeNull();
  });

  it("rejects unknown action classes (§4.4 never invents actions)", () => {
    const result = validateOutput(
      validLlmResponse({ recommendedActionClass: "INVENT_NEW_ACTION" }),
      modelVersion,
      promptVersion,
      latencyMs
    );
    expect(result).toBeNull();
  });

  it("rejects invalid JSON", () => {
    const result = validateOutput(
      "not json at all {{{",
      modelVersion,
      promptVersion,
      latencyMs
    );
    expect(result).toBeNull();
  });

  it("rejects missing fields", () => {
    const result = validateOutput(
      JSON.stringify({ rootCause: "Insufficient Funds" }),
      modelVersion,
      promptVersion,
      latencyMs
    );
    expect(result).toBeNull();
  });

  it("rejects confidence outside 0-1 range", () => {
    const result = validateOutput(
      validLlmResponse({ confidence: 1.5 }),
      modelVersion,
      promptVersion,
      latencyMs
    );
    expect(result).toBeNull();
  });

  it("rejects confidence below 0", () => {
    const result = validateOutput(
      validLlmResponse({ confidence: -0.1 }),
      modelVersion,
      promptVersion,
      latencyMs
    );
    expect(result).toBeNull();
  });

  it("rejects non-array evidenceCodes", () => {
    const result = validateOutput(
      validLlmResponse({ evidenceCodes: "not_an_array" as unknown as string[] }),
      modelVersion,
      promptVersion,
      latencyMs
    );
    expect(result).toBeNull();
  });

  it("rejects overly long reasonSummary", () => {
    const result = validateOutput(
      validLlmResponse({ reasonSummary: "x".repeat(501) }),
      modelVersion,
      promptVersion,
      latencyMs
    );
    expect(result).toBeNull();
  });

  it("accepts all valid root causes", () => {
    for (const cause of ALLOWED_ROOT_CAUSES) {
      const result = validateOutput(
        validLlmResponse({ rootCause: cause }),
        modelVersion,
        promptVersion,
        latencyMs
      );
      expect(result).not.toBeNull();
      expect(result!.rootCause).toBe(cause);
    }
  });

  it("accepts all valid action classes", () => {
    for (const action of ALLOWED_ACTION_CLASSES) {
      const result = validateOutput(
        validLlmResponse({ recommendedActionClass: action }),
        modelVersion,
        promptVersion,
        latencyMs
      );
      expect(result).not.toBeNull();
      expect(result!.recommendedActionClass).toBe(action);
    }
  });

  it("strips surrounding markdown fences if present (robustness)", () => {
    const result = validateOutput(
      "```json\n" + validLlmResponse() + "\n```",
      modelVersion,
      promptVersion,
      latencyMs
    );
    // The current implementation does NOT strip fences â€” this documents
    // that raw ```json fences cause rejection. If we add stripping later,
    // change this expectation.
    expect(result).toBeNull();
  });
});

describe("getAiMetadata (§30 model + prompt versioning)", () => {
  beforeEach(() => {
    process.env.POOLSIDE_MODEL = "poolside/laguna-s-2.1";
  });

  afterEach(() => {
    delete process.env.POOLSIDE_MODEL;
  });

  it("returns current model + prompt versions for audit", () => {
    const meta = getAiMetadata();
    expect(meta.modelProvider).toBe("poolside");
    expect(meta.modelName).toBe("poolside/laguna-s-2.1");
    expect(meta.promptVersion).toMatch(/recovery-diagnosis-v\d+/);
    expect(meta.inputSchemaVersion).toBeDefined();
    expect(meta.outputSchemaVersion).toBeDefined();
  });

  it("respects POOLSIDE_MODEL env override", () => {
    process.env.POOLSIDE_MODEL = "poolside/laguna-s-2.1";
    const meta = getAiMetadata();
    expect(meta.modelName).toBe("poolside/laguna-s-2.1");
  });
});

/**
 * Phase 2 â€” LLM ambiguity resolution unit tests for lib/ai/gateway.ts
 *
 * Uses mocked fetch â€” no real API calls. Tests:
 *   - validateOutput: schema validation (§29.2) + vocabulary constraints (§4.4)
 *   - diagnoseAmbiguous: fail-safe behavior (§4.7)
 *   - getAiMetadata: model + prompt versioning (§30)
 */
describe("diagnoseAmbiguous fail-safe behavior (§4.7)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.POOLSIDE_API_KEY;
    delete process.env.POOLSIDE_BASE_URL;
    delete process.env.POOLSIDE_MODEL;
  });

  afterEach(() => {
    delete process.env.POOLSIDE_API_KEY;
    delete process.env.POOLSIDE_BASE_URL;
    delete process.env.POOLSIDE_MODEL;
  });

  it("returns null when POOLSIDE_API_KEY is not configured (§4.7 graceful degradation)", async () => {
    const ctx: DiagnosisContext = {
      failureCode: "ambiguous",
      amountMinor: 59900,
      currency: "INR",
      attemptCount: 1,
    };
    const result = await diagnoseAmbiguous(ctx);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null and logs error when fetch throws (network failure)", async () => {
    process.env.POOLSIDE_API_KEY = "test-key";
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const ctx: DiagnosisContext = {
      failureCode: "ambiguous",
      failureReason: "Card Declined",
      amountMinor: 59900,
      currency: "INR",
      attemptCount: 1,
    };
    const result = await diagnoseAmbiguous(ctx);
    expect(result).toBeNull();
  });

  it("returns null on timeout (§4.7 never fail open)", { timeout: 6000 }, async () => {
    process.env.POOLSIDE_API_KEY = "test-key";
    // Simulate a timeout: mock respects AbortController signal
    mockFetch.mockImplementationOnce((_url, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    });

    const ctx: DiagnosisContext = {
      failureCode: "ambiguous",
      amountMinor: 59900,
      currency: "INR",
      attemptCount: 1,
    };

    // Use a short timeout for the test
    const result = await diagnoseAmbiguous(ctx, { timeoutMs: 100 });
    expect(result).toBeNull();  });

  it("returns null when model returns non-JSON (§29.2 schema validation)", async () => {
    process.env.POOLSIDE_API_KEY = "test-key";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "this is not JSON" } }],
      }),
    });

    const ctx: DiagnosisContext = {
      failureCode: "ambiguous",
      amountMinor: 59900,
      currency: "INR",
      attemptCount: 1,
    };
    const result = await diagnoseAmbiguous(ctx, { timeoutMs: 5000 });
    expect(result).toBeNull();
  });

  it("returns null when model returns schema-invalid JSON (§29.2)", async () => {
    process.env.POOLSIDE_API_KEY = "test-key";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ wrong_field: 1 }) } }],
      }),
    });

    const ctx: DiagnosisContext = {
      failureCode: "ambiguous",
      amountMinor: 59900,
      currency: "INR",
      attemptCount: 1,
    };
    const result = await diagnoseAmbiguous(ctx, { timeoutMs: 5000 });
    expect(result).toBeNull();
  });

  it("returns null on HTTP 500 (§29.2 retry then fail-safe)", async () => {
    process.env.POOLSIDE_API_KEY = "test-key";
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const ctx: DiagnosisContext = {
      failureCode: "ambiguous",
      amountMinor: 59900,
      currency: "INR",
      attemptCount: 1,
    };
    const result = await diagnoseAmbiguous(ctx, {
      timeoutMs: 5000,
      retries: 0, // no retry for faster test
    });
    expect(result).toBeNull();
  });

  it("retries on HTTP 500 then succeeds", async () => {
    process.env.POOLSIDE_API_KEY = "test-key";
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: validLlmResponse() } }],
        }),
      });

    const ctx: DiagnosisContext = {
      failureCode: "ambiguous",
      amountMinor: 59900,
      currency: "INR",
      attemptCount: 1,
    };
    const result = await diagnoseAmbiguous(ctx, {
      timeoutMs: 5000,
      retries: 1,
    });
    expect(result).not.toBeNull();
    expect(result!.rootCause).toBe("Insufficient Funds");
  });

  it("returns valid diagnosis when model responds correctly (§29.2)", async () => {
    process.env.POOLSIDE_API_KEY = "test-key";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "chatcmpl-123",
        model: "poolside/laguna-s-2.1",
        choices: [{ message: { content: validLlmResponse() } }],
        usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
      }),
    });

    const ctx: DiagnosisContext = {
      failureCode: "ambiguous",
      failureReason: "Card Declined",
      amountMinor: 59900,
      currency: "INR",
      attemptCount: 1,
      customerRef: "cust_1001",
      orderRef: "order_12345",
    };
    const result = await diagnoseAmbiguous(ctx, {
      timeoutMs: 5000,
      retries: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.rootCause).toBe("Insufficient Funds");
    expect(result!.confidence).toBe(0.92);
    expect(result!.recommendedActionClass).toBe("CREATE_PAYMENT_LINK");
    expect(result!.evidenceCodes).toContain("DECLINE_CODE_51");
    expect(result!.modelVersion).toBe("poolside/laguna-s-2.1");
    expect(result!.promptVersion).toBe("recovery-diagnosis-v1");
    expect(result!.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
