const fs = require('fs');
const path = 'lib/ai/__tests__/gateway.test.ts';
let c = fs.readFileSync(path, 'utf8');

// Replace the timeout mock to respect AbortController
const oldMock = `    // Simulate a timeout by never resolving
    mockFetch.mockImplementationOnce(() => {
      return new Promise(() => {}); // never resolves
    });`;

const newMock = `    // Simulate a timeout: mock respects AbortController signal
    mockFetch.mockImplementationOnce((_url, init) => {
      return new Promise((_, reject) => {
        init&.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    });`;

if (c.includes(oldMock)) {
  c = c.replace(oldMock, newMock);
  fs.writeFileSync(path, c);
  console.log('Timeout test mock fixed');
} else {
  console.log('Old mock not found. Checking for alternative patterns...');
  // Show what we have around the timeout test
  const idx = c.indexOf('returns null on timeout');
  if (idx >= 0) {
    console.log(c.substring(idx, idx + 600));
  }
}
