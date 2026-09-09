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
example/            a deliberately unready design system, and what an agent built with it
```

The landing page lives in its own repository; every number on it has to be
reproducible with a command from this README.

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
```

Check exit codes explicitly. A piped command hides a non-zero exit.
