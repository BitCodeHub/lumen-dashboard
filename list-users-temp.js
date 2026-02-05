const { Pool } = require('pg');

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
  });

  try {
    const result = await pool.query(
      'SELECT id, username, email, created_at, last_login FROM lumen_users ORDER BY created_at DESC'
    );
    
    console.log('========== USERS IN DATABASE ==========');
    console.log('Total users:', result.rows.length);
    console.log('\n');
    
    result.rows.forEach(u => {
      console.log(`User ID: ${u.id}`);
      console.log(`Username: ${u.username}`);
      console.log(`Email: ${u.email || 'none'}`);
      console.log(`Created: ${u.created_at}`);
      console.log(`Last login: ${u.last_login || 'never'}`);
      console.log('---');
    });
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
