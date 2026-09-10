<img src="assets/cover.png" alt="Agentic Design System" width="100%">

# ADSA

[adsa.space](https://adsa.space) — agentic design system audit

Your design system is documented for people. An agent is not a person: it cannot ask
a colleague, it cannot tell *this does not exist* from *I have not found it yet*, and
when it cannot find something it invents a component and moves on, confidently.

ADSA scores a design system out of 45 on how well a coding agent can use it, writes
the report, and then fixes what it can.

```bash
npx adsa-cli audit            # score this repo, write the report
npx adsa-cli fix --all        # apply what can be applied, brief the rest
npx adsa-cli audit            # measure again
```

That loop is the whole product. Everything below is detail.

## What you get

**A score with its evidence.** Nine dimensions, each 1, 3 or 5, each quoting the
files that produced the number, so you can disagree with the reading rather than the
verdict. Written to `.adsa/report.html`, `.adsa/report.md` and `.adsa/score.json`.

**A to-do list that runs.** Every item is a command, not advice. Five fixes write
files. Five write a task brief for your agent, because they need your repo's own
stack and a generic codemod would do them badly.

**A gate, and a badge.** `.adsa/score.json` is committed and `adsa audit --gate`
fails when the score drops, so documentation debt cannot land quietly next to a
feature. `adsa badge` prints the README line for your own score — this is what the
example system in this repo earns after its fixes:

![Agent-ready 23/45](https://img.shields.io/badge/agent--ready-23%2F45-a16207)

**The experiment.** `adsa eval` gives an agent a real page to build, then counts what
it invented. It is the only number that has ever changed anyone's mind.

**An MCP server.** `adsa mcp` serves the guides as tools, so agents query the docs of
the version checked out in front of them instead of reading files and guessing.

## What a score means

Twelve public design systems, audited with this rubric at the commit named in
`rubric/reference.json`, on 2026-09-10:

| Score | System | Repository | Package audited |
| :-- | :-- | :-- | :-- |
| 33/45 | Astryx · Meta | `facebook/astryx` | `@astryxdesign/core` |
| 29/45 | Chakra UI | `chakra-ui/chakra-ui` | `@chakra-ui/react` |
| 25/45 | React Spectrum · Adobe | `adobe/react-spectrum` | `@react-spectrum/s2` |
| 23/45 | HeroUI | `heroui-inc/heroui` | `@heroui/react` |
| 23/45 | Polaris · Shopify | `Shopify/polaris` | `@shopify/polaris` |
| 21/45 | Mantine | `mantinedev/mantine` | `@mantine/core` |
| 21/45 | shadcn/ui | `shadcn-ui/ui` | `v4` |
| 19/45 | Base UI · MUI | `mui/base-ui` | `@base-ui/react` |
| 19/45 | Carbon · IBM | `carbon-design-system/carbon` | `@carbon/react` |
| 17/45 | Primer · GitHub | `primer/react` | `@primer/react` |
| 13/45 | Radix Primitives · WorkOS | `radix-ui/primitives` | `radix-ui` |
| 13/45 | Untitled UI React | `untitleduico/react` | `@untitledui/react` |

Two things follow, and both are the point of publishing this table.

**45 is nobody's score.** The best-documented public design system reaches 33. The
bands are anchored to that measured field rather than to a wish: **31+ agent-ready**,
**24–30 good foundation**, **15–23 gaps to address**, **below 15 not ready**. A system
in the low twenties is in the middle of the field, not failing.

**This is not a ranking of design systems.** It measures one thing: what a coding
agent can find in the repository it is working in. A system whose documentation lives
on an excellent website scores low here and may well be the better system for people.

Every row is reproducible: clone the repository and run `npx adsa-cli audit <clone>`.
`npx adsa-cli reference` prints this table from the tool.

## The nine dimensions

| | Dimension | The question |
| :-- | :-- | :-- |
| 1 | Agent instructions | When an agent opens this repo, does anything tell it how to use the system? |
| 2 | Machine surface | Can an agent query the system, or must it read files and guess? |
| 3 | Docs coverage | Does every component a consumer can import have a guide? |
| 4 | Docs freshness | If a guide drifts from the code, does anything notice? |
| 5 | Tokens | Are colour, spacing, radius and motion documented as named decisions? |
| 6 | Patterns | Is there anything above component level — how a real page is assembled? |
| 7 | Accessibility docs | Do the guides say how a component behaves for assistive technology? |
| 8 | Verification | Can an agent check its own work before calling it done? |
| 9 | Gap handling | What happens when the system genuinely does not have the thing? |

`npx adsa-cli rubric` prints what 1, 3 and 5 mean for each.

`--out <dir>` puts every artifact of a run together somewhere else — the report, the
score, the badge and the history — and reads the previous score from there too, so a
repository can be audited without writing anything into it.

## Commands

```
adsa audit [dir]            Score, write report.html, report.md, score.json
adsa fix <id> | --all       Apply a fix, or write its task brief
adsa fix --list             What each fix does
adsa search "<task>"        Which component do I need for this
adsa docs <component>       That component's guide, prose stripped
adsa eval init              Write the experiment task for an agent
adsa eval score <dir>       Measure what the agent actually built
adsa mcp                    Serve the guides as MCP tools over stdio
adsa doctor                 Is this repo wired up for agents
adsa badge                  The README badge for the committed score
adsa rubric                 The nine dimensions in full
```

`--json` everywhere. `--dry-run` on `fix`. `--gate --min <n>` on `audit`.
`--workspace <name>` and `--no-workspace` on everything that reads a repository.

## Monorepos

A design system usually is not the repository — it is one package in it, and the
things an agent needs are spread across both. `adsa` reads them where they are:

| What | Where it looks |
| :-- | :-- |
| Components, guides, tokens | The package being audited |
| `AGENTS.md`, `CLAUDE.md` | The package, then the repository that declares it |
| CI workflows, root scripts | The repository |
| MCP server, `llms.txt`, CLI, skills, commands | The repository, including sibling workspaces |

"The repository that declares it" is exact: an ancestor counts only when its
`workspaces` or `pnpm-workspace.yaml` actually lists this package. A design system
vendored inside an unrelated repo inherits nothing, because it was promised nothing.

Detection picks the workspace that looks most like the design system and says which
one it picked. When it picks wrong, `--workspace @acme/ui` names one by hand and
`--no-workspace` audits the directory exactly as given. Every run prints the
directories it read, because *not found* and *never looked* are otherwise the same
sentence — which is the mistake this tool exists to stop an agent from making.

## Where guides can live

`guidelines/`, `docs/components/`, `docs/`, a Swift package's `.docc` bundle — and
next to the component itself, as `Button/Button.spec.md`, `Card/Card.docs.md` or
`Field/Field.guide.md`. A colocated guide is a deliberate layout, not a missing one.

An agent surface counts whether the repository commits it or serves it: an MCP
endpoint behind a route handler, an `llms.txt` generated from the live docs, and a
CLI published from a sibling package are all things an agent can query.

## The skill

For Claude Code, `skills/ds-audit` runs the whole audit as a conversation: it asks
where the system is, whether a consumer project exists, which agent your team uses
and whether there is a Figma library — then runs the tool, reads the guides itself,
runs the experiment and writes the findings. Copy it into `.claude/skills/`.

## Configuration

None required. Everything the tool can read from the repo, it reads. When detection
gets it wrong, `adsa.config.json`:

```json
{
    "guides": ["guidelines", "src/components"],
    "source": ["src/components"],
    "forbidden": ["lucide-react"],
    "skip": ["patterns"],
    "minScore": 30
}
```

`skip` is for dimensions that genuinely do not apply — a primitives-only library has
no page patterns, and a skipped dimension lowers the maximum instead of the score.

Naming `guides` yourself turns off the repository-level guide folder that a
workspace package otherwise inherits: an explicit list is a complete answer.

## Platforms

ADSA detects which platform a design system is built for from real evidence in the
repo, and audits it accordingly:

| Platform | Detected from | Components | Tokens |
| :-- | :-- | :-- | :-- |
| React / web | `react`, `vue` or `svelte` in `package.json` | Exported symbols or `exports` subpaths | Guide prose, raw Tailwind/hex in examples |
| React Native | `react-native` or `expo` in `package.json` | Same as web — RN is still TSX | Guide prose, or raw `StyleSheet`/NativeWind values |
| Swift / SwiftUI / UIKit | `Package.swift`, an `.xcodeproj`/`.xcworkspace`, or several `.swift` files | `public struct X: View` / `open class X: UIView` | Guide prose, or named colours in an `.xcassets` catalog |
| Kotlin / Jetpack Compose | A Gradle build next to `.kt` files | `@Composable fun X(...)` | Guide prose, or named colours in `colors.xml`/`themes.xml` |

`facts.platform` reports the strongest match as `primary` and every other platform
it saw real evidence for as `detected` — a monorepo with a web app and a native
shell is not forced into one label, it is reported honestly as both.

Guides are always markdown, wherever they live: `guidelines/`, `docs/`, or — for a
Swift package — its own `.docc` bundle, found automatically rather than requiring
`adsa.config.json` to list it.

Per platform, the agent-instructions and tokens fixes write in that platform's own
vocabulary (SwiftUI modifiers and `swift build`/`swift test`, Compose semantics and
`./gradlew test lint`, `StyleSheet`/NativeWind and Metro), and the accessibility
dimension asks about VoiceOver/Dynamic Type or TalkBack/content description instead
of demanding "keyboard" from a platform that has none. A dimension that genuinely
does not apply is skipped — via `adsa.config.json`'s `skip` — not scored down.

## What it supports honestly

Detection is built for React, TypeScript and markdown guides — that path is the
most mature — and works on any repo where guides live in markdown and components
are exported from source. Vue and Svelte are detected but less well covered. React
Native, Swift and Kotlin/Compose detection is newer: components, tokens and
accessibility evidence are read from real files (see the table above), but the
freshness fixes (`prop-tables`, `examples-check`) still assume a typed TypeScript
component library, and their briefs say so. Anything it cannot assess it reports as
not assessed — it never guesses a number.

## Try it

```bash
git clone https://github.com/nrmk13/ADSA && cd ADSA
node bin/adsa.mjs audit example/design-system        # 9/45
node bin/adsa.mjs fix --all --cwd example/design-system
node bin/adsa.mjs audit example/design-system        # 23/45
```

`example/agent-output` is what an agent built against that system before it was
fixed. `adsa eval score example/agent-output --system example/design-system` counts
the three components it invented.

Small fixtures live under `test/fixtures/` — a React Native library, a Swift package
documented with DocC, a Kotlin/Compose library, and a pnpm monorepo whose guides sit
next to its components — and run the same loop:

```bash
node bin/adsa.mjs audit test/fixtures/swift-ds
node bin/adsa.mjs audit test/fixtures/monorepo-ds        # 39/45, audited from the root
```

## Licence

MIT.

---

*From one designer to designers with love <3*
