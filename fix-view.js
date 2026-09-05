const https = require('https');
const fs = require('fs');

// Read the migration file
const sql = fs.readFileSync('D:\\RAPID\\supabase\\migrations\\20260825000011_fix_recovery_cases_view.sql', 'utf8');

const body = JSON.stringify({ sql: sql });

const req = https.request({
  hostname: 'api.supabase.com',
  port: 443,
  path: '/v1/projects/dwqagnkkddixspsfjwkj/sql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sbp_1b9c4d2a-8e7f-4a3b-9c2d-1e8f7a6b5c4d',
    'Content-Length': Buffer.byteLength(body)
  }
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(body);
req.end();
