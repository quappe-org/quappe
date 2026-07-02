# Quappe

An argumentation platform. Theses, arguments, evidence — no comment wars,
no flame trails, no anonymous insults masked as opinion.

Language is imprecise, opinions are everywhere — but commonality is hard to
find. Quappe is a structured space where positions can be stated clearly,
supported with reasoning, challenged with rigour, and respected even where
they differ.

## What's in the box

- **Theses** as first-class entities with a lifecycle (seedling → discussed →
  contested → crystallized → faded → dormant).
- **Arguments** grouped by stance (support / reject). No reply chains — instead
  you **fork** an argument and let the crowd vote which version stands.
- **Weighted voting**: casting a normal vote is free; adding extra weight
  (×2, ×3) costs from your daily budget.
- **Auto-detected evidence** from URLs. Paste a link, the server classifies it
  (study / authority / logical). Explicitly mark an argument as emotional if
  it is a heart matter — that overrides evidence detection.
- **Category drill-down**, complexity slider, activity streamgraph, heat
  indicator on each thesis card.
- **Anonymous identity** via a browser-local UUID. No usernames, no profiles,
  no follow graphs.
- **In-memory data store** for the MVP. Stress-tested up to ~1 M theses on a
  single Node process. Persistent storage lands in Phase 2.

## License

**Source-available, non-commercial** under the
[PolyForm Noncommercial 1.0.0](./LICENSE) license.

Plain-language summary in [`LICENSE-NOTES.md`](./LICENSE-NOTES.md).
Short version:

- ✅ Personal use, research, hobby projects
- ✅ Schools, universities, non-profits, government, public-interest orgs
- ✅ Forking, patching, sharing changes
- ❌ Selling it, running it as a paid service, or using it for commercial
  advantage inside a for-profit company

This is deliberately **not OSI-approved open source**. We want the code
visible and improvable, but we don't want anyone monetising the same
anti-social patterns we're trying to leave behind.

If you want commercial use, open an issue.

## Concepts (skill files)

The project's design decisions live in [`.meta/`](./.meta):

- [`.project`](./.meta/.project) — the "why" and mechanics
- [`.data.skill`](./.meta/.data.skill) — data model, lifecycle, budget, scale
- [`.ui.skill`](./.meta/.ui.skill) — layout, components, interaction patterns
- [`.service.skill`](./.meta/.service.skill) — API surface, roles, phases
- [`.audience.skill`](./.meta/.audience.skill) — who this is for

## Tech stack

- SvelteKit 2 + Svelte 5 (runes) + TypeScript
- No CSS framework, no UI library. Hand-written CSS with CSS variables.
- In-memory data store (Node process), replaceable in Phase 2.

## Getting started

```sh
npm install
npm run dev
```

The dev server starts at http://localhost:5173.
On first request the store seeds ~200 example theses.

### Stress test

Override the seed count for a bigger dataset:

```sh
QUAPPE_SEED_COUNT=100000 npm run dev
# or
QUAPPE_SEED_COUNT=1000000 node --max-old-space-size=8192 --experimental-strip-types scripts/stress.ts
```

The admin console (hidden, not linked in nav) is at
[`/admin`](http://localhost:5173/admin) and shows a live ring buffer of server
events (API requests, store mutations, lifecycle transitions, cache activity).

## Building

```sh
npm run build
npm run preview
```

## Contributing

By opening a PR you agree that your contribution is licensed under the same
PolyForm Noncommercial 1.0.0 terms as the rest of the project.

Please match the code style, keep hot-path allocations small, and add or update
the relevant `.meta/*.skill` file if you change a design decision.

## Status

Phase 1 (MVP): implemented and running.
Phase 2 (persistence + auth): planned.
Phase 3 (federation, mobile, SSO): later.
