# Contributing to Quappe

Thanks for wanting to help. Quappe is source-available under a noncommercial
license (see below) — contributions are welcome under the same terms.

## Ground rules

- Be excellent to each other — the [Code of Conduct](./CODE_OF_CONDUCT.md)
  applies to every interaction here.
- Discuss non-trivial changes in an issue first, so effort isn't wasted.
- Keep the mission in view: Quappe is a calm space for structured discourse,
  not a comment section. Features should serve consensus, clarity, and respect.

## Development setup

Requirements: Node (with `--experimental-strip-types` support) and npm.

```bash
npm install
npm run dev          # Vite dev server at http://localhost:5173
                     # seeds ~200 demo theses on first authenticated request
npm run dev:all      # dev + ollama serve (needed for /my and /pulse reports)
```

Useful commands:

```bash
npm run check              # svelte-kit sync + svelte-check (the type check)
npm run paraglide:compile  # regenerate translations after editing messages/*.json
npm run build && npm run preview
```

Environment knobs (all optional):

- `QUAPPE_SEED_COUNT=100000` — override demo seed size for stress tests.
- `QUAPPE_DB_PATH=/tmp/foo.db` — point at a different SQLite file.
- `QUAPPE_SECRET` — HMAC/JWT secret; set it so identities survive restarts.
- `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT` — local LLM for reports,
  translation, and variant drafting. Without Ollama those features degrade
  gracefully.

## Architecture in one breath

- **SQLite façade:** all reads/writes go through `src/lib/stores/data.ts`
  (backed by `src/lib/server/db/*`). Add a `dbGet*` helper rather than reaching
  into the DB directly.
- **UI is presentation-only:** Svelte components talk to the server through
  page `load` functions and `/api/*` — never import `data.ts` or `server/*`
  into a component. This keeps the frontend cleanly separable from the service
  later (the API is the contract).
- Design decisions live in `.meta/*.skill` and `.meta/.project`. If you change a
  decision, update the doc in the same PR.

See [`CLAUDE.md`](./CLAUDE.md) for the fuller architecture tour.

## Before you open a PR

1. `npm run check` passes (0 errors, 0 warnings).
2. If you touched `messages/*.json`, run `npm run paraglide:compile`.
3. Keep commits focused; write a concise message that matches the repo style
   (`area: what changed` — see the git log).
4. Update relevant docs (`.meta/*`, `CLAUDE.md`) when you change behaviour.
5. Don't commit secrets or the local `.data/` database.

There is no separate lint or test suite yet — `npm run check` is the gate.

## Licensing of contributions

By opening a pull request you agree that your contribution is licensed under
the same terms as the project: **PolyForm Noncommercial 1.0.0**
(see [`LICENSE`](./LICENSE) and [`LICENSE-NOTES.md`](./LICENSE-NOTES.md)).

## Known advisories

`npm audit` reports a few issues transitively via `@xenova/transformers`
(the server-side embedding model). These are assessed and accepted for the MVP
— do not "fix" them with `npm audit fix --force` (it downgrades the model and
breaks semantic search). See `CLAUDE.md` for the reasoning.
