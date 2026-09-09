# Agent-readiness experiment

Give this task to a coding agent in a **fresh session**, with no other context than
this repository and the design system it depends on.

## The task

Build one real page using **only @acme/ui**. Pick a page your product actually
has — a list with filters, a settings form, a detail view — not a showcase of
components.

Rules for the agent:

- Every UI element comes from @acme/ui. No second component library, no icons
  from anywhere else, no local copies of component source.
- Colour, spacing and typography come from the system's tokens.
- If something you need does not exist in the system, **stop and say so** instead of
  building your own version of it.
- Work to a running page, not a sketch.

## Then measure it

```bash
adsa eval score <the-project-you-just-built> --system example/design-system
```

The number that matters is how many imports name components the system does not
have. Everything else is commentary.

## What to record

| Metric | Round 1 | Round 2 |
| :-- | :-- | :-- |
| Components invented | | |
| Imports from the system | | |
| Forbidden packages | | |
| Raw palette classes | | |
| Time to a working page | | |

Run it again after the fixes. The gap between the two columns is the argument.
