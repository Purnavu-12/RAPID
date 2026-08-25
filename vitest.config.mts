import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Wave 1.1 (§47) test harness.
 *
 * Node environment by default — the engine's pure rule/policy functions
 * (normalizeFailureCode, diagnose, decide, verifyRazorpaySignature,
 * buildIdempotencyKey) carry no I/O, so they run anywhere with zero secrets.
 * DB-bound integration tests are gated on SUPABASE_SERVICE_ROLE_KEY being
 * present (see lib/db/__tests__/*).
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx"],
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
  },
});
