/**
 * seed-test.js — BHAT TC Tracker Test Seed
 * 
 * Populates the backend with fake TC members + fake transactions
 * so you can test all bot commands without real data.
 * 
 * Usage (while backend is running on port 3000):
 *   node seed-test.js
 */

const http = require('http');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function seed() {
  console.log('\n🌱 BHAT TC Tracker — Seeding test data...\n');

  // ── Register TCs ────────────────────────────────────────────────
  console.log('👤 Registering TC members...');

  const tc1 = await post('/api/transactions/register', {
    discordId: '111111111111111111',
    name: 'Jordan (Frontend TC)',
    team: 'Frontend TC'
  });
  console.log('  ✅ Jordan registered:', tc1.message || JSON.stringify(tc1));

  const tc2 = await post('/api/transactions/register', {
    discordId: '222222222222222222',
    name: 'Morgan (Backend TC)',
    team: 'Backend TC'
  });
  console.log('  ✅ Morgan registered:', tc2.message || JSON.stringify(tc2));

  // ── Seed Transactions ────────────────────────────────────────────
  console.log('\n📋 Adding fake transactions...');

  const transactions = [
    {
      address: '4821 Maple Grove Ln, Austin TX 78745',
      agentName: 'Sarah Chen',
      fileNumber: 'TEST-001',
      mlsNumber: 'MLS-88421',
      stage: 'Under Contract',
      team: 'Frontend TC',
      source: 'test-seed'
    },
    {
      address: '1093 Ridgeline Dr, Austin TX 78704',
      agentName: 'Marcus Williams',
      fileNumber: 'TEST-002',
      mlsNumber: 'MLS-77310',
      stage: 'Under Contract',
      team: 'Backend TC',
      source: 'test-seed'
    },
    {
      address: '2267 Creekside Blvd, Round Rock TX 78664',
      agentName: 'Priya Patel',
      fileNumber: 'TEST-003',
      mlsNumber: 'MLS-65502',
      stage: 'Inspection Period',
      team: 'Frontend TC',
      source: 'test-seed'
    },
    {
      address: '890 Sunset Ridge Rd, Cedar Park TX 78613',
      agentName: 'Derek Thompson',
      fileNumber: 'TEST-004',
      mlsNumber: 'MLS-54198',
      stage: 'Financing Contingency',
      team: 'Backend TC',
      source: 'test-seed'
    },
    {
      address: '3345 Oak Hollow Pass, Pflugerville TX 78660',
      agentName: 'Linda Foster',
      fileNumber: 'TEST-005',
      mlsNumber: 'MLS-43007',
      stage: 'Clear to Close',
      team: 'Frontend TC',
      source: 'test-seed'
    }
  ];

  for (const txn of transactions) {
    const result = await post('/api/transactions', txn);
    const id = result._id || result.id || '?';
    console.log(`  ✅ [${txn.team}] ${txn.address} — ${txn.stage} (ID: ${id})`);
  }

  console.log('\n✅ Seed complete! Here is what was loaded:\n');
  console.log('  TCs:');
  console.log('    • Jordan  — Frontend TC (2 active transactions)');
  console.log('    • Morgan  — Backend TC  (2 active transactions)');
  console.log('\n  Transactions (5 total):');
  transactions.forEach((t, i) => {
    console.log(`    ${i + 1}. [${t.team}] ${t.address} — ${t.stage}`);
  });

  console.log('\n🧪 Now test these Discord bot commands:');
  console.log('  /tc board          → See Jordan & Morgan status');
  console.log('  /transaction list  → See all 5 fake transactions');
  console.log('  /transaction new   → Add a 6th (auto-assigns to next in rotation)');
  console.log('  /tc checkin        → Test connectivity self-report buttons');
  console.log('  /tc queue          → See rotation order\n');
}

seed().catch(err => {
  console.error('\n❌ Seed failed:', err.message);
  console.error('Make sure the backend is running: cd server && node index.js\n');
  process.exit(1);
});
