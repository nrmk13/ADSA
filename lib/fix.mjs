/**
 * Fixes. Two kinds, and the difference is honest rather than cosmetic:
 *
 *   apply  — a file this tool can write correctly in any repository.
 *   brief  — a task that needs the repo's own stack to do properly, written as a
 *            specification an agent executes, with the traps we already hit in it.
 *
 * Everything is idempotent: applied files are written between markers or created
 * only when absent, so running a fix twice is a no-op.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exists, read, readJson } from "./fsx.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(here, "..", "templates");
const START = "<!-- adsa:start -->";
const END = "<!-- adsa:end -->";

export const FIXES = {
    "agents-md": { kind: "apply", title: "Write agent instructions", dimension: "agent-instructions", run: fixAgents },
    "gaps-file": { kind: "apply", title: "List what the system does not have", dimension: "gap-handling", run: fixGaps },
    "mcp-config": { kind: "apply", title: "Expose the docs as MCP tools", dimension: "machine-surface", run: fixMcp },
    "tokens-doc": { kind: "apply", title: "Document tokens as tables", dimension: "tokens", run: fixTokens },
    "ci-workflow": { kind: "apply", title: "Put the checks in CI", dimension: "verification", run: fixCi },
    "coverage-gate": { kind: "brief", title: "Fail CI on an undocumented export", dimension: "docs-coverage", brief: "coverage-gate" },
    "prop-tables": { kind: "brief", title: "Generate prop tables from types", dimension: "docs-freshness", brief: "prop-tables" },
    "examples-check": { kind: "brief", title: "Compile guide examples in CI", dimension: "docs-freshness", brief: "examples-check" },
    "a11y-docs": { kind: "brief", title: "Add keyboard and accessibility sections", dimension: "a11y", brief: "a11y-docs" },
    "patterns-doc": { kind: "brief", title: "Write page-level patterns", dimension: "patterns", brief: "patterns-doc" },
};

/** Values a template may reference. Derived from the scan, never asked for. */
export function vars(facts, config) {
    const guidesDir = (config.guides && config.guides[0]) || "docs";
    const sourceDir = (config.source && config.source[0]) || "src";
    const subpath = facts.components.find((c) => c.from === "exports");
    const pm = exists(join(facts.root, "yarn.lock")) ? "yarn" : exists(join(facts.root, "pnpm-lock.yaml")) ? "pnpm" : "npm run";
    const cli = facts.machine.binNames[0];
    return {
        name: facts.name,
        version: facts.version ? ` ${facts.version}` : "",
        stack: [facts.stack.react && "React", facts.stack.typescript && "TypeScript", facts.stack.tailwind && "Tailwind", facts.stack.storybook && "Storybook"].filter(Boolean).join(", ") || "unknown",
        headless: facts.stack.headless.join(", ") || "your headless primitives",
        guidesDir,
        sourceDir,
        pkgRun: pm,
        lookup: cli ? `run \`npx ${cli} docs <component>\`` : "run `npx adsa search \"<what you need>\"`, then `npx adsa docs <component>`",
        importExample: subpath ? `import { ${subpath.name} } from "${facts.name}/${subpath.slug}"` : `import { Button } from "${facts.name}"`,
        importRule: subpath ? "Never from the package root." : "",
        paletteExample: facts.stack.tailwind ? "`bg-gray-100`, `text-blue-600`" : "raw colour literals",
        gapsFile: "GAPS.md",
        finishCheck: finishCheck(facts, pm),
    };
}

function finishCheck(facts, pm) {
    const scripts = facts.verification;
    const bits = [];
    if (scripts.typecheckScript) bits.push(`\`${pm} typecheck\``);
    if (scripts.lintScript) bits.push(`\`${pm} lint\``);
    if (scripts.testScript) bits.push(`\`${pm} test\``);
    return bits.length ? `${bits.join(", ")} must pass` : "your project's type check and lint must pass";
}

export function render(template, values) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (values[key] === undefined ? `{{${key}}}` : String(values[key])));
}

function template(name) {
    return readFileSync(join(TEMPLATES, name), "utf8");
}

/** @returns {Array<{file:string, action:"create"|"update"|"skip", note:string}>} */
export function applyFix(id, facts, config, opts = {}) {
    const fix = FIXES[id];
    if (!fix) throw new Error(`Unknown fix "${id}". Run \`adsa fix --list\`.`);
    const values = vars(facts, config);
    if (fix.kind === "brief") return writeBrief(id, fix, values, facts, opts);
    return fix.run(facts, config, values, opts);
}

function writeBrief(id, fix, values, facts, opts) {
    const file = join(".adsa", "fixes", `${id}.md`);
    const body = render(template(join("briefs", `${fix.brief}.md`)), values);
    return [write(facts.root, file, body, opts, "brief for your agent")];
}

/* ------------------------------------------------------------- apply fixes */

function fixAgents(facts, config, values, opts) {
    const target = facts.agentFiles.find((a) => a.file === "AGENTS.md" || a.file === "CLAUDE.md");
    const file = target ? target.file : "AGENTS.md";
    const path = join(facts.root, file);
    const section = render(template("AGENTS.md.tmpl"), values);
    const current = read(path);
    if (current === null) return [write(facts.root, file, `# Agents\n\n${section}`, opts, "design-system section added")];
    if (current.includes(START) && current.includes(END)) {
        const next = current.slice(0, current.indexOf(START)) + section.trimEnd() + current.slice(current.indexOf(END) + END.length);
        if (next === current) return [{ file, action: "skip", note: "section already up to date" }];
        return [write(facts.root, file, next, opts, "section refreshed")];
    }
    return [write(facts.root, file, current.replace(/\s*$/, "\n\n") + section, opts, "section appended")];
}

function fixGaps(facts, config, values, opts) {
    const file = facts.gaps.file || "GAPS.md";
    if (exists(join(facts.root, file))) return [{ file, action: "skip", note: "a gap list already exists" }];
    return [write(facts.root, "GAPS.md", template("GAPS.md.tmpl"), opts, "created; fill in the real absences")];
}

function fixMcp(facts, config, values, opts) {
    const entry = { command: "npx", args: ["--yes", "adsa@latest", "mcp"] };
    const results = [];
    for (const file of [".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json"]) {
        const path = join(facts.root, file);
        const present = exists(path);
        if (!present && file !== ".mcp.json") continue;
        const current = present ? readJson(path) : null;
        if (present && !current) {
            results.push({ file, action: "skip", note: "not valid JSON — left alone" });
            continue;
        }
        const config_ = current || {};
        const key = config_.servers && !config_.mcpServers ? "servers" : "mcpServers";
        const servers = config_[key] || {};
        if (servers.adsa) {
            results.push({ file, action: "skip", note: "the adsa server is already registered" });
            continue;
        }
        const next = { ...config_, [key]: { ...servers, adsa: entry } };
        results.push(write(facts.root, file, JSON.stringify(next, null, indentOf(present ? readFileSync(path, "utf8") : "")) + "\n", opts, present ? "adsa server added" : "adsa server registered"));
    }
    results.push({ file: "—", action: "note", note: "restart your MCP client, then run `adsa doctor`" });
    return results;
}

function indentOf(text) {
    const m = text.match(/\n([ \t]+)\S/);
    return m ? m[1] : 2;
}

function fixTokens(facts, config, values, opts) {
    if (facts.tokens.docs.length) return [{ file: facts.tokens.docs[0], action: "skip", note: "token documentation already exists" }];
    const file = join(values.guidesDir, "design-tokens.md");
    return [write(facts.root, file, template("tokens.md.tmpl"), opts, "created; replace the example rows")];
}

function fixCi(facts, config, values, opts) {
    const file = ".github/workflows/adsa.yml";
    if (exists(join(facts.root, file))) return [{ file, action: "skip", note: "workflow already present" }];
    return [write(facts.root, file, template(join("ci", "adsa.yml")), opts, "gates the score on every pull request")];
}

/* ------------------------------------------------------------------ writing */

function write(root, file, body, opts, note) {
    const path = join(root, file);
    const existed = exists(path);
    if (!opts.dryRun) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, body);
    }
    return { file, action: existed ? "update" : "create", note };
}
