# Fix: keyboard and accessibility sections in every guide

**Dimension:** Accessibility documentation · **Size:** M · **Repo:** @acme/ui · **Stack:** React, TypeScript, Tailwind

An agent cannot infer keyboard behaviour from a prop table, so it ships a div that
looks like a menu and answers to nothing. Write the behaviour down — generated, so
it stays true.

## What to build

1. Map each component to the primitive it is built on (your headless primitives). If the system
   is built on a headless library, the primitive already defines keys, focus
   behaviour and roles: read that mapping from the component's own inherited
   interfaces rather than guessing per component.
2. Write a table per primitive: keys and what they do, focus behaviour, the ARIA
   role, and whether an accessible name is required.
3. Generate a `### Keyboard & accessibility` section into every guide between
   markers. Components that are genuinely not interactive get one honest line
   saying so — silence reads as an omission.
4. Keep a hand-written `### Notes` subsection that survives regeneration, for the
   things the primitive does not capture.
5. Where the mapping is uncertain, print a confidence marker instead of inventing
   a key list.

## Traps

- One primitive interface is often shared by two very different components. Check
  the pairs before trusting the mapping.
- Components that pick props instead of extending an interface will not be detected
  automatically; keep a small explicit override list.

## Done when

- Every guide has the section, generated from the map.
- The generator is idempotent and runs in CI.
