const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
const url = process.env.DATABASE_URL;

async function run() {
  for (const f of files) {
    console.log(`=== Applying ${f} ===`);
    const sql = fs.readFileSync(f, 'utf8');
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.query(sql);
      console.log('OK');
    } catch (e) {
      console.error('FAILED:', e.message);
      process.exit(1);
    } finally {
      await client.end();
    }
  }
}

run();
