const fs = require('fs');
const path = 'lib/ai/__tests__/gateway.test.ts';
let c = fs.readFileSync(path, 'utf8');

// Fix encoding issue with section symbol
c = c.replace(/Â§/g, '§');

fs.writeFileSync(path, c);
console.log('Encoding fixed');
console.log('File written, length:', c.length);
