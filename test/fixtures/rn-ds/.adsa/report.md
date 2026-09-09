# @acme/native-ui — agent readiness

**13 / 45** · Not ready · rubric 1.0 · 2026-09-09

There is nothing here for an agent to follow, so it will follow its own habits.

| Dimension | Score | Evidence |
| :-- | :-- | :-- |
| Agent instructions | 1 / 5 | No AGENTS.md, CLAUDE.md or equivalent in the repository. |
| Machine surface | 1 / 5 | No MCP server, no docs CLI, no llms.txt, no published skills: an agent has to read files. |
| Docs coverage | 3 / 5 | 2 of 2 importable components have a guide (100%). Nothing in CI stops a new export from shipping without a guide. |
| Docs freshness | 1 / 5 | 2 guides, 4 code blocks, 0 with a prop table. No guide is marked as generated, so every table is hand-maintained. Every symbol imported in the guides exists in the source. Nothing compares the guides to the code. |
| Tokens | 1 / 5 | No token documentation found in the guides. No motion documentation; no spacing documentation. |
| Patterns | 1 / 5 | Components only. Nothing describes how a page is assembled. |
| Accessibility documentation | 3 / 5 | 1 of 2 guides carry a VoiceOver/TalkBack or accessibility section (50%). No automated accessibility check found. |
| Verification | 1 / 5 | 0 test files, 0 stories. No test, typecheck or lint script. No CI workflow found, so nothing runs on a pull request. |
| Gap handling | 1 / 5 | Nothing lists what the system deliberately does not have. No stop-and-ask rule, so an unlisted gap gets filled silently. No way for an agent to report a new gap where the next agent will read it. |

## What to do, in order

- [ ] **Write agent instructions** — Agent instructions 1 → 5, adsa writes it. `npx adsa-cli fix agents-md`
- [ ] **Expose the docs as MCP tools** — Machine surface 1 → 5, adsa writes it. `npx adsa-cli fix mcp-config`
- [ ] **Document tokens as tables** — Tokens 1 → 5, adsa writes it. `npx adsa-cli fix tokens-doc`
- [ ] **Put the checks in CI** — Verification 1 → 5, adsa writes it. `npx adsa-cli fix ci-workflow`
- [ ] **List what the system does not have** — Gap handling 1 → 5, adsa writes it. `npx adsa-cli fix gaps-file`
- [ ] **Generate prop tables from types** — Docs freshness 1 → 5, brief for your agent. `npx adsa-cli fix prop-tables`
- [ ] **Compile guide examples in CI** — Docs freshness 1 → 5, brief for your agent. `npx adsa-cli fix examples-check`
- [ ] **Write page-level patterns** — Patterns 1 → 5, brief for your agent. `npx adsa-cli fix patterns-doc`
- [ ] **Fail CI on an undocumented export** — Docs coverage 3 → 5, brief for your agent. `npx adsa-cli fix coverage-gate`
- [ ] **Add keyboard and accessibility sections** — Accessibility documentation 3 → 5, brief for your agent. `npx adsa-cli fix a11y-docs`

---

*From one designer to all designers, with love <3*
