# Visit Analytics Setup

This feature stores anonymous visit analytics through a Supabase Edge Function.
The frontend does not store raw IP addresses and does not call any third-party IP lookup service.

## 1. Create database objects

Run `supabase/visit_analytics.sql` in the Supabase SQL Editor.

If you already ran an older version of this file, run it again. It uses `create table if not exists` and will add the GeoIP cache table, the `visit_analytics_rollup` aggregate table, and the `get_visit_analytics_summary` RPC without deleting old analytics rows.

The script also runs one initial refresh:

```sql
select public.refresh_visit_analytics_rollup();
```

After the updated `track-visit` Edge Function is deployed, each successful visit insert calls `refresh_visit_analytics_rollup()` immediately. No scheduled task is required.

## 2. Configure Edge Function secrets

Set a private analytics salt before deployment:

```bash
supabase secrets set VISIT_ANALYTICS_SALT=your_random_private_salt
```

Notes:

- Do not put service-role keys, secret keys, JWT secrets, or database passwords in frontend code or commit them to GitHub.
- Supabase automatically injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into Edge Functions; recent CLI versions may reject manually setting names that start with `SUPABASE_`.
- `VISIT_ANALYTICS_SALT` should be a private random string. Changing it will change future `ip_hash` values.

## 3. Deploy the function

```bash
supabase functions deploy track-visit --no-verify-jwt
```

`supabase/config.toml` also sets `verify_jwt = false` for this function so anonymous visitors can send page view events.

## 4. GeoIP behavior

The frontend still only calls `track-visit` and never sees raw IP addresses.

On the server side, `track-visit`:

1. Reads the visitor IP from request headers.
2. Computes `ip_hash` with `VISIT_ANALYTICS_SALT`.
3. Checks `visit_ip_geo_cache` for an existing country/region/city result.
4. If no cache entry exists, requests `ip-api.com` from the Edge Function server.
5. Stores only `ip_hash`, country/region/city, provider metadata, and first/recent access timestamps.

Raw IP addresses are not written to Supabase.

## 5. Data collected

The tables store:

- page views
- unique visitor IDs generated in browser localStorage
- coarse country/region/city from `ip-api.com` or edge request headers
- desktop/mobile/tablet device type
- operating system
- browser name/version
- bot user-agent visits in `bot_visit_logs`, excluded from visitor statistics
- crawler statistics in the `/analytics/` easter-egg page
- gallery load duration and image counts
- `ip_hash`, not raw IP