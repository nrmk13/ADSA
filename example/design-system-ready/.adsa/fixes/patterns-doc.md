# Fix: page-level patterns

**Dimension:** Patterns · **Size:** L · **Repo:** @acme/ui

Components tell an agent what exists. Patterns tell it what to build. Without them
every agent re-invents page structure, and no two screens come out the same.

## Where the content comes from

Do not invent patterns. Take four or five real pages that already exist in the
product — the ones that repeat — and describe what they actually are. A list page,
a settings form, a detail view, an empty state, a wizard. If the design lives in
Figma, read the real frames rather than imagining the layout.

## What each pattern needs

- **When to use it**, in one sentence, phrased the way someone would ask for it.
- **Skeleton**: the component tree, with the actual imports from this system.
- **States**: loading, empty, error, permission denied. This is the half agents skip.
- **Traps**: the mistakes people make on this pattern in this system.
- **What it is not**: the neighbouring pattern it gets confused with.

## How it should load

Not always in context. One file per pattern with a one-line description an agent
matches against the task, and the body pulled in only when it matches. Always-loaded
patterns eat the context window that the component guides need.

## Done when

- Four or five patterns exist, each with skeleton, states and traps.
- Each one names the real components it uses, and those imports compile.
