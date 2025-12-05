# Waitlist Landing Page Setup Guide

## Overview

This waitlist landing page is built using Next.js App Router and is designed for `journal.myfinediet.com`. It includes:

- Clean, branded landing page with form
- Supabase-backed submissions
- Optional Google Sheets webhook integration
- Email validation
- Success/error state handling

## File Structure

```
app/
  ├── layout.tsx          # Root layout with metadata
  ├── page.tsx            # Waitlist landing page (client component)
  └── api/
      └── waitlist/
          └── route.ts    # API route for form submissions
```

## Environment Variables

Add these to your `.env.local` file:

```env
# Supabase Configuration (required)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here

# Optional: Google Sheets Webhook
SHEETS_WEBHOOK_URL=your-google-sheets-webhook-url-here
```

## Supabase Setup

### 1. Create the `waitlist` table

Run this SQL in your Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  goal TEXT,
  source TEXT DEFAULT 'journal',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);

-- Create index on source for filtering
CREATE INDEX IF NOT EXISTS idx_waitlist_source ON waitlist(source);

-- Enable RLS (Row Level Security)
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to insert (for API routes)
CREATE POLICY "Service role can insert waitlist entries"
  ON waitlist
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Allow service role to read (for admin purposes)
CREATE POLICY "Service role can read waitlist entries"
  ON waitlist
  FOR SELECT
  TO service_role
  USING (true);
```

### 2. Verify Environment Variables

Ensure your `.env.local` has:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Google Sheets Webhook (Optional)

If you want to also send submissions to Google Sheets:

1. Create a Google Apps Script webhook
2. Set up the webhook URL in your `.env.local` as `SHEETS_WEBHOOK_URL`
3. The API will automatically POST to this URL when submissions are received

Example Google Apps Script:

```javascript
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = JSON.parse(e.postData.contents);
  
  sheet.appendRow([
    new Date(),
    data.email,
    data.name || '',
    data.goal || '',
    data.source || 'journal'
  ]);
  
  return ContentService.createTextOutput(JSON.stringify({success: true}))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## Routing Considerations

⚠️ **Important**: This project uses both Pages Router (`pages/`) and App Router (`app/`).

- The App Router (`app/page.tsx`) will take precedence for the root route `/`
- If you want to keep the existing homepage at `/`, you can:
  1. Move the waitlist page to `app/journal-waitlist/page.tsx` and access it at `/journal-waitlist`
  2. Or deploy this to a separate subdomain/route

## Local Testing

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   - Copy `.env.local.example` to `.env.local` (if it exists)
   - Add your Supabase credentials

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Test the waitlist form**:
   - Navigate to `http://localhost:3000`
   - Fill out the form and submit
   - Check Supabase dashboard to verify the entry was created

## Deployment to Vercel

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Add waitlist landing page"
   git push origin main
   ```

2. **Configure Vercel Environment Variables**:
   - Go to your Vercel project settings
   - Add these environment variables:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `SHEETS_WEBHOOK_URL` (optional)

3. **Deploy**:
   - Vercel will automatically deploy on push to main
   - Or trigger a manual deployment from the Vercel dashboard

## DNS Configuration for journal.myfinediet.com

1. **In Vercel**:
   - Go to your project settings → Domains
   - Add `journal.myfinediet.com`
   - Vercel will provide DNS records

2. **In your DNS provider**:
   - Add a CNAME record:
     - Name: `journal`
     - Value: `cname.vercel-dns.com` (or the value Vercel provides)
   - Or add an A record if Vercel provides an IP

3. **Wait for propagation**:
   - DNS changes can take up to 48 hours
   - Use `dig journal.myfinediet.com` or online DNS checkers to verify

4. **SSL Certificate**:
   - Vercel automatically provisions SSL certificates via Let's Encrypt
   - No additional configuration needed

## Testing Checklist

- [ ] Form validation works (email required, valid format)
- [ ] Success message displays after submission
- [ ] Error handling works (duplicate email, network errors)
- [ ] Data appears in Supabase `waitlist` table
- [ ] Google Sheets webhook receives data (if configured)
- [ ] Page is responsive on mobile/tablet/desktop
- [ ] Styling matches Fine Diet brand aesthetic

## Troubleshooting

### "Missing SUPABASE_SERVICE_ROLE_KEY"
- Ensure `.env.local` has the service role key
- Restart the dev server after adding env vars

### "Failed to add to waitlist"
- Check Supabase table exists and has correct schema
- Verify RLS policies allow service_role to insert
- Check Supabase logs for detailed errors

### Routing conflicts
- If homepage conflicts, move waitlist to `app/journal-waitlist/page.tsx`
- Or deploy to a separate Vercel project for the subdomain

### Images not loading
- Ensure `/images/home/Fine-Diet-Logo.svg` exists in `public/` directory
- Check file paths are correct

## Support

For issues or questions, check:
- Next.js App Router docs: https://nextjs.org/docs/app
- Supabase docs: https://supabase.com/docs
- Vercel deployment docs: https://vercel.com/docs

