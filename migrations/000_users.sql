-- Users table for authentication
CREATE TABLE IF NOT EXISTS lumen_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    active BOOLEAN DEFAULT TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lumen_users_username ON lumen_users(username);
CREATE INDEX IF NOT EXISTS idx_lumen_users_email ON lumen_users(email);

COMMENT ON TABLE lumen_users IS 'User authentication and management';
