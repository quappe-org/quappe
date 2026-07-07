# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server (default http://localhost:5173). Seeds ~200 theses on first authenticated request.
- `npm run dev:all` — same, but also starts `ollama serve` in parallel (needed for `/my` and `/pulse` reports).
- `npm run build` / `npm run preview` — production build + local preview.
- `npm run check` — `svelte-kit sync` + `svelte-check` against `tsconfig.json`. This is the type-check equivalent; there is no separate lint or test suite.
- `npm run paraglide:compile` — regenerate `src/lib/paraglide/` after editing `messages/*.json`. Also runs automatically via the `prepare` script.
- `QUAPPE_SEED_COUNT=100000 npm run dev` — override seed size for stress tests. `scripts/stress.ts` (via `node --experimental-strip-types`) runs a headless million-thesis load.
- `QUAPPE_DB_PATH=/tmp/foo.db npm run dev` — point at a different SQLite file. Default is `.data/quappe.db`.

Ollama defaults: `OLLAMA_URL=http://127.0.0.1:11434`, `OLLAMA_MODEL=llama3.1:8b`, `OLLAMA_TIMEOUT=60000`. Without Ollama, `/my` and `/pulse` still render with a "LLM nicht verfügbar" fallback — nothing else depends on it.

## Architecture

### Data layer — SQLite façade

State lives in `.data/quappe.db` (better-sqlite3, synchronous, WAL journal). The full architecture is intentionally simple: **`src/lib/stores/data.ts` is a façade with ~38 exports that are the only surface every consumer imports.** Its internals delegate to `src/lib/server/db/*`.

- `src/lib/server/db/index.ts` — lazy singleton `getDb()`, module-scoped prepared-statement cache in `prepare(sql)`, `withTransaction(fn)`, `isDbEmpty()`. Schema in `schema.sql` runs on first `getDb()` call. `hooks.server.ts` eagerly calls `getDb()` at import time so tables exist before any handler runs.
- `theses.ts`, `arguments.ts`, `votes.ts`, `embeddings.ts` — one module per table, each exposing `dbGet*/dbInsert*/dbUpdate*/dbDelete*` helpers built on cached prepared statements.
- `mappers.ts` — row↔domain conversions (`rowToThesis(row, votes)` etc.) and `Float32Array ↔ Buffer` for embedding BLOBs. Reads always copy bytes into a fresh `ArrayBuffer` so the DB row buffer is never shared.

Non-obvious decisions to preserve:

- **Single `votes` table** with `(target_type, target_id, user_id)` PK — argument and thesis votes coexist so `getVotesByUserSince` is one query. FK integrity is enforced at the application layer (`deleteThesis`/`deleteArgument` explicitly clear votes); `arguments.thesis_id` has `ON DELETE CASCADE` but the votes cleanup for cascaded arguments is manual.
- **Tier is derived, not stored.** There are no separate hot/warm/cold tables — every "tier" query filters by `lifecycle_state`. Hot = `seedling|discussed|contested|crystallized`, warm = `faded`, cold = `dormant`.
- **Embedding warm cache.** `data.ts` holds `Map<string, Float32Array>` mirrors that lazy-load from `dbGetAllEmbeddings('thesis'|'argument')` on first access. Writes (`setThesisEmbedding` / `setArgumentEmbedding`) are write-through (Map + DB). Semantic search reads only from the Map.
- **In-memory derived caches stay in `data.ts`** (30 s TTL): `_heatCache`, `_argCountsCache`, `_activityCache`, `_dataVersion`/`bumpVersion()`. Every write path bumps the version to invalidate them.
- **Seed gate.** `seedData(devUserId?)` returns immediately if `dbTierStats().total > 0`. When it runs, it builds all rows in memory, sorts arguments so fork sources come before their forks (self-FK on `arguments.forked_from_id`), and flushes in one `withTransaction`. The `seedOnce` guard in `dev-seed.ts` fires on the first authenticated request in dev.

### Domain model (`src/lib/models/types.ts`)

- `Thesis` has `lifecycle: LifecycleInfo` (state + `state_since` + `quality_score`) and `lang?` (2-letter ISO, filled by a nightly LLM backfill).
- `Argument` has `stance: 'support' | 'reject'`, `attributes: ArgumentAttribute[]` (evidence type + optional URL), optional `forked_from_id`, and `categories?` filled asynchronously by an LLM job — arguments start uncategorised on purpose.
- `Vote` has `weight: 1..5`. Weight 1 is free; extra weight comes from the daily budget (see `src/lib/server/limits.ts`).

Lifecycle recomputation lives in `data.ts::reevaluateLifecycle(id)` (uses `models/lifecycle.ts`). It reads via DB, computes the new state, writes back with `dbUpdateThesisLifecycle`. Every mutating endpoint that could change activity calls it.

### Server startup (`src/hooks.server.ts`)

Four background loops kick off at module load, all fire-and-forget:

1. **Embedding warmup + backfill** — waits for the Xenova model to warm, waits for `isSeeded()`, then embeds every thesis missing a vector. Semantic search only activates once this completes.
2. **Pulse cache loop** — refreshes `/pulse` LLM output every 24 h; falls back gracefully if Ollama is down.
3. **Argument categorization loop** — nightly, assigns `categories` to uncategorised arguments via LLM.
4. **Language backfill loop** — nightly, fills `thesis.lang` for rows where it's null.

The `handle` hook wraps every request in `paraglideMiddleware` (locale from URL prefix, cookie, `Accept-Language`, or `baseLocale`), then calls `ensureUserId(cookies)` — every non-asset request lands in handlers with a valid `event.locals.user_id` from a signed cookie. **Handlers never trust `author_id`/`user_id` fields from the request body.** API writes >32 KB are rejected before JSON parse.

### i18n (Paraglide)

- Base locale: `en`. Additional: `de`, `fr`, `es`. Messages in `messages/{locale}.json`, compiled into `src/lib/paraglide/` (git-ignored — regenerated by `prepare`).
- URL strategy: EN is unprefixed, others get `/de/…`, `/fr/…`, `/es/…`. `src/hooks.ts` (client + server `reroute`) de-localizes the URL so SvelteKit's router matches the canonical route tree — the prefix stays in the browser URL only.

### UI

- SvelteKit 2 + Svelte 5 with **runes mode forced everywhere except `node_modules`** (see `vite.config.ts`). Use `$state`, `$derived`, `$effect`; do not use legacy stores syntax in new components.
- No CSS framework, no UI library. Hand-written CSS with CSS variables.
- Client-side state lives in `src/lib/stores/*.svelte.ts` (rune-based) for UI concerns (theme, complexity, budget, activity, seen updates). These are browser-only; server state is always fetched.
- Hidden admin console at `/admin` (not linked in nav) shows a ring buffer of server events from `src/lib/stores/logger.ts`.

## Working in this codebase

- **Do not reintroduce in-memory Maps for domain data.** The migration to SQLite was deliberate — every read and write goes through `data.ts` → `src/lib/server/db/*`. If a new query is needed, add a `dbGet*` helper alongside the others.
- Consumer modules (`+server.ts` handlers, `hooks.server.ts`, `pulse.ts`, `similarity.ts`, `argument-categorization.ts`) only import from `$lib/stores/data`. Keep the façade's exports and signatures stable.
- `better-sqlite3` is declared in Vite's `ssr.external` and `optimizeDeps.exclude`. If you add another native module, add it in both places.
- ISO-8601 strings are the canonical timestamp format (they sort lexicographically, and `getActivityCalendar` relies on `iso.slice(0,10)`).
- Domain design decisions are documented in `.meta/*.skill` files — update them when you change a decision.
