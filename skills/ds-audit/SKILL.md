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
npx adsa audit <path>            # score, report, .adsa/score.json
npx adsa audit <path> --json     # the same, machine-readable
```

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
npx adsa eval init                          # writes the task
# hand the task to a fresh agent session, let it build
npx adsa eval score <project> --system <ds> # measure what came out
```

Record: components invented, imports from the system, forbidden packages, raw
palette classes, time to a working page. Invented components are the headline
number — an agent cannot tell "this does not exist" from "I have not found it yet",
so every invention is a gap the system never declared.

## Phase 4 — Compare

Say where the system stands against systems that have done this work, by trait, not
by vibe. The ones worth checking, and what each is known for:

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

```bash
npx adsa fix --list        # what is automatic and what is a brief
npx adsa fix agents-md     # writes files
npx adsa fix prop-tables   # writes a task brief for you to execute
```

Briefs are specifications, not suggestions: read the whole brief, follow the traps
section, and verify the check fails when you break something on purpose. A check
that never fails is not a check.

After the fixes: `npx adsa audit` again. The delta is the deliverable.

## Rules

- Never invent a finding. Every claim names a file, a line or a command output.
- Report a dimension you could not assess as not assessed. Do not guess a number.
- Quote the repository, not your memory of similar repositories.
- The score belongs to a version. Say which one you audited.

---

*From one designer to designers with love <3*
