# Health Tracker - Troubleshooting Guide

## Issue: Website Shows "Loading..." and Never Opens

### Root Cause
The website gets stuck on the "Loading..." screen because the AuthProvider is waiting for the `/api/auth/me` endpoint to respond. This endpoint tries to connect to the database, and if the connection fails, it hangs indefinitely.

### Fixes Applied

✅ **Fix #1: Added Timeout to AuthProvider**
- Updated the auth check to have a 10-second timeout
- If the database is unreachable, the app will load the authentication screen instead of hanging

✅ **Fix #2: Created `.env` File**
- Prisma needs a `.env` file in the root directory
- Created `.env` with the same content as `.env.local`

### Remaining Issues to Fix

❌ **Fix #3: Invalid Database Credentials**
Your database credentials appear to be invalid. The error indicates "Tenant or user not found".

**What you need to do:**

1. Go to https://app.supabase.com
2. Sign in with your Supabase account
3. Select your project
4. Go to **Settings → Database**
5. Copy the **Connection String** (URI format with password)
6. Replace the DATABASE_URL in both `.env` and `.env.local` with the new connection string

**Example format:**
```
postgresql://postgres:[YOUR_PASSWORD]@[YOUR_HOST]:5432/postgres
```

### How to Test

1. **Start the development server:**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

2. **Open your browser:**
   ```
   http://localhost:3000
   ```

3. **Check browser console (F12 → Console tab):**
   - Look for logs from the AuthProvider
   - If you see "Auth check timeout", the database credentials are likely invalid

### Next Steps

1. Update your Supabase connection string
2. Restart the development server
3. The app should load the login/signup page (since you're not authenticated)
4. Try creating an account or logging in

---

## Additional Notes

- The app requires a valid PostgreSQL database connection (via Supabase)
- Auth tokens are stored in HTTP-only cookies
- Session timeout is set to 7 days
