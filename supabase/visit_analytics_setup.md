# Visit Analytics Setup

This feature stores anonymous visit analytics through a Supabase Edge Function.
The frontend does not store raw IP addresses and does not call any third-party IP lookup service.

## 1. Create database objects

Run `supabase/visit_analytics.sql` once in the Supabase SQL Editor.

## 2. Configure Edge Function secrets

Set these secrets in Supabase before deployment:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set VISIT_ANALYTICS_SALT=your_random_private_salt
```

Notes:

- Do not put `SUPABASE_SERVICE_ROLE_KEY` in frontend code or commit it to GitHub.
- `VISIT_ANALYTICS_SALT` should be a private random string. Changing it will change future `ip_hash` values.
- Country/region/city are read only from edge/network request headers. If the provider does not supply city headers, `city` will be empty.

## 3. Deploy the function

```bash
supabase functions deploy track-visit
```

`supabase/config.toml` sets `verify_jwt = false` for this function so anonymous visitors can send page view events.

## 4. Data collected

The table stores:

- page views
- unique visitor IDs generated in browser localStorage
- coarse country/region/city when available from request headers
- desktop/mobile/tablet device type
- operating system
- browser name/version
- gallery load duration and image counts
- `ip_hash`, not raw IP