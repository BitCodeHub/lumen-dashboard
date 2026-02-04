#!/usr/bin/env node

/**
 * Create admin user
 * Usage: node create-admin-user.js <username> <password>
 */

const { Pool } = require('pg');
const auth = require('./auth');
require('dotenv').config({ quiet: true });

const username = process.argv[2] || 'jimmy';
const password = process.argv[3] || 'lumen2026';
const email = process.argv[4] || 'jimmy@lumenai.solutions';

if (!username || !password) {
  console.error('Usage: node create-admin-user.js <username> <password> [email]');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

console.log(`Creating admin user: ${username}`);

auth.registerUser(pool, username, email, password)
  .then(user => {
    console.log('✅ User created successfully!');
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Created: ${user.created_at}`);
    pool.end();
  })
  .catch(err => {
    if (err.message.includes('already exists')) {
      console.log('ℹ️  User already exists. Updating password...');
      
      // Update password instead
      auth.hashPassword(password).then(hash => {
        pool.query('UPDATE lumen_users SET password_hash = $1 WHERE username = $2 RETURNING *', [hash, username])
          .then(result => {
            if (result.rows.length > 0) {
              console.log('✅ Password updated successfully!');
              console.log(`   Username: ${result.rows[0].username}`);
            } else {
              console.error('❌ User not found');
            }
            pool.end();
          })
          .catch(err2 => {
            console.error('❌ Failed to update password:', err2.message);
            pool.end();
            process.exit(1);
          });
      });
    } else {
      console.error('❌ Failed to create user:', err.message);
      pool.end();
      process.exit(1);
    }
  });
