# AcmeComponents — agent readiness

**15 / 45** · Not ready · rubric 1.0 · 2026-09-09

There is nothing here for an agent to follow, so it will follow its own habits.

| Dimension | Score | Evidence |
| :-- | :-- | :-- |
| Agent instructions | 1 / 5 | No AGENTS.md, CLAUDE.md or equivalent in the repository. |
| Machine surface | 1 / 5 | No MCP server, no docs CLI, no llms.txt, no published skills: an agent has to read files. |
| Docs coverage | 3 / 5 | 2 of 2 importable components have a guide (100%). Nothing in CI stops a new export from shipping without a guide. |
| Docs freshness | 1 / 5 | 2 guides, 4 code blocks, 0 with a prop table. No guide is marked as generated, so every table is hand-maintained. Every symbol imported in the guides exists in the source. Nothing compares the guides to the code. |
| Tokens | 3 / 5 | No token documentation found in the guides. 3 named tokens defined in XML resources (src/main/res/values/colors.xml), e.g. brand_primary, surface, on_primary — real, but nothing in prose describes when to use which. No motion documentation; no spacing documentation. |
| Patterns | 1 / 5 | Components only. Nothing describes how a page is assembled. |
| Accessibility documentation | 3 / 5 | 1 of 2 guides carry a TalkBack/content description section (50%). No automated accessibility check found. |
| Verification | 1 / 5 | 0 test files, 0 stories. No test, typecheck or lint script. No CI workflow found, so nothing runs on a pull request. |
| Gap handling | 1 / 5 | Nothing lists what the system deliberately does not have. No stop-and-ask rule, so an unlisted gap gets filled silently. No way for an agent to report a new gap where the next agent will read it. |

## What to do, in order

- [ ] **Write agent instructions** (S) — Agent instructions, +4 available. `adsa fix agents-md`
- [ ] **Put the checks in CI** (S) — Verification, +4 available. `adsa fix ci-workflow`
- [ ] **List what the system does not have** (S) — Gap handling, +4 available. `adsa fix gaps-file`
- [ ] **Fail CI on an undocumented export** (S) — Docs coverage, +2 available. `adsa fix coverage-gate`
- [ ] **Document tokens as tables** (S) — Tokens, +2 available. `adsa fix tokens-doc`
- [ ] **Expose the docs as MCP tools** (M) — Machine surface, +4 available. `adsa fix mcp-config`
- [ ] **Generate prop tables from types** (M) — Docs freshness, +4 available. `adsa fix prop-tables`
- [ ] **Compile guide examples in CI** (M) — Docs freshness, +4 available. `adsa fix examples-check`
- [ ] **Add keyboard and accessibility sections** (M) — Accessibility documentation, +2 available. `adsa fix a11y-docs`
- [ ] **Write page-level patterns** (L) — Patterns, +4 available. `adsa fix patterns-doc`

---

*From one designer to designers with love <3*
