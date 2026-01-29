const bcrypt = require('bcrypt');

// Middleware to check if user is authenticated
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  
  // If API request, return JSON error
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Otherwise redirect to login
  res.redirect('/login.html');
}

// Hash password
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

// Compare password
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// Register new user
async function registerUser(pool, username, email, password) {
  const client = await pool.connect();
  try {
    // Check if username exists
    const existingUser = await client.query(
      'SELECT id FROM lumen_users WHERE username = $1',
      [username]
    );
    
    if (existingUser.rows.length > 0) {
      throw new Error('Username already exists');
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Insert user
    const result = await client.query(
      `INSERT INTO lumen_users (username, email, password_hash, created_at) 
       VALUES ($1, $2, $3, NOW()) 
       RETURNING id, username, email, created_at`,
      [username, email || null, hashedPassword]
    );
    
    return result.rows[0];
  } finally {
    client.release();
  }
}

// Login user
async function loginUser(pool, username, password) {
  const client = await pool.connect();
  try {
    // Get user by username
    const result = await client.query(
      'SELECT id, username, email, password_hash FROM lumen_users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }
    
    const user = result.rows[0];
    
    // Compare password
    const isValid = await comparePassword(password, user.password_hash);
    
    if (!isValid) {
      throw new Error('Invalid credentials');
    }
    
    // Update last login
    await client.query(
      'UPDATE lumen_users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );
    
    return {
      id: user.id,
      username: user.username,
      email: user.email
    };
  } finally {
    client.release();
  }
}

// Get user by ID
async function getUserById(pool, userId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, username, email, created_at, last_login FROM lumen_users WHERE id = $1',
      [userId]
    );
    
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

module.exports = {
  requireAuth,
  registerUser,
  loginUser,
  getUserById,
  hashPassword,
  comparePassword
};
