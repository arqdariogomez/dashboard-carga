# Supabase Setup (Phase 1)

## 1) Apply schema

Use `supabase/schema.sql` in the Supabase SQL editor (or CLI migration).

## 2) Frontend env vars

Create `.env.local` from `.env.example`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_SUPABASE_BOARD_ID=
```

## 3) MCP auth note

If MCP actions fail with `Unauthorized`, your `SUPABASE_ACCESS_TOKEN` in Codex MCP config is not a valid Supabase PAT.

Use a Supabase Personal Access Token and restart Codex after updating config.

## 4) Current code artifacts

- `src/lib/supabaseClient.ts`: Supabase client bootstrap.
- `src/lib/cloudBoardRepository.ts`: load/save board tasks and mapping to `Project`.

The app still runs local-first until we wire the context/reducer to this repository in the next phase.

