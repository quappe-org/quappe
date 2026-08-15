# Security Policy

> Draft policy for the MVP. The reporting path below is live; the finer details
> (response-time commitments, scope, safe-harbour wording) will be firmed up.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

- Preferred: open a private
  [security advisory](https://github.com/quappe-org/quappe/security/advisories/new).
- Include: what you found, how to reproduce it, and the potential impact.

We aim to acknowledge reports promptly and will keep you updated as we
investigate and fix. Please give us a reasonable window to remediate before any
public disclosure.

## Scope

Quappe is an anonymous, MVP-stage discourse platform. Areas of particular
interest:

- **Identity / auth:** the anonymous JWT identity (`src/lib/server/identity.ts`)
  — forging identities, bypassing the signed cookie.
- **Budget / abuse guards:** server-side daily budgets
  (`src/lib/server/budget.ts`) and rate limits (`src/lib/server/limits.ts`) —
  ways to bypass them, Sybil amplification.
- **Injection / data integrity:** anything that lets a request write data it
  shouldn't, or read another user's private state.

## Known and accepted

`npm audit` flags transitive advisories via `@xenova/transformers` (the
server-side embedding model): protobufjs/onnx/sharp. These concern parsing
*untrusted* protobuf/ONNX; Quappe only loads a fixed, trusted model and passes
no user input through it, so real-world exposure is negligible. The only
`audit fix` is a breaking downgrade that removes semantic search. Tracked for a
proper fix by migrating to `@huggingface/transformers`.

## Not in scope

- Denial of service from raw request volume (rate limiting is best-effort MVP).
- Issues requiring a compromised host or physical access.
