const fs = require('fs');
const path = 'lib/ai/__tests__/gateway.test.ts';
let c = fs.readFileSync(path, 'utf8');

// Fix the timeout test - replace the mock implementation and fix the expect line
const oldTimeoutTest = `  it("returns null on timeout (§4.7 never fail open)", async () => {
    process.env.POOLSIDE_API_KEY = "test-key";
    // Simulate a timeout by never resolving
    mockFetch.mockImplementationOnce(() => {
      return new Promise(() => {}); // never resolves
    });

    const ctx: DiagnosisContext = {
      failureCode: "ambiguous",
      amountMinor: 59900,
      currency: "INR",
      attemptCount: 1,
    };

    // Use a short timeout for the test
    const result = await diagnoseAmbiguous(ctx, { timeoutMs: 100 });    expect(result).toBeNull();
  });`;

const newTimeoutTest = `  it("returns null on timeout (§4.7 never fail open)", { timeout: 6000 }, async () => {
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
    expect(result).toBeNull();
  });`;

if (c.includes(oldTimeoutTest)) {
  c = c.replace(oldTimeoutTest, newTimeoutTest);
  fs.writeFileSync(path, c);
  console.log('Timeout test fixed');
} else {
  console.log('Old timeout test not found. Trying line-by-line fix...');
  
  // Fix the mock implementation
  const oldMock = `    mockFetch.mockImplementationOnce(() => {
      return new Promise(() => {}); // never resolves
    });`;
  const newMock = `    mockFetch.mockImplementationOnce((_url, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    });`;
  
  if (c.includes(oldMock)) {
    c = c.replace(oldMock, newMock);
    console.log('Mock implementation fixed');
  }
  
  // Fix the expect line that's merged with the await
  const oldMerged = `    const result = await diagnoseAmbiguous(ctx, { timeoutMs: 100 });    expect(result).toBeNull();`;
  const newSeparate = `    const result = await diagnoseAmbiguous(ctx, { timeoutMs: 100 });
    expect(result).toBeNull();`;
  
  if (c.includes(oldMerged)) {
    c = c.replace(oldMerged, newSeparate);
    console.log('Merged line fixed');
  }
  
  // Add test timeout option
  const oldIt = `it("returns null on timeout (§4.7 never fail open)", async () => {`;
  const newIt = `it("returns null on timeout (§4.7 never fail open)", { timeout: 6000 }, async () => {`;
  
  if (c.includes(oldIt)) {
    c = c.replace(oldIt, newIt);
    console.log('Test timeout added');
  }
  
  fs.writeFileSync(path, c);
  console.log('File saved');
}
