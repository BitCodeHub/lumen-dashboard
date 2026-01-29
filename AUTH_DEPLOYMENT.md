# Multi-User Authentication - Deployment Guide

## ✅ What's Been Built

Multi-user authentication system with:
- **User registration** with username, optional email, and password
- **Login/logout** with session management
- **Secure password hashing** using bcrypt
- **Session persistence** (30 days) stored in PostgreSQL
- **Protected routes** - all API endpoints now require authentication
- **Modern UI** - clean login/register pages matching dashboard design

## 🗄️ Database Changes

New tables created automatically on startup:
- `lumen_users` - stores user accounts with hashed passwords
- `user_sessions` - stores session data for persistent login

## 🚀 Deployment Steps

### 1. Environment Variables (IMPORTANT)
Add to your `.env` or hosting platform:
```bash
SESSION_SECRET=your-random-secret-key-here-change-this
NODE_ENV=production
```

**Generate a secure session secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Install Dependencies
```bash
npm install
```

New packages added:
- `bcrypt` - password hashing
- `express-session` - session management
- `connect-pg-simple` - PostgreSQL session store

### 3. Database Migration
On first run, the server will automatically create the new tables.

No manual SQL needed - it's all in the init script.

### 4. Create First Admin User

**Option A: Via Register Page**
1. Start the server
2. Go to `/register.html`
3. Create the first admin account

**Option B: Via SQL (if you want to pre-create)**
```sql
-- Generate password hash first (use bcrypt with saltRounds=10)
-- Example: password "admin123" becomes hash below
INSERT INTO lumen_users (username, password_hash, created_at)
VALUES ('admin', '$2b$10$hashed_password_here', NOW());
```

### 5. Test Authentication Flow

1. Navigate to root `/` → should redirect to `/login.html`
2. Try accessing `/api/briefings` without login → 401 error
3. Register a new user → success message
4. Login with credentials → redirects to dashboard
5. Access API endpoints → works!
6. Logout → redirects to login

## 🔒 Security Features

- ✅ Passwords hashed with bcrypt (10 salt rounds)
- ✅ Sessions stored server-side in PostgreSQL
- ✅ HTTP-only cookies (JavaScript can't access)
- ✅ Secure cookies in production (HTTPS only)
- ✅ SameSite=lax protection against CSRF
- ✅ All API routes protected except auth endpoints
- ✅ Public share links still work without login

## 📁 Files Changed/Added

**New files:**
- `auth.js` - authentication middleware and functions
- `public/login.html` - login page
- `public/register.html` - registration page

**Modified files:**
- `server.js` - added session setup, auth routes, and route protection
- `package.json` - added bcrypt, express-session, connect-pg-simple

## 🎯 What Works

- ✅ User registration with validation
- ✅ Login with username/password
- ✅ Session persistence (30 days)
- ✅ Protected API routes
- ✅ Logout functionality
- ✅ Password requirements (min 6 chars, username min 3 chars)
- ✅ Duplicate username prevention
- ✅ Public share links bypass auth

## 🔄 Next Steps (Optional Enhancements)

For future iterations, consider:
- [ ] User profile page with password change
- [ ] "Remember me" checkbox
- [ ] Password reset via email
- [ ] Role-based access control (admin vs user)
- [ ] Activity logs per user
- [ ] User management dashboard (list/edit/delete users)
- [ ] Two-factor authentication
- [ ] Social login (Google, GitHub)

## 🧪 Testing Commands

```bash
# Test registration
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123"}'

# Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123"}' \
  -c cookies.txt

# Test protected route
curl http://localhost:3000/api/briefings \
  -b cookies.txt

# Test logout
curl -X POST http://localhost:3000/api/auth/logout \
  -b cookies.txt
```

## ⚠️ Important Notes

1. **Change SESSION_SECRET** - The default is insecure!
2. **HTTPS in production** - Secure cookies require HTTPS
3. **Database backups** - User accounts are in PostgreSQL
4. **First user** - Anyone can register initially, secure the register page if needed

## 📞 Support

If you encounter issues:
1. Check server logs for error messages
2. Verify DATABASE_URL is set correctly
3. Ensure PostgreSQL is running
4. Confirm session table was created
5. Test with curl commands above

---

**Deployed:** January 29, 2025
**By:** Ethan (AI Agent)
**Status:** Ready for production
