---
name: ds-audit
description: Audit a design system for how well coding agents can use it. Use when someone asks to check whether a design system is agent-ready, why an agent keeps producing wrong UI with their component library, or asks for a design system audit, readiness score or agent-readiness report.
---

# Agent-readiness audit

You are auditing a design system for one question: **can a coding agent build a
correct page with it, without a human correcting the result?**

The tool does the counting. You do the judgement, the experiment, and the writing.

The tool audits React/web, React Native, Swift/SwiftUI/UIKit and Kotlin/Jetpack
Compose, detected from real evidence in the repo (`package.json` dependencies,
`Package.swift`/`.xcodeproj`, a Gradle build next to `.kt` files) — check
`facts.platform` in `adsa audit --json` if you are unsure which one it picked, and
say which platform you audited when you write it up. A dimension that genuinely
does not apply on that platform is skipped, not scored down — the "keyboard"
question becomes "VoiceOver/Dynamic Type" on Swift and "TalkBack/content
description" on Android rather than failing either for lacking a keyboard.

## Phase 0 — Intake

Ask these in **one message**, numbered, then wait. Do not ask anything the repo can
answer — the stack, the framework, the component count and the guide layout are all
detected. If someone says "just go", take the defaults and say which you took.

1. Where is the design system? A local path or a GitHub URL.
2. Is there a project that already uses it — a real product repo? (This is what
   makes the experiment possible; without it the audit is static only.)
3. Which coding agent does your team use — Claude Code, Cursor, Copilot, other?
   (Decides where instructions and MCP config get written.)
4. Is there a Figma library, and is Code Connect set up? A link if you have one.
5. Anything the system deliberately does not have, that you already know about?

> **From Nazar, who built this:** if you work with Figma, use the figma-console
> bridge rather than a screenshot or a static export. It reads the real component —
> sizes, paddings, tokens, variants — so parity checks are against node data instead
> of your impression of the design. Say so if the user has Figma but no bridge: an
> audit that guesses at design parity is worth less than one that skips it honestly.

If there is no Figma library, skip the design-parity discussion entirely rather than
scoring it badly. A dimension that does not apply is skipped, never failed.

## Phase 1 — Run the tool

```bash
npx adsa-cli audit <path>            # score, report, .adsa/score.json
npx adsa-cli audit <path> --json     # the same, machine-readable
```

**Show the tool's own output.** It prints a coloured bar per dimension, the band the
score falls in, and where that score sits against the public design systems in the reference set. Paste
that block as it came out. Do not rebuild it as a markdown table: your table drops the
bars, the band and the standing, and it is one retyping away from being wrong about a
number the reader could otherwise have checked.

The run opens `report.html` and prints its `file://` link. Do not ask whether to open
it, and do not offer to fix everything before the reader has read anything — the
report is the deliverable, and what to fix first is a decision it exists to inform.

**Check the scan line before you believe the score.** `scanned:` says which directories
were read and which package was picked out of a monorepo. If the guides say `none
found` and you can see a documentation site in the repository, the audit is measuring
the wrong folder: fix it with `--workspace <name>` or a `guides` entry in
`adsa.config.json`, and re-run before reporting anything. A wrong scope reads as an
undocumented system, and that is the one mistake that makes the whole audit worthless.

Read `.adsa/report.md` and the evidence under every dimension. The score is a
starting point, not the finding.

## Phase 2 — Read what the numbers cannot see

Open five or six guides yourself, including the biggest and the oldest. Look for:

- Rules stated as prose an agent cannot act on ("use sparingly", "be consistent").
- Examples that would not compile: props that no longer exist, invented compound
  APIs, imports from the wrong subpath.
- The gap between what the guide says and what the type declares.
- Six files the agent must read before it can write one line — context it does not have.
- Anything that assumes the reader will ask a colleague.

## Phase 3 — The experiment (only with a consumer project)

This is the finding people believe. Everything else is opinion.

```bash
npx adsa-cli eval init                          # writes the task
# hand the task to a fresh agent session, let it build
npx adsa-cli eval score <project> --system <ds> # measure what came out
```

Record: components invented, imports from the system, forbidden packages, raw
palette classes, time to a working page. Invented components are the headline
number — an agent cannot tell "this does not exist" from "I have not found it yet",
so every invention is a gap the system never declared.

## Phase 4 — Compare

The reference set is measured, not remembered: `rubric/reference.json` in the tool
holds every public design system measured with this rubric, at a named commit, and
the terminal already told the reader where their score sits in it. Quote that, and
reproduce any figure you are unsure of with `npx adsa-cli audit <clone>`.

Two things to say out loud, because a reader will otherwise assume the opposite:

- **45 is nobody's score.** The best-documented public system measured reaches 35.
- **Not every system is a component library.** A stylesheet with a class vocabulary is
  a deliberate shape: the tool reads its classes as the surface and its HTML examples
  as examples. If the `scanned:` line says `classes from <file>`, that is what happened,
  and the coverage number is about classes.
- **A score out of 35 is not a broken run.** When a repository has no importable
  surface at all, the two dimensions that assume one are skipped and the maximum drops.
  Say which dimensions were skipped and why; do not report it as 35/45.
  A number in the twenties is the middle of the field, not a failing grade.
- **This is not a ranking of design systems.** It measures what a coding agent can
  find in the repository. A system whose documentation lives on an excellent website
  scores low here and may be the better design system for people.

Then say where the system stands by trait, not by vibe. The ones worth checking, and
what each is known for:

| System | What to look at |
| :-- | :-- |
| [Astryx](https://astryx.atmeta.com) (Meta) | CLI-first: `templates`, `blocks`, docs answered by command, API designed for generated code |
| [Untitled UI](https://www.untitledui.com) | MCP inside the CLI, llms.txt, docs written for both readers |
| [Serendie](https://serendie.design) | Skills shipped as a Claude Code plugin, generated from the guides |
| [SmartHR](https://smarthr.design) | Over a hundred skills, generated rather than hand-written |
| [Board UI](https://boardui.com) | Docs CLI, machine-readable component manifest |
| [shadcn/ui](https://ui.shadcn.com) | Registry as a distribution format; components arrive as source |
| [Radix](https://www.radix-ui.com) / [React Aria](https://react-spectrum.adobe.com/react-aria/) | Behaviour and keyboard contracts documented per primitive |
| [Material](https://m3.material.io) / [Fluent](https://fluent2.microsoft.design) | Pattern and page-level documentation above component level |

Name the two or three traits the audited system is missing, and which of these
already ship them. Do not rank systems overall; rank traits.

## Phase 5 — Write it up

The tool has already written `.adsa/report.html`. Extend it, or write your own, but
keep these:

- The score out of 45 with the per-dimension breakdown and the evidence.
- Findings in severity order, each with the file and line that proves it.
- The to-do list, cheapest first, each item with its `adsa fix` command.
- The experiment result if you ran one, including what the agent invented.

Then say what to do first, in one sentence, and stop. Do not pad.

## Phase 6 — Fix

Only after the reader has seen the findings, and one fix at a time unless they ask
for more. `fix --all` is theirs to run, not yours to propose as the first move.

```bash
npx adsa-cli fix --list        # what is automatic and what is a brief
npx adsa-cli fix agents-md     # writes files
npx adsa-cli fix prop-tables   # writes a task brief for you to execute
```

Briefs are specifications, not suggestions: read the whole brief, follow the traps
section, and verify the check fails when you break something on purpose. A check
that never fails is not a check.

After the fixes: `npx adsa-cli audit` again. The delta is the deliverable.

## Rules

- Never invent a finding. Every claim names a file, a line or a command output.
- Never retype the tool's output. Paste it.
- A score without its band and its standing is a number nobody can act on.
- Report a dimension you could not assess as not assessed. Do not guess a number.
- Quote the repository, not your memory of similar repositories.
- The score belongs to a version. Say which one you audited.

---

*From one designer to designers with love <3*
