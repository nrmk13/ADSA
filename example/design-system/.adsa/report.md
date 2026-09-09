# @acme/ui — agent readiness

**23 / 45** · rubric 1.0 · 2026-09-09

An agent will produce plausible, wrong UI here more often than not.

| Dimension | Score | Evidence |
| :-- | :-- | :-- |
| Agent instructions | 5 / 5 | AGENTS.md, 20 lines. Contains an import rule, a lookup command, token rules, a list of what is forbidden, a check to run before finishing. |
| Machine surface | 5 / 5 | .mcp.json registers adsa. |
| Docs coverage | 1 / 5 | 3 of 6 importable components have a guide (50%). Undocumented, first few: Badge, Modal, Table. CI runs a documentation check. |
| Docs freshness | 1 / 5 | 4 guides, 7 code blocks, 0 with a prop table. No guide is marked as generated, so every table is hand-maintained. 1 imports in the guides name symbols this repo does not export, e.g. ButtonGroup in guidelines/button.md. Nothing compares the guides to the code. |
| Tokens | 3 / 5 | Token documentation: guidelines/design-tokens.md. Motion documented; spacing documented. 2 raw palette classes in guide examples, e.g. bg-gray-100, text-blue-600. |
| Patterns | 1 / 5 | Components only. Nothing describes how a page is assembled. |
| Accessibility documentation | 1 / 5 | 0 of 4 guides carry a keyboard or accessibility section (0%). No automated accessibility check found. |
| Verification | 3 / 5 | 0 test files, 0 stories. No test, typecheck or lint script. CI: .github/workflows/adsa.yml. The agent-readiness score itself is gated in CI. |
| Gap handling | 3 / 5 | A list of known absences exists: GAPS.md. The agent instructions tell the agent to stop and ask instead of inventing. No way for an agent to report a new gap where the next agent will read it. |

## What to do, in order

- [ ] **Fail CI on an undocumented export** (S) — Docs coverage, +4 available. `adsa fix coverage-gate`
- [ ] **Generate prop tables from types** (M) — Docs freshness, +4 available. `adsa fix prop-tables`
- [ ] **Compile guide examples in CI** (M) — Docs freshness, +4 available. `adsa fix examples-check`
- [ ] **Document tokens as tables** (S) — Tokens, +2 available. `adsa fix tokens-doc`
- [ ] **Write page-level patterns** (L) — Patterns, +4 available. `adsa fix patterns-doc`
- [ ] **Add keyboard and accessibility sections** (M) — Accessibility documentation, +4 available. `adsa fix a11y-docs`
- [ ] **Put the checks in CI** (S) — Verification, +2 available. `adsa fix ci-workflow`
- [ ] **List what the system does not have** (S) — Gap handling, +2 available. `adsa fix gaps-file`

---

*From one designer to designers with love <3*
