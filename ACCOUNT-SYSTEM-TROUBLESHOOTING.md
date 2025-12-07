# Account System Troubleshooting Guide

## Issue: Login Fails After Email Confirmation

### Symptoms
- Signup succeeds and creates auth user + people record
- Email confirmation link is clicked
- Login attempt fails with "Invalid login credentials"

### Potential Causes & Solutions

#### 1. Supabase Auth Configuration

**Check Supabase Dashboard → Authentication → Settings:**

- **Email Confirmation**: 
  - If enabled: Users must confirm email before login
  - If disabled: Users can login immediately after signup
  - **Recommendation**: For testing, temporarily disable email confirmation. For production, keep enabled but ensure confirmation flow works.

- **Email Templates**:
  - Verify confirmation email template includes correct redirect URL
  - Default redirect: Should point back to your app (e.g., `https://myfinediet.com`)
  - Check that confirmation link works when clicked

#### 2. Email Normalization

**Issue**: Email case sensitivity or normalization mismatch

**Solution**: Our code normalizes emails to lowercase. Supabase should handle this, but verify:
- Check `auth.users` table - what case is the email stored in?
- Check `public.people` table - email should be lowercase
- If mismatch, there may be a Supabase configuration issue

**Debug**: Add console logging in `lib/authHelpers.ts` to see what email is being sent to Supabase.

#### 3. Password Verification

**Check**:
- Is the password being stored correctly in Supabase?
- Try resetting the password via Supabase dashboard
- Verify password meets Supabase requirements (if any are set)

**Test**: Try creating a new account with a different email to see if the issue persists.

#### 4. Session/Timing Issues

**Issue**: Confirmation email click doesn't immediately enable login

**Solution**:
- Wait 10-30 seconds after clicking confirmation link before attempting login
- Check Supabase logs for any errors during confirmation
- Verify the confirmation link actually confirmed the email (check `auth.users.email_confirmed_at`)

#### 5. Browser/Cache Issues

**Solution**:
- Clear browser cache and cookies
- Try in incognito/private mode
- Try a different browser
- Check browser console for errors

### Debugging Steps

1. **Check Supabase Auth Users Table**:
   ```sql
   SELECT id, email, email_confirmed_at, created_at 
   FROM auth.users 
   WHERE email = 'rashad@rairelabel.com';
   ```
   - Verify `email_confirmed_at` is NOT NULL (email is confirmed)
   - Verify email matches exactly (case-sensitive in auth.users)

2. **Check People Table**:
   ```sql
   SELECT id, email, auth_user_id, status 
   FROM public.people 
   WHERE email = 'rashad@rairelabel.com';
   ```
   - Verify `auth_user_id` is set
   - Verify email is lowercase

3. **Check Browser Console**:
   - Open DevTools → Console
   - Attempt login
   - Look for any error messages
   - Check Network tab for failed API calls

4. **Check Vercel Logs**:
   - Go to Vercel Dashboard → Your Project → Functions
   - Check `/api/account/link-person` invocations
   - Look for any errors

5. **Test Direct Supabase Auth**:
   - Try logging in via Supabase Dashboard → Authentication → Users
   - If this works, the issue is in our code
   - If this fails, the issue is in Supabase configuration

### Quick Fixes to Try

1. **Disable Email Confirmation (Temporary)**:
   - Supabase Dashboard → Authentication → Settings
   - Toggle "Enable email confirmations" OFF
   - Test signup/login flow
   - Re-enable after testing

2. **Reset Password**:
   - Supabase Dashboard → Authentication → Users
   - Find the user
   - Click "Send password reset email"
   - Use reset link to set new password
   - Try logging in with new password

3. **Manual Email Confirmation**:
   - Supabase Dashboard → Authentication → Users
   - Find the user
   - Manually confirm email (if option available)
   - Try logging in

4. **Check Redirect URLs**:
   - Supabase Dashboard → Authentication → URL Configuration
   - Verify "Site URL" matches your domain
   - Verify "Redirect URLs" includes your domain

### Code Improvements Made

1. **Better Error Messages**:
   - Login form now shows specific error messages for different failure types
   - Email confirmation errors are clearly indicated

2. **Enhanced Logging**:
   - Added console logging in `authHelpers.ts` for debugging
   - AccountDrawer logs auth state changes

3. **Session Handling**:
   - Added delay after login to allow session to propagate
   - AccountDrawer properly refreshes on auth state changes

### Next Steps

1. **Verify Supabase Settings**:
   - Check email confirmation is configured correctly
   - Verify redirect URLs are set
   - Check if any password policies are blocking login

2. **Test with Email Confirmation Disabled**:
   - Temporarily disable email confirmation
   - Test full signup → login flow
   - If it works, the issue is with email confirmation flow

3. **Check Supabase Logs**:
   - Supabase Dashboard → Logs
   - Look for authentication errors
   - Check for any rate limiting or security blocks

4. **Contact Supabase Support** (if needed):
   - If issue persists after checking all above
   - Provide: email, timestamp of signup/login attempts
   - Include any error messages from logs

### Expected Behavior After Fix

1. User signs up → Account created
2. User receives confirmation email
3. User clicks confirmation link → Email confirmed
4. User can immediately log in with same credentials
5. AccountDrawer shows logged-in view
6. User can access navigation shortcuts
7. User can log out and log back in

