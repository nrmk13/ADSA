# @acme/ui — agent readiness

**45 / 45** · Agent-ready · rubric 1.0 · 2026-09-10

Agents can work in this system. Keep the gates that make that true.

45/45 is at or above Astryx (33), the highest of the 12 public design systems measured with this rubric.

| Dimension | Score | Evidence |
| :-- | :-- | :-- |
| Agent instructions | 5 / 5 | AGENTS.md, 20 lines. Contains an import rule, a lookup command, token rules, a list of what is forbidden, a check to run before finishing. |
| Machine surface | 5 / 5 | .mcp.json registers adsa. |
| Docs coverage | 5 / 5 | 6 of 6 importable components have a guide (100%). CI runs a documentation check. |
| Docs freshness | 5 / 5 | 12 guides, 18 code blocks, 6 with a prop table. 12 guides carry a generated marker. Every symbol imported in the guides exists in the source. CI checks the guides against the code. |
| Tokens | 5 / 5 | Token documentation: guidelines/design-tokens.md. Motion documented; spacing documented. |
| Patterns | 5 / 5 | Pattern-level docs: guidelines/patterns/detail-view.md, guidelines/patterns/empty-state.md, guidelines/patterns/index.md, guidelines/patterns/list-page.md. A task-to-component table exists in the guides. |
| Accessibility documentation | 5 / 5 | 12 of 12 guides carry a keyboard or accessibility section (100%). At least some of those sections are generated rather than hand-written. Accessibility checks run in CI. |
| Verification | 5 / 5 | 1 test file, 6 stories. Scripts: test, typecheck, lint. CI: .github/workflows/adsa.yml, .github/workflows/docs.yml. Stories are rendered and tested in CI. Accessibility assertions run as part of that. The agent-readiness score itself is gated in CI. |
| Gap handling | 5 / 5 | A list of known absences exists: GAPS.md. The agent instructions tell the agent to stop and ask instead of inventing. A gap can be reported with `gap:report`. |

## What to do, in order

- Nothing outstanding. Re-run after the next release.

---

*From one designer to all designers, with love <3*
