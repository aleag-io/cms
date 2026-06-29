const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Each arg is a .sql file or a directory. Directories expand to their *.sql
// files in lexicographic (= timestamp) order, so passing the migrations folder
// applies every migration in sequence and new ones are picked up automatically.
function expand(arg) {
  if (fs.statSync(arg).isDirectory()) {
    return fs
      .readdirSync(arg)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => path.join(arg, f));
  }
  return [arg];
}

const files = process.argv.slice(2).flatMap(expand);
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
