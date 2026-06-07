# Innsights

Innsights is the hotel development and investment management platform by **Witness Investments** — covering project budgets, draws, schedules, takeoffs, capital stack, expenses, vendor bidding, invoice approvals, and investor reporting.

## Tech stack

- **Vite** + **React** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui**
- **Supabase** (Postgres, Auth, Storage, Edge Functions)

## Getting started

Requirements: Node.js (or Bun) installed.

```sh
# 1. Clone the repo
git clone <YOUR_GIT_URL>
cd Innsights

# 2. Install dependencies
npm install        # or: bun install

# 3. Configure environment
cp .env.example .env
#    then fill in:
#      VITE_SUPABASE_URL
#      VITE_SUPABASE_PUBLISHABLE_KEY

# 4. Start the dev server
npm run dev        # or: bun run dev
```

## Environment variables

See `.env.example`. The frontend requires:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |

## Supabase

- **Database schema:** `schema.sql` recreates the full schema (tables, RLS, indexes, triggers, functions, storage buckets) in a fresh Supabase project.
- **Edge functions:** see `edge-functions-list.md` for every function, what it does, and the secrets it needs. Deploy with `supabase functions deploy`.
- **Function secrets:** use `set-secrets.sh` (git-ignored) as a template to set integration secrets via `supabase secrets set`.

## Building for production

```sh
npm run build      # outputs to dist/
```
