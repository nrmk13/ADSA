#!/usr/bin/env node
/**
 * adsa — score a design system on how well coding agents can use it, then fix what
 * is missing.
 *
 *   adsa audit [dir]              score it, write the report
 *   adsa fix <id> | --all         apply a fix, or write its task brief
 *   adsa eval init | score <dir>  run the experiment and measure the result
 *   adsa mcp                      serve the guides as MCP tools
 *   adsa doctor                   is this repo wired up for agents
 *   adsa reference                the field: what other design systems score
 *   adsa badge                    the README badge for the committed score
 */
import { spawn } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, resolveRepoRoot } from "../lib/config.mjs";
import { resolveTarget } from "../lib/target.mjs";
import { scan } from "../lib/scan.mjs";
import { RUBRIC, score, scoreFile } from "../lib/score.mjs";
import { buildTodo, html, markdown } from "../lib/report.mjs";
import { band, badgeEndpoint, badgeMarkdown } from "../lib/badge.mjs";
import { REFERENCE, standing } from "../lib/reference.mjs";
import { exists, isDir } from "../lib/fsx.mjs";
import { DIR, appendHistory, compare, readHistory, write } from "../lib/history.mjs";
import { FIXES, applyFix } from "../lib/fix.mjs";
import { evaluate, taskFile } from "../lib/eval.mjs";
import { findGuide, searchGuides, serve } from "../lib/mcp.mjs";
import { dense } from "../lib/dense.mjs";
import { readJson } from "../lib/fsx.mjs";
import { byScore, detectColor, dim, green, red, setColor, yellow } from "../lib/color.mjs";

const HELP = `adsa — agentic design system audit

  npx adsa-cli <command>      without installing
  adsa <command>              once the package is installed

Usage
  adsa audit [dir]            Score the design system in dir (default: .)
  adsa search "<task>"        Which component do I need for this
  adsa docs <component>       That component's guide, prose stripped
  adsa fix <id>               Apply one fix, or write its task brief
  adsa fix --list             What each fix does and which are automatic
  adsa eval init              Write the experiment task for an agent
  adsa eval score <dir>       Measure what the agent actually built
  adsa mcp                    Serve the guides as MCP tools over stdio
  adsa doctor                 Check this repo's agent surface
  adsa reference              The measured field: public design systems, same rubric
  adsa badge                  Print the README badge for the committed score
  adsa rubric                 Print the nine dimensions and what each level means

Options
  --json                      Machine-readable output
  --out <dir>                 Write every artifact here instead of .adsa/
  --gate                      Exit non-zero if the score dropped, or is below --min
  --min <n>                   Minimum acceptable total for --gate
  --dry-run                   fix: show what would change, write nothing
  --system <dir>              eval score: the design system the project should use
  --cwd <dir>                 fix: the repository to change (default: .)
  --workspace <name>          audit this workspace package, not the detected one
  --no-workspace              audit the given directory as it stands
  --no-open                   audit: do not open the report in a browser
  --quiet                     Only the score line
  --full                      docs: keep the prose
  --color / --no-color        Force ANSI colour on or off (default: on for a terminal)
`;

export function parseArgs(argv) {
    const flags = { out: null, json: false, gate: false, min: null, dryRun: false, system: null, quiet: false, list: false, all: false, cwd: null, workspace: null, noWorkspace: false };
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--json") flags.json = true;
        else if (arg === "--gate") flags.gate = true;
        else if (arg === "--dry-run") flags.dryRun = true;
        else if (arg === "--quiet") flags.quiet = true;
        else if (arg === "--list") flags.list = true;
        else if (arg === "--full") flags.full = true;
        else if (arg === "--color") flags.color = true;
        else if (arg === "--no-color") flags.color = false;
        else if (arg === "--all") flags.all = true;
        else if (arg === "--open") flags.open = true;
        else if (arg === "--no-open") flags.open = false;
        else if (arg === "--no-workspace") flags.noWorkspace = true;
        else if (arg === "--workspace") flags.workspace = argv[++i];
        else if (arg === "--out") flags.out = argv[++i];
        else if (arg === "--min") flags.min = Number(argv[++i]);
        else if (arg === "--system") flags.system = argv[++i];
        else if (arg === "--cwd") flags.cwd = argv[++i];
        else if (arg === "--help" || arg === "-h") flags.help = true;
        else if (arg.startsWith("-")) flags.unknown = arg;
        else positional.push(arg);
    }
    return { command: positional[0], args: positional.slice(1), flags };
}

/** A bad --workspace is the reader's mistake to fix, not a reason to audit something else. */
class TargetError extends Error {}

/** Set once per run so every command resolves the same target the reader asked for. */
let targetFlags = {};

function load(dir) {
    const given = resolve(dir || ".");
    const target = resolveTarget(given, targetFlags);
    if (target.error) throw new TargetError(target.error);
    const root = target.dir;
    const config = loadConfig(root);
    // Agent instructions, CI and the agent surface belong to the repository that
    // declares this package, not to the package directory.
    const repoRoot = targetFlags.noWorkspace ? root : resolveRepoRoot(root) || root;
    const facts = scan(root, config, repoRoot);
    facts.workspace = target.note;
    return { root, config, facts };
}

/** Auditing the wrong directory produces a confident, meaningless number. Say so instead. */
function looksLikeADesignSystem(facts) {
    if (facts.components.length >= 3 || facts.guides.length >= 2) return true;
    // A small native design system (Swift, Kotlin) can be real with fewer files than a
    // web one. Strong platform evidence plus at least one real component or guide is
    // enough to not reject it just for being small.
    const platform = facts.platform;
    if (platform && platform.primary !== "web" && platform.detected.length && (facts.components.length >= 1 || facts.guides.length >= 1)) return true;
    return false;
}

export async function run(argv, io = {}) {
    const out = (s) => (io.stdout ?? process.stdout).write(s + "\n");
    const json = (v) => out(JSON.stringify(v, null, 2));
    const { command, args, flags } = parseArgs(argv);
    if (flags.color !== undefined) setColor(flags.color);
    targetFlags = { workspace: flags.workspace, noWorkspace: flags.noWorkspace };
    if (flags.help || !command) {
        out(HELP);
        return 0;
    }
    if (flags.unknown) {
        out(`Unknown option ${flags.unknown}\n\n${HELP}`);
        return 1;
    }

    try {
        return await dispatch(command, args, flags, io, out, json);
    } catch (error) {
        if (error instanceof TargetError) {
            out(red(error.message));
            return 1;
        }
        throw error;
    }
}

async function dispatch(command, args, flags, io, out, json) {
    switch (command) {
        case "audit":
            return cmdAudit(args[0], flags, out, json);
        case "fix":
            return cmdFix(args, flags, out, json);
        case "eval":
            return cmdEval(args, flags, out, json);
        case "mcp": {
            const ctx = load(args[0]);
            await serve(io.stdin ?? process.stdin, io.stdout ?? process.stdout, ctx);
            return 0;
        }
        case "search":
            return cmdSearch(args, flags, out, json);
        case "docs":
            return cmdDocs(args, flags, out, json);
        case "doctor":
            return cmdDoctor(args[0], flags, out, json);
        case "reference":
            return cmdReference(flags, out, json);
        case "badge":
            return cmdBadge(args[0], flags, out, json);
        case "rubric":
            return cmdRubric(flags, out, json);
        default:
            out(`Unknown command "${command}".\n\n${HELP}`);
            return 1;
    }
}

/**
 * Which directories the run actually read. "Not found" and "never looked" print the
 * same in a report, and a reader cannot tell a bad layout from a bad scan without it.
 */
function scannedLine(facts) {
    const s = facts.scanned;
    const parts = [`guides ${s.guides.length ? s.guides.join(", ") : "none found"}`, `source ${s.source.length ? s.source.join(", ") : "none found"}`];
    if (s.colocatedGuides) parts.push(`${s.colocatedGuides} colocated`);
    if (facts.monorepo) parts.push(`repo-level files from ${basename(facts.repoRoot)}/`);
    return `  scanned: ${parts.join(" · ")}`;
}

/**
 * Whether to hand the report to the reader's browser. Opening a window is the kind of
 * thing a tool should only do when a person is watching: a TTY, no CI environment
 * variable, and not asked for machine output.
 */
function shouldOpen(flags) {
    if (flags.open === false || flags.json || flags.quiet || flags.gate) return false;
    if (flags.open === true) return true;
    if (process.env.CI || process.env.ADSA_NO_OPEN) return false;
    return Boolean(process.stdout.isTTY);
}

function openInBrowser(file, out) {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    try {
        spawn(cmd, [pathToFileURL(file).href], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
    } catch {
        out(dim("  (could not open a browser — the path above is the file)"));
    }
}

/* ------------------------------------------------------------ reference */

/** The measured field, so a reader can see what 45 is worth without leaving the terminal. */
function cmdReference(flags, out, json) {
    if (flags.json) {
        json(REFERENCE);
        return 0;
    }
    out(`Public design systems audited with rubric ${REFERENCE.rubric}, ${REFERENCE.measured}:\n`);
    for (const s of REFERENCE.systems) {
        const label = `${s.name}${s.org ? ` · ${s.org}` : ""}`;
        out(`  ${String(s.total).padStart(2)}/${s.max}  ${byScore(bandScore(s.total, s.max), label.padEnd(26))} ${dim(`${s.repo}@${s.commit}  ${s.package}`)}`);
    }
    out(dim("\n  Not a ranking of design systems: it measures what an agent can find in the repository."));
    out(dim("  Reproduce any row with `npx adsa-cli audit <clone>`."));
    return 0;
}

/** The 1/3/5 colour the bar chart uses, borrowed for a whole score. */
const bandScore = (total, max) => ({ ready: 5, good: 5, gaps: 3, unready: 1 })[band(total, max).id];

/* ---------------------------------------------------------------- audit */

function cmdAudit(dir, flags, out, json) {
    const { root, config, facts } = load(dir);
    if (!looksLikeADesignSystem(facts)) {
        out(`${facts.name}: found ${facts.components.length} importable components and ${facts.guides.length} guides in ${root}.`);
        out("That does not look like a design system. Point adsa at the package that exports the components,");
        out("or set `source` and `guides` in adsa.config.json.");
        return 1;
    }
    const scored = score(facts, config);
    // Everything one run writes lands together. --out is read from where the command
    // was typed, so an absolute path is absolute and a relative one is relative to
    // the reader, not to the repository being audited.
    const artefacts = flags.out ? resolve(process.cwd(), flags.out) : join(root, DIR);
    const fresh = !exists(join(artefacts, "score.json"));
    const file = scoreFile(facts, scored);
    const previous = readJson(join(artefacts, "score.json"));
    const delta = compare(previous, file);

    if (flags.json) {
        json({ ...file, scanned: facts.scanned, dimensions: scored.dimensions, delta });
    } else {
        // One band table, in lib/badge.mjs, so the terminal, the report and the
        // badge never disagree about what a number means.
        const verdict = band(scored.total, scored.max);
        const paint = (t) => (verdict.id === "ready" || verdict.id === "good" ? green(t) : verdict.id === "gaps" ? yellow(t) : red(t));
        out(`${facts.name}${facts.version ? " " + facts.version : ""} — agent readiness ${paint(`${scored.total}/${scored.max}`)}  ${paint(verdict.label)}`);
        if (facts.workspace) out(`  ${facts.workspace}`);
        if (!flags.quiet) {
            out(dim(scannedLine(facts)));
            out("");
            for (const d of scored.dimensions) {
                const bar = d.skipped ? dim("  skip") : byScore(d.score, "█".repeat(d.score)) + dim("·".repeat(5 - d.score));
                out(`  ${String(d.skipped ? "—" : d.score).padStart(2)}/5 ${bar}  ${d.skipped ? dim(d.title) : d.title}`);
            }
            out("");
            const todo = buildTodo(scored);
            if (todo.length) {
                // The command once, then the ids. Three full npx lines is 90 columns
                // of mostly repeated prefix.
                const rest = todo.length - 1;
                out(dim(`Next: npx adsa-cli fix ${todo[0].fix}${rest ? `  · ${rest} more in the report` : ""}`));
            }
            if (delta) {
                const move = `Since the last run: ${delta.from} → ${delta.to} (${delta.delta >= 0 ? "+" : ""}${delta.delta})`;
                out(delta.delta > 0 ? green(move) : delta.delta < 0 ? red(move) : dim(move));
            }
            // A score out of 45 answers nothing until you know what 45 is worth.
            out(dim(standing(scored.total).sentence));
        }
    }

    const history = appendHistory(artefacts, { date: file.generatedAt, total: file.total, max: file.max, dimensions: file.dimensions });
    write(join(artefacts, "score.json"), file);
    write(join(artefacts, "badge.json"), badgeEndpoint(file.total, file.max));
    mkdirSync(artefacts, { recursive: true });
    writeFileSync(join(artefacts, "report.html"), html(facts, scored, history));
    writeFileSync(join(artefacts, "report.md"), markdown(facts, scored));
    // A path that climbs out of the current directory reads better absolute than as
    // a ladder of "..".
    const near = relative(process.cwd(), artefacts);
    const shown = !near ? "." : near.startsWith("..") ? artefacts : near;
    if (!flags.json && !flags.quiet) {
        const report = join(artefacts, "report.html");
        out(`\nReport: ${pathToFileURL(report).href}`);
        out(dim(`  ${join(shown, "report.html")} · score: ${join(shown, "score.json")}`));
        // The report is the deliverable, so it opens. `--no-open` for a script, and
        // it never opens on its own in CI or when the output is being piped.
        if (shouldOpen(flags)) openInBrowser(report, out);
        // Say once what the directory is for, rather than leave someone to guess
        // whether a new folder in their repository belongs in the commit.
        if (fresh && !flags.out && exists(join(root, ".git"))) {
            out(dim("  score.json, badge.json and history.json are meant to be committed — the badge and the gate read them."));
            out(dim("  report.html and report.md are rewritten every run; ignore them if you would rather not carry them."));
        }
    }

    if (flags.gate) {
        const floor = flags.min ?? config.minScore ?? (previous ? previous.total : null);
        if (floor != null && file.total < floor) {
            out(red(`\nGate: ${file.total}/${file.max} is below ${floor}.`));
            return 1;
        }
    }
    return 0;
}

/* ------------------------------------------------------------------ fix */

function cmdFix(args, flags, out, json) {
    if (flags.list || (!args.length && !flags.all)) {
        if (flags.json) return json(Object.entries(FIXES).map(([id, f]) => ({ id, kind: f.kind, title: f.title, dimension: f.dimension }))), 0;
        out("Fixes\n");
        for (const [id, fix] of Object.entries(FIXES)) {
            out(`  ${id.padEnd(16)} ${fix.kind === "apply" ? "writes files " : "writes a brief"}  ${fix.title}`);
        }
        out("\n  A brief is a task specification for an agent to execute: those fixes need");
        out("  your repository's own stack, and a generic codemod would do them badly.");
        return 0;
    }
    // `audit <dir>` takes a directory, so `fix <dir>` has to as well. A positional
    // that names a fix is a fix; anything else is where to write. Silently writing
    // into the current folder because the argument was in the wrong place is the
    // worst thing this command could do.
    const named = args.filter((a) => a in FIXES);
    const rest = args.filter((a) => !(a in FIXES));
    if (rest.length > 1) {
        out(`Unknown fix "${rest[1]}". Run \`npx adsa-cli fix --list\`.`);
        return 1;
    }
    if (rest.length === 1 && !isDir(rest[0])) {
        out(`Unknown fix "${rest[0]}", and no directory by that name. Run \`npx adsa-cli fix --list\`.`);
        return 1;
    }
    const { root, config, facts } = load(flags.cwd || rest[0] || ".");
    const ids = flags.all ? Object.keys(FIXES) : named;
    const actions = [];
    for (const id of ids) {
        try {
            actions.push(...applyFix(id, facts, config, { dryRun: flags.dryRun }).map((a) => ({ ...a, fix: id })));
        } catch (error) {
            out(String(error.message));
            return 1;
        }
    }
    if (flags.json) {
        json({ dryRun: flags.dryRun, actions });
        return 0;
    }
    for (const a of actions) {
        if (a.action === "note") out(`  note   ${a.note}`);
        else out(`  ${(flags.dryRun ? "would " + a.action : a.action).padEnd(6)} ${a.file}${a.note ? ` — ${a.note}` : ""}`);
    }
    const briefs = actions.filter((a) => a.file.includes(".adsa/fixes"));
    if (briefs.length && !flags.dryRun) out(`\nHand ${briefs.length === 1 ? "the brief" : "these briefs"} to your agent, then re-run \`adsa audit\`.`);
    return 0;
}

/* ----------------------------------------------------------------- eval */

function cmdEval(args, flags, out, json) {
    const sub = args[0];
    if (sub === "init") {
        const { root, config, facts } = load(args[1]);
        const file = join(DIR, "eval", "TASK.md");
        if (!flags.dryRun) {
            mkdirSync(join(root, DIR, "eval"), { recursive: true });
            writeFileSync(join(root, file), taskFile(facts, config));
        }
        out(`  create ${file} — give this to an agent in a fresh session`);
        return 0;
    }
    if (sub === "score") {
        const project = args[1];
        if (!project) {
            out("Usage: adsa eval score <project-dir> [--system <design-system-dir>]");
            return 1;
        }
        const { config, facts } = load(flags.system || ".");
        const result = evaluate(resolve(project), facts, config);
        if (flags.json) {
            json(result);
            return result.invented.length ? 1 : 0;
        }
        out(`${result.project}`);
        out(`  against ${result.system} — ${plural(result.files, "file")}, ${plural(result.systemImports, "import")}, ${plural(result.used.length, "component")} used`);
        out(`  invented: ${result.invented.length ? red(String(result.invented.length)) : green("0")}`);
        for (const i of result.invented.slice(0, 12)) out(`    ${red(i.name)} — ${i.file} (from ${i.from})`);
        if (result.forbiddenImports.length) out(`  forbidden packages: ${[...new Set(result.forbiddenImports.map((f) => f.package))].join(", ")}`);
        if (result.rawPalette.length) out(`  raw palette classes: ${result.rawPalette.length}, first ${result.rawPalette[0].value} at ${result.rawPalette[0].file}:${result.rawPalette[0].line}`);
        if (result.localUiFolder.length) out(`  local component folder: ${result.localUiFolder.join(", ")}`);
        out(`\n  ${result.invented.length ? result.verdict : green(result.verdict)}`);
        return result.invented.length ? 1 : 0;
    }
    out("Usage: adsa eval init | adsa eval score <dir>");
    return 1;
}

/* ----------------------------------------------------------- search/docs */

function cmdSearch(args, flags, out, json) {
    const { facts } = load(flags.cwd || ".");
    const query = args.join(" ");
    const results = searchGuides(facts, query, 10);
    if (flags.json) {
        json(results);
        return results.length ? 0 : 1;
    }
    if (!results.length) {
        out(`Nothing in ${facts.name} matched "${query}".`);
        out(facts.gaps.file ? `Check ${facts.gaps.file} before assuming it exists.` : "Nothing lists what this system lacks, so ask rather than inventing it.");
        return 1;
    }
    for (const r of results) out(`  ${r.slug.padEnd(22)} ${r.title || ""}  (${r.path})`);
    return 0;
}

function cmdDocs(args, flags, out, json) {
    const { facts } = load(flags.cwd || ".");
    const name = args.join(" ");
    const guide = findGuide(facts, name);
    if (!guide) {
        const near = searchGuides(facts, name, 5).map((r) => r.slug);
        out(`No guide for "${name}".${near.length ? ` Closest: ${near.join(", ")}.` : ""}`);
        return 1;
    }
    const body = flags.full ? guide.body : dense(guide.body);
    if (flags.json) {
        json({ path: guide.path, title: guide.title, body });
        return 0;
    }
    out(body);
    return 0;
}

/** One file, not 1 files. The output is read by people. */
function plural(n, word) {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/* --------------------------------------------------------------- doctor */

function cmdDoctor(dir, flags, out, json) {
    const { facts, config } = load(dir);
    const checks = [];
    const add = (id, status, message, fix) => checks.push({ id, status, message, ...(fix ? { fix } : {}) });
    const agents = facts.agentFiles.find((a) => a.mentionsPackage);
    agents ? add("agent-docs", "pass", `${agents.label || agents.file} references ${facts.name}.`) : add("agent-docs", "fail", "No agent instructions mention this system.", "adsa fix agents-md");
    const served = facts.machine.servedMcp || [];
    if (served.length) add("mcp", "pass", `This repository serves an MCP server: ${served.slice(0, 2).join(", ")}.`);
    else if (facts.machine.declaredServers.includes("adsa") || facts.machine.mcpInPackage) add("mcp", "pass", "An MCP server is registered for this repository.");
    else add("mcp", "warn", "No MCP server registered, so agents read files instead of querying.", "npx adsa-cli fix mcp-config");
    facts.gaps.file ? add("gaps", "pass", `${facts.gaps.file} lists known absences.`) : add("gaps", "fail", "Nothing states what the system does not have.", "adsa fix gaps-file");
    facts.verification.workflows.length ? add("ci", "pass", `CI: ${facts.verification.workflows.join(", ")}.`) : add("ci", "warn", "No CI workflow found.", "adsa fix ci-workflow");
    facts.config.file ? add("config", "pass", `${facts.config.file} present.`) : add("config", "warn", "No adsa.config.json — detection is doing the guessing.");
    const ok = !checks.some((c) => c.status === "fail");
    if (flags.json) {
        json({ ok, checks });
        return ok ? 0 : 1;
    }
    for (const c of checks) {
        const tint = c.status === "pass" ? green : c.status === "warn" ? yellow : red;
        out(`  ${tint(c.status.toUpperCase().padEnd(4))} ${c.id.padEnd(11)} ${c.message}`);
        if (c.fix) out(dim(`       ${" ".repeat(11)} → ${c.fix}`));
    }
    return ok ? 0 : 1;
}

/* ---------------------------------------------------------------- badge */

function cmdBadge(dir, flags, out, json) {
    const root = resolve(dir || ".");
    const file = readJson(join(root, DIR, "score.json"));
    if (!file) {
        out("No .adsa/score.json yet. Run `npx adsa-cli audit` first.");
        return 1;
    }
    if (flags.json) {
        json(badgeEndpoint(file.total, file.max));
        return 0;
    }
    out(badgeMarkdown(file.total, file.max));
    return 0;
}

/* --------------------------------------------------------------- rubric */

function cmdRubric(flags, out, json) {
    if (flags.json) {
        json(RUBRIC);
        return 0;
    }
    out(`Agent readiness, rubric ${RUBRIC.version} — ${RUBRIC.dimensions.length} dimensions, ${RUBRIC.max} points\n`);
    for (const d of RUBRIC.dimensions) {
        out(`${d.title}`);
        out(`  ${d.question}`);
        for (const level of ["1", "3", "5"]) out(`    ${level}  ${d.levels[level]}`);
        out("");
    }
    return 0;
}

/* ----------------------------------------------------------------- main */

function isMain() {
    if (!process.argv[1]) return false;
    try {
        return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
    } catch {
        return false;
    }
}

if (isMain()) {
    setColor(detectColor());
    run(process.argv.slice(2))
        .then((code) => process.exit(code))
        .catch((error) => {
            process.stderr.write(`adsa: ${error.stack || error.message}\n`);
            process.exit(1);
        });
}
