# @acme/ui — the same six components, documented

![Agent-ready 45/45](https://img.shields.io/badge/agent--ready-45%2F45-166534)

The twin of `../design-system`, with the documentation work done. Same components,
same version. The difference is everything an agent needs and nothing a person sees:

| | `../design-system-as-found` | `../design-system` | here |
| :-- | :-- | :-- | :-- |
| Score | 11/45 | 23/45 after `fix --all` | **45/45** |
| Guides | 4, hand-written | 4 | 12, prop tables generated |
| Keyboard contracts | none | none | every guide, from one map |
| Page patterns | none | none | 4, with states and traps |
| Checks in CI | none | the score gate | the score gate and four documentation checks |

`scripts/` is the work: prop tables generated from the types, keyboard sections
generated from `guidelines/a11y-map.json`, a coverage gate over the package's own
`exports`, and a check that every code block in the guides imports and uses something
that exists. `test/checks.test.mjs` breaks the documentation on purpose and asserts
each check goes red with the right line, because a check that never fails is not a
check.

```bash
npm run check:docs     # all four, the way CI runs them
npm test               # the checks, checked
npx adsa-cli audit .   # 45/45
```
