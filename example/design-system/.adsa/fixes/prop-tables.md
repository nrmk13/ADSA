# Fix: generate prop tables from types

**Dimension:** Docs freshness · **Size:** M · **Repo:** @acme/ui · **Stack:** React, TypeScript, Tailwind

A hand-written prop table is a copy of the truth, and copies rot. Generate it.

## What to build

A script that reads the built type declarations and rewrites the prop table inside
each guide, between markers, leaving everything else in the file untouched.

1. Build the package first, then read the emitted `.d.ts` files — not the source.
   The published types are what a consumer sees, and they are not always identical
   to the source.
2. For each documented component, resolve its props type and emit a table with
   name, type, required, default and description.
3. Write it into the guide between `<!-- props:start -->` and `<!-- props:end -->`.
   Create the block if it is missing. Never touch text outside the markers.
4. Preserve hand-written Default and Description cells across regeneration: read
   the existing table first and carry those two columns over by prop name.
5. Add the script to CI so it runs, then fails if the working tree changed.

Guides live in `guidelines`. Components: `src/components`.

## Traps that cost us time

- Sort union members. TypeScript returns them in internal order, which differs
  between machines, so an unsorted table makes CI fail on somebody else's laptop.
- Inherited props from a headless library (your headless primitives) are real props consumers
  pass. Either list them in a separate "Inherited" table with the source interface
  named, or state clearly that they are not covered. Do not silently drop them.
- Generic props whose type is a type parameter need the base constraint resolved,
  otherwise you print `T` instead of the twelve literal values.
- Run the formatter after generating, as a separate commit, and check the exit code
  explicitly. A piped command hides a non-zero exit.

## Done when

- `npm run <your script>` rewrites every table with no manual step.
- CI fails when a table is stale.
- Re-running twice produces no diff.
