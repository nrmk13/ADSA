# ADSA

A CLI and skill that scores a design system on how well coding agents can use it,
then fixes what it can. Zero runtime dependencies: people run it with `npx` inside
their own repository, and a dependency tree is a reason not to.

## Layout

```
bin/adsa.mjs        commands and output
lib/scan.mjs        reads a repo, returns facts — scores nothing
lib/score.mjs       applies rubric/rubric.json to those facts, with evidence
lib/report.mjs      self-contained HTML + markdown
lib/fix.mjs         fixes: "apply" writes files, "brief" writes a task spec
lib/mcp.mjs         stdio MCP server over the scanned guides
lib/eval.mjs        the experiment: task file, then measure what an agent built
rubric/rubric.json  the nine dimensions, 1/3/5 descriptors — the product's spine
templates/          what fixes write, including briefs/
skills/ds-audit/    the Claude Code skill that runs the whole audit
example/            one design system in three states: as-found 11/45, after `fix --all`
                    23/45, fully documented 45/45 — plus what an agent built with the first.
                    The three totals are asserted in the tests and published on the site.
test/fixtures/      small fixtures: React Native, Swift, Kotlin/Compose, and a pnpm monorepo
```

The landing page lives in its own repository; every number on it has to be
reproducible with a command from this README.

`lib/target.mjs` picks the package to audit out of a monorepo, and it ranks candidates
by how many components each one exports — never by which of them keeps a `docs/`
folder. Detection reads `registry.json` where a repo ships a registry, and namespace
re-exports (`export * as Dialog from …`) where it ships an aggregate package.

`lib/badge.mjs` holds the only band table: the terminal, the report, the markdown and
the badge all call `band()`. The thresholds are anchored to `rubric/reference.json` —
twelve public design systems audited at a named commit, running 13 to 33 out of 45 —
so a change to the bands has to argue with that file. Regenerate it only with a run
over fresh clones, and record the commits.

`scan` reads two roots: the package being audited and, when a monorepo declares that
package as one of its workspaces, the repository around it. Components, guides and
tokens are the package's; agent instructions, CI and the agent surface are the
repository's. An ancestor that merely contains the directory declares nothing and
lends nothing — see `resolveRepoRoot` in `lib/config.mjs`.

Platform detection (`facts.platform` in `lib/scan.mjs`) decides web vs. React Native
vs. Swift vs. Android from real evidence, and several checks branch on it —
components, tokens and the accessibility vocabulary in `lib/score.mjs`, the
templates in `lib/fix.mjs`. Keep the web path scoring exactly what it scores today
(`example/design-system` is the regression check); add a platform by extending the
branches, not by forking the pipeline.

## Rules

- **Facts and scores stay separate.** `scan` observes, `score` judges. Every
  dimension returns the evidence that produced its number, so a maintainer can argue
  with the reading instead of the verdict.
- **Never guess a number.** A dimension that cannot be assessed is skipped, and a
  skip lowers the maximum, not the score.
- **Ask nothing the repo can answer.** Stack, layout, component count and guide
  location are detected. The intake in the skill exists only for what detection
  cannot know.
- **Fixes are idempotent.** Files are written between `<!-- adsa:start -->` markers
  or created only when absent. Running a fix twice changes nothing.
- **A generic codemod that does a stack-specific job badly is worse than a brief.**
  When a fix needs the repo's own build, ship the specification instead.
- Node 20+, ESM, no dependencies, 4-space indent, double quotes.

## Before committing

```bash
node --test 'test/*.test.mjs'
node bin/adsa.mjs audit example/design-system   # must be 23/45 after fixes are applied
node bin/adsa.mjs audit test/fixtures/monorepo-ds --out /tmp/adsa   # must be 39/45
node bin/adsa.mjs reference                       # the field, printed from rubric/reference.json
```

Check exit codes explicitly. A piped command hides a non-zero exit.
