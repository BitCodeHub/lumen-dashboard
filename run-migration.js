#!/usr/bin/env node

/**
 * Run database migration
 * Usage: node run-migration.js migrations/005_documents.sql
 */

const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

const migrationFile = process.argv[2] || 'migrations/005_documents.sql';

if (!fs.existsSync(migrationFile)) {
  console.error(`Migration file not found: ${migrationFile}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationFile, 'utf-8');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

console.log(`Running migration: ${migrationFile}`);
console.log('---');

pool.query(sql)
  .then(() => {
    console.log('✅ Migration successful!');
    pool.end();
  })
  .catch(err => {
    console.error('❌ Migration failed:', err.message);
    pool.end();
    process.exit(1);
  });
