# Cloud sync setup (Supabase)

This connects Pace Lyric to the cloud so you and a collaborator can sign in,
save work, and pick up where the other left off. One-time setup, ~10 minutes.

## 1. Create a free Supabase project
1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub or email.
2. **New project**. Pick any name (e.g. `pace-lyric`), set a database password
   (save it somewhere), choose the region closest to you, and create it.
3. Wait ~2 minutes for it to finish provisioning.

## 2. Create the database tables + security rules
1. In the project, open **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase/schema.sql` from this repo, copy **all** of it, paste it in.
3. Click **Run**. You should see "Success". (Safe to re-run anytime.)

## 3. Get your two public keys
1. Go to **Project Settings** (gear icon) → **API**.
2. Copy the **Project URL** and the **anon / public** key.
   > Do NOT use the `service_role` key — that one is secret.

## 4. Add the keys locally
1. In the repo, copy `.env.local.example` to `.env.local`.
2. Paste your values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOURPROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
3. Restart `npm run dev`.

## 5. Add the keys on Vercel (for the live version)
1. Vercel → your project → **Settings** → **Environment Variables**.
2. Add the same two variables (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) for **Production** (and Preview).
3. Redeploy.

## 6. Lock it down: admin-created accounts only
The app is **sign-in only** — there's no self-service sign-up. You (the owner)
create the two accounts by hand:

**a) Turn off public sign-ups** (so nobody can register themselves):
- **Authentication** → **Sign In / Up** (or **Providers → Email**) →
  turn **Allow new users to sign up** **OFF**.

**b) Create each user:**
- **Authentication** → **Users** → **Add user** → enter their **email** and a
  **password** → tick **Auto Confirm User** → **Create**.
- Repeat for the second person.
- Hand each person their email + password. That's their login.

To change a password later: **Authentication → Users →** pick the user → **Reset/Update**.

---

Once both env vars are set, the app shows a **Sign in** screen (no sign-up),
saves everything to the cloud, and lets you **Share** a project with the other
person's email. With the vars blank, the app runs exactly as before — fully
local, no accounts.
