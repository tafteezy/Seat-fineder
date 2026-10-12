# Seat finder: going live

## 1. Database (about 5 minutes)
1. Create a free project at supabase.com.
2. Open **SQL Editor**, paste all of `schema.sql`, and press **Run**.
3. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key into `config.js`.

## 2. Email (optional but recommended)
1. Create a free account at resend.com and verify your sending domain. Copy an API key.
2. Install the Supabase CLI, then from this folder run:
   - `supabase login`
   - `supabase link --project-ref YOUR-PROJECT-REF`
   - `supabase secrets set RESEND_API_KEY=... MAIL_FROM="Seat Finder <hello@yourdomain.com>" SITE_URL=https://yourdomain.com`
   - `supabase functions deploy send-links --no-verify-jwt`
3. If you skip this, publishing still works. The ready page just shows the links instead of saying they were emailed.

## 3. Host the site
Upload this folder (index.html, style.css, script.js, config.js) to Netlify, Vercel or Cloudflare Pages and attach your domain.
Set `SITE_URL` above to that address. Links look like `https://yourdomain.com/#/tafara-shantel`.

## 4. Before the first real wedding
- Test the whole flow on the live domain: publish, scan the QR code on a phone, search a name, open the management link.
- Add a privacy policy and a Terms page, and link them from the publish step.
- Delete weddings after the event: `delete from weddings where wedding_date < now() - interval '30 days';`
- To stop people mass-creating weddings, turn on Supabase's rate limits or add a CAPTCHA (Cloudflare Turnstile) to the publish button.
