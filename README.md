# Expo launcher

A private one-page launcher for the Holdco expo booth. Tap a tile and that Axiom or Tecleef demo opens in a new tab, already logged in as its demo user.

Design spec and implementation plan: the "Expo Demo Launcher — Design Spec" Claude Doc (two tabs).

## How a tap works

1. The tile opens a blank tab straight away (inside the tap, so pop-up blockers allow it).
2. The launcher's server checks the team session and decrypts that app's demo login.
3. The tab goes to the site's `/api/method/logout`, so a failed login can't leave someone else's session open.
4. 700 ms later a hidden form posts `usr` and `pwd` to the site's `/api/method/login` in that tab.
5. After the tile's delay (default 1500 ms) the tab goes to the app.

Apps on the same site share one session; tiles show this with the same colour edge.

## Setup

1. **Supabase:** create a project (Frankfurt region). In the SQL editor run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`. Check `select count(*) from apps` returns 11.
2. **Secrets:** `node scripts/setup-secrets.mjs "<team password>"` prints `TEAM_PASSWORD_HASH`, `SESSION_SECRET` and `CREDENTIALS_KEY`. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project settings › API). Put all five in `.env.local` for local runs.
3. **Check the database is closed:** `curl "$SUPABASE_URL/rest/v1/apps?select=*" -H "apikey: <anon key>"` must return `[]`.
4. **Deploy:** push to a private GitHub repo, import into Vercel, add the five variables to Production, deploy. The URL should redirect to `/login`.
5. **Smoke test:** `curl -i https://<app>/api/apps` → `401`. Five wrong team passwords → the 5th shows the lockout message.
6. **Demo logins:** sign in, tap Edit, and for each login tile enter the username and password, Save, then Test login. Finish with Check all apps: every login tile green, Tecleef grey.

Local development: `npm install`, `npm run dev`, open http://localhost:3000 in Chrome (Safari won't keep the Secure session cookie on plain http).

## Rehearsal, the day before

- [ ] Sign in on the booth device and browser; allow pop-ups for the launcher
- [ ] Tap every tile; each opens as the right demo user
- [ ] axiom.holdco.co: FM Client Portal, then FM, then the portal again — right user each time
- [ ] demo.axiomerp.co: ERP, then POS, then ARC
- [ ] Check all apps: all green

## After the expo

Change each demo user's password on its site. Run `setup-secrets.mjs` again and replace `TEAM_PASSWORD_HASH` and `SESSION_SECRET` in Vercel (this signs everyone out), or pause the Vercel project.

## Security notes

- Demo passwords are AES-256-GCM encrypted at rest; only `POST /api/launch/[id]` ever returns one, uncached, to a signed-in session.
- Use demo-only Frappe users with no admin rights and no two-factor login.
- Supabase has row-level security on with no policies; only the server's service-role key can read it.

## Tests

`npm test` — 105 unit and component tests.
