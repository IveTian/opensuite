# AGENTS.md

Project overview, architecture, and standard commands live in `README.md` and `CLAUDE.md`
(both are authoritative). MailFlare is a Cloudflare-based self-hosted email system:
dual Worker (`apps/web` Vite SPA + `apps/api` Hono) + external Postgres via Hyperdrive + R2.

## Cursor Cloud specific instructions

The dev environment is already provisioned in the VM snapshot (Node 24 via nvm, local
PostgreSQL 16, and gitignored local env files). The startup update script only runs
`pnpm install`; the steps below are the non-obvious things a fresh session must know.

### Services / how to run
- `apps/api` (Hono Worker) → `pnpm --filter @mailflare/api dev` on `http://localhost:8787`.
- `apps/web` (Vite SPA) → `pnpm --filter @mailflare/web dev` on `http://localhost:5173`.
- `pnpm dev` runs both in parallel (Turborepo).
- Validation: `pnpm typecheck` + `pnpm build` (there is no test framework and `lint` is a no-op echo — see `CLAUDE.md`).

### Postgres must be started manually each session
Local Postgres does NOT auto-start. At the start of a session run:
```
sudo pg_ctlcluster 16 main start
```
Connection: `postgres://postgres:postgres@localhost:5432/mailflare` (DB already migrated + seeded).
Migrations/seed only need re-running after schema changes: `pnpm db:migrate` / `pnpm db:seed`.

### GOTCHA: api `wrangler dev` needs the Hyperdrive local connection as a real env var
Wrangler reads the Hyperdrive local connection string from the process environment, NOT from
`.dev.vars`. Without it `pnpm --filter @mailflare/api dev` fails with "you should use a local
Postgres connection string to emulate Hyperdrive". Export it before starting the api:
```
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgres://postgres:postgres@localhost:5432/mailflare"
pnpm --filter @mailflare/api dev
```
(The Hyperdrive `id` in `apps/api/wrangler.jsonc` is a production placeholder and is irrelevant locally.)

### Local env files (gitignored, persisted in the snapshot)
- `packages/db/.env` — `DATABASE_URL` direct connection (used by drizzle-kit + seed; never a Hyperdrive string).
- `apps/api/.dev.vars` — `BETTER_AUTH_SECRET` plus local overrides `WEB_ORIGIN=http://localhost:5173`,
  `API_ORIGIN=http://localhost:8787`, `COOKIE_DOMAIN=""`. These override the production `vars` in
  `wrangler.jsonc` (which point at `*.thegather.company`) for local dev.
- `apps/web/.env.local` — `VITE_API_ORIGIN=http://localhost:8787`.
If these are ever missing (e.g. fresh clone), recreate them from the `*.example` files in the same dirs.

### Node version
Repo requires Node >=24. Login/tmux shells resolve to Node 24 (nvm default) + pnpm 10.33 automatically.
If a shell resolves `node` to the sandbox v22, prepend nvm: `export PATH="$(dirname $(nvm which 24)):$PATH"`.

### Smoke check
`curl http://localhost:8787/api/health` → `{"ok":true}` (runs `select 1` through Hyperdrive→Postgres).
Registration is invite-only, but the FIRST registrant (zero users) auto-becomes admin — open
`http://localhost:5173/register`.
