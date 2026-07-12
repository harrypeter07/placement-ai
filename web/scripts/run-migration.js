const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('verbatim');
}

const connectionString = 'postgresql://postgres.oybdgtsrlkqiishkpncf:NbBFU2T3%2F%2F%5EsdQc@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres';

async function main() {
  const sqlPath = path.join(__dirname, '../../supabase_schema.sql');
  console.log('Reading migration file:', sqlPath);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL database.');
    
    console.log('Executing schema statements...');
    await client.query(sql);
    console.log('Migration executed successfully!');
  } catch (err) {
    console.error('Error during migration:', err);
  } finally {
    await client.end();
  }
}

main();
