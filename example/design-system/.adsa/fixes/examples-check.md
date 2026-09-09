# Fix: compile the guide examples in CI

**Dimension:** Docs freshness · **Size:** M · **Repo:** @acme/ui · **Stack:** React, TypeScript, Tailwind

Every code block in the guides is a promise. Compile them and find out which ones
the system no longer keeps.

## What to build

A script that extracts every TypeScript or TSX block from `guidelines` and type
checks it against the **built** package, then fails with file and line numbers.

1. Extract fenced blocks tagged `tsx`, `ts`, `jsx` or `js`.
2. Most blocks are fragments with no imports. Build a per-file import registry:
   collect the imports from that guide's own Import section and prepend them to
   every fragment in the same file. This is what makes wrong props detectable.
3. Unknown identifiers that are clearly out of scope become `declare const X: any`
   so the check stays about props and imports, not about the surrounding app.
4. Allow an explicit escape hatch — a comment above the block with a reason — and
   print how many blocks are skipped so the number cannot creep up quietly.
5. Report as `path:line — message`, and exit non-zero on the first failure.

## Expect to find

Real bugs, not formatting: icons that no longer exist, compound APIs that were
never implemented, required props missing from examples, imports pointing at the
wrong subpath. In our own run this flagged 13 guides out of 59 on the first pass.

## Verify the check itself

Break one example on purpose — rename a prop to something that cannot exist — and
confirm the script fails with the right line. A check that never fails is not a check.

## Done when

- Every block compiles or is explicitly skipped with a stated reason.
- CI runs it on every pull request.
