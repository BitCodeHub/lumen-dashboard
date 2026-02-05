#!/usr/bin/env node
/**
 * Reset user password or create new user
 * Usage: node reset-user.js <username> <password>
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

async function resetUser(username, password) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Check if user exists
    const result = await client.query(
      'SELECT id, username, email FROM lumen_users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      console.log(`❌ User '${username}' not found`);
      console.log('\nAvailable users:');
      const allUsers = await client.query('SELECT username, email, created_at FROM lumen_users ORDER BY created_at');
      allUsers.rows.forEach(u => {
        console.log(`  - ${u.username} (${u.email || 'no email'}) - created ${u.created_at}`);
      });
      console.log('\nTo create new user, use register.html or run:');
      console.log(`  node create-user.js ${username} email@example.com ${password}`);
      process.exit(1);
    }
    
    const user = result.rows[0];
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Update password
    await client.query(
      'UPDATE lumen_users SET password_hash = $1 WHERE id = $2',
      [hashedPassword, user.id]
    );
    
    console.log(`✅ Password reset successfully for user: ${user.username}`);
    console.log(`   Email: ${user.email || 'none'}`);
    console.log(`\nYou can now login at: https://lumen-dashboard.onrender.com/login.html`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Password: ${password}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Parse arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.log('Usage: node reset-user.js <username> <new-password>');
  console.log('\nExample:');
  console.log('  node reset-user.js jimmy MyNewPassword123');
  process.exit(1);
}

const [username, password] = args;

if (password.length < 6) {
  console.error('❌ Password must be at least 6 characters');
  process.exit(1);
}

resetUser(username, password);
