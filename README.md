# ADSA — agentic design system audit

![Agent-ready 23/45](https://img.shields.io/badge/agent--ready-23%2F45-a2650b)

Your design system is documented for people. An agent is not a person: it cannot ask
a colleague, it cannot tell *this does not exist* from *I have not found it yet*, and
when it cannot find something it invents a component and moves on, confidently.

ADSA scores a design system out of 45 on how well a coding agent can use it, writes
the report, and then fixes what it can.

```bash
npx adsa audit            # score this repo, write the report
npx adsa fix --all        # apply what can be applied, brief the rest
npx adsa audit            # measure again
```

That loop is the whole product. Everything below is detail.

## What you get

**A score with its evidence.** Nine dimensions, each 1, 3 or 5, each quoting the
files that produced the number, so you can disagree with the reading rather than the
verdict. Written to `.adsa/report.html`, `.adsa/report.md` and `.adsa/score.json`.

**A to-do list that runs.** Every item is a command, not advice. Five fixes write
files. Five write a task brief for your agent, because they need your repo's own
stack and a generic codemod would do them badly.

**A gate.** `.adsa/score.json` is committed. `adsa audit --gate` fails when the score
drops, so documentation debt cannot land quietly next to a feature.

**The experiment.** `adsa eval` gives an agent a real page to build, then counts what
it invented. It is the only number that has ever changed anyone's mind.

**An MCP server.** `adsa mcp` serves the guides as tools, so agents query the docs of
the version checked out in front of them instead of reading files and guessing.

## The nine dimensions

| | Dimension | The question |
| :-- | :-- | :-- |
| 1 | Agent instructions | When an agent opens this repo, does anything tell it how to use the system? |
| 2 | Machine surface | Can an agent query the system, or must it read files and guess? |
| 3 | Docs coverage | Does every component a consumer can import have a guide? |
| 4 | Docs freshness | If a guide drifts from the code, does anything notice? |
| 5 | Tokens | Are colour, spacing, radius and motion documented as named decisions? |
| 6 | Patterns | Is there anything above component level — how a real page is assembled? |
| 7 | Accessibility docs | Do the guides say which keys a component answers to? |
| 8 | Verification | Can an agent check its own work before calling it done? |
| 9 | Gap handling | What happens when the system genuinely does not have the thing? |

`npx adsa rubric` prints what 1, 3 and 5 mean for each.

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
    "guides": ["guidelines"],
    "source": ["src/components"],
    "forbidden": ["lucide-react"],
    "skip": ["patterns"],
    "minScore": 30
}
```

`skip` is for dimensions that genuinely do not apply — a primitives-only library has
no page patterns, and a skipped dimension lowers the maximum instead of the score.

## What it supports honestly

Detection is built for React, TypeScript and markdown guides, and works on any repo
where guides live in markdown and components are exported from source. Vue and
Svelte are detected but less well covered. The accessibility and prop-table fixes
assume a typed component library. Anything it cannot assess it reports as not
assessed — it never guesses a number.

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

## Licence

MIT.

---

*From one designer to designers with love <3*
