import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadConfig, resolveTarget } from "../lib/config.mjs";
import { scan } from "../lib/scan.mjs";
import { RUBRIC, score, scoreFile } from "../lib/score.mjs";
import { applyFix, FIXES, render, vars } from "../lib/fix.mjs";
import { dense } from "../lib/dense.mjs";
import { findGuide, handleMessage, searchGuides, TOOLS } from "../lib/mcp.mjs";
import { evaluate, taskFile } from "../lib/eval.mjs";
import { badgeColor, badgeEndpoint, badgeMarkdown } from "../lib/badge.mjs";
import { compare } from "../lib/history.mjs";
import { html, markdown } from "../lib/report.mjs";
import { parseArgs, run } from "../bin/adsa.mjs";

const EXAMPLE = resolve("example/design-system");
const OUTPUT = resolve("example/agent-output");
const temps = [];

function copyExample() {
    const dir = mkdtempSync(join(tmpdir(), "adsa-"));
    temps.push(dir);
    cpSync(EXAMPLE, dir, { recursive: true });
    rmSync(join(dir, "AGENTS.md"), { force: true });
    rmSync(join(dir, "GAPS.md"), { force: true });
    rmSync(join(dir, ".mcp.json"), { force: true });
    rmSync(join(dir, ".adsa"), { recursive: true, force: true });
    rmSync(join(dir, ".github"), { recursive: true, force: true });
    rmSync(join(dir, "guidelines/design-tokens.md"), { force: true });
    return dir;
}

const load = (root) => {
    const config = loadConfig(root);
    return { config, facts: scan(root, config) };
};

after(() => temps.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("rubric", () => {
    it("is nine dimensions worth forty-five points", () => {
        assert.equal(RUBRIC.dimensions.length, 9);
        assert.equal(RUBRIC.dimensions.length * 5, RUBRIC.max);
        for (const d of RUBRIC.dimensions) {
            assert.ok(d.levels["1"] && d.levels["3"] && d.levels["5"], `${d.id} needs all three levels`);
            assert.ok(d.why, `${d.id} needs a reason`);
        }
    });
});

describe("scan", () => {
    const { facts } = load(EXAMPLE);

    it("reads the package and its stack", () => {
        assert.equal(facts.name, "@acme/ui");
        assert.equal(facts.stack.react, true);
        assert.equal(facts.stack.typescript, true);
    });

    it("takes the importable surface from exports subpaths", () => {
        assert.equal(facts.components.length, 6);
        assert.ok(facts.components.every((c) => c.from === "exports"));
    });

    it("finds the guides and their code blocks", () => {
        assert.ok(facts.guides.length >= 3);
        const button = facts.guides.find((g) => g.slug === "button");
        assert.ok(button.blocks >= 3);
        assert.ok(button.rawPalette.includes("bg-gray-100"));
    });

    it("flags an import the system does not export", () => {
        const names = facts.freshness.unknownImports.map((u) => u.name);
        assert.ok(names.includes("ButtonGroup"), `expected ButtonGroup, got ${names.join(",")}`);
    });

    it("counts sub-exports of a documented component as documented", () => {
        assert.ok(facts.coverage.documented >= 3);
        assert.ok(facts.coverage.missing.includes("Modal"));
    });
});

describe("monorepo", () => {
    it("audits the package that looks like the design system, not the workspace root", () => {
        const root = mkdtempSync(join(tmpdir(), "adsa-ws-"));
        temps.push(root);
        writeFileSync(join(root, "package.json"), JSON.stringify({ name: "monorepo", private: true, workspaces: ["packages/*"] }));
        mkdirSync(join(root, "packages"), { recursive: true });
        cpSync(EXAMPLE, join(root, "packages", "ui"), { recursive: true });
        mkdirSync(join(root, "packages", "app"), { recursive: true });
        writeFileSync(join(root, "packages", "app", "package.json"), JSON.stringify({ name: "app" }));

        const target = resolveTarget(root);
        assert.equal(target.dir, join(root, "packages", "ui"));
        assert.match(target.note, /@acme\/ui/);
        assert.equal(resolveTarget(EXAMPLE).note, null);
    });
});

describe("score", () => {
    it("gives an undocumented system the floor", () => {
        const dir = copyExample();
        const { config, facts } = load(dir);
        const scored = score(facts, config);
        assert.equal(scored.max, 45);
        assert.equal(scored.total, 9);
        assert.ok(scored.dimensions.every((d) => d.score === 1));
    });

    it("carries the evidence that produced each number", () => {
        const { config, facts } = load(EXAMPLE);
        const scored = score(facts, config);
        for (const d of scored.dimensions) assert.ok(d.evidence.length > 0, `${d.id} has no evidence`);
        const coverage = scored.dimensions.find((d) => d.id === "docs-coverage");
        assert.match(coverage.evidence[0], /of 6 importable components/);
    });

    it("honours skip", () => {
        const { facts } = load(EXAMPLE);
        const scored = score(facts, { skip: ["patterns"] });
        assert.equal(scored.max, 40);
        assert.equal(scored.dimensions.find((d) => d.id === "patterns").skipped, true);
    });

    it("writes a machine-readable score", () => {
        const { config, facts } = load(EXAMPLE);
        const file = scoreFile(facts, score(facts, config));
        assert.equal(file.tool, "adsa");
        assert.equal(Object.keys(file.dimensions).length, 9);
        assert.equal(typeof file.summary.components, "number");
    });
});

describe("fix", () => {
    it("moves the score and is idempotent", () => {
        const dir = copyExample();
        let { config, facts } = load(dir);
        const before = score(facts, config).total;
        for (const id of Object.keys(FIXES)) applyFix(id, facts, config, {});
        ({ config, facts } = load(dir));
        const after = score(facts, config).total;
        assert.ok(after > before, `${before} -> ${after}`);

        const second = Object.keys(FIXES).flatMap((id) => applyFix(id, facts, config, {}));
        const created = second.filter((a) => a.action === "create" && !a.file.includes(".adsa/fixes"));
        assert.deepEqual(created, [], "a second run should create nothing new");
    });

    it("keeps other MCP servers and the file's own indentation", () => {
        const dir = copyExample();
        writeFileSync(join(dir, ".mcp.json"), '{\n    "mcpServers": {\n        "figma": { "command": "figma-mcp" }\n    }\n}\n');
        const { config, facts } = load(dir);
        applyFix("mcp-config", facts, config, {});
        const text = readFileSync(join(dir, ".mcp.json"), "utf8");
        const json = JSON.parse(text);
        assert.ok(json.mcpServers.figma);
        assert.equal(json.mcpServers.adsa.command, "npx");
        assert.match(text, /\n {4}"mcpServers"/);
    });

    it("writes nothing on a dry run", () => {
        const dir = copyExample();
        const { config, facts } = load(dir);
        const actions = applyFix("gaps-file", facts, config, { dryRun: true });
        assert.equal(actions[0].action, "create");
        assert.throws(() => readFileSync(join(dir, "GAPS.md")));
    });

    it("renders templates from facts, never from questions", () => {
        const { config, facts } = load(EXAMPLE);
        const v = vars(facts, config);
        assert.equal(v.name, "@acme/ui");
        assert.match(v.importExample, /@acme\/ui\//);
        assert.equal(render("a {{name}} b {{nope}}", v), "a @acme/ui b {{nope}}");
    });
});

describe("dense", () => {
    it("keeps headings, code and tables and drops the prose", () => {
        const out = dense("# T\n\nSome explanation here.\n\n| a | b |\n| - | - |\n\n```tsx\nconst x = 1;\n// a comment stays\n```\n\nMore prose.\n");
        assert.match(out, /# T/);
        assert.match(out, /const x = 1;/);
        assert.match(out, /a comment stays/);
        assert.doesNotMatch(out, /Some explanation/);
        assert.doesNotMatch(out, /More prose/);
    });
});

describe("mcp", () => {
    const context = load(EXAMPLE);

    it("answers initialize and tools/list", () => {
        const init = handleMessage(context, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
        assert.equal(init.result.serverInfo.name, "adsa");
        assert.equal(handleMessage(context, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
        const list = handleMessage(context, { jsonrpc: "2.0", id: 2, method: "tools/list" });
        assert.deepEqual(list.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
    });

    it("returns a guide, dense by default", () => {
        const res = handleMessage(context, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_guide", arguments: { name: "Input" } } });
        assert.match(res.result.content[0].text, /import \{ Input \}/);
        assert.doesNotMatch(res.result.content[0].text, /do not use a placeholder instead/);
    });

    it("tells the agent not to invent when nothing matches", () => {
        const res = handleMessage(context, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search", arguments: { query: "sparkline chart" } } });
        assert.match(res.result.content[0].text, /do not invent/i);
    });

    it("resolves a component by slug, title or symbol", () => {
        assert.equal(findGuide(context.facts, "card").slug, "card");
        assert.equal(findGuide(context.facts, "CardHeader").slug, "card");
        assert.equal(findGuide(context.facts, "nope"), null);
        assert.ok(searchGuides(context.facts, "labelled text field").length > 0);
        assert.deepEqual(searchGuides(context.facts, "the a of"), []);
    });
});

describe("eval", () => {
    it("separates components that exist from ones the agent made up", () => {
        const { config, facts } = load(EXAMPLE);
        const result = evaluate(OUTPUT, facts, config);
        const invented = result.invented.map((i) => i.name).sort();
        assert.deepEqual(invented, ["FormRow", "PageHeader", "Toggle"]);
        assert.ok(result.used.includes("Button"));
        assert.deepEqual([...new Set(result.forbiddenImports.map((f) => f.package))], ["lucide-react"]);
        assert.ok(result.rawPalette.length >= 2);
        assert.match(result.verdict, /do not exist/);
    });
});

describe("eval task", () => {
    it("never writes an absolute path into a file that gets committed", () => {
        const { config, facts } = load(EXAMPLE);
        const task = taskFile(facts, config);
        assert.doesNotMatch(task, /\/(Users|home)\//);
        assert.match(task, /--system example\/design-system/);
    });
});

describe("badge and history", () => {
    it("colours by band and renders markdown", () => {
        assert.equal(badgeColor(45, 45), "17795c");
        assert.equal(badgeColor(9, 45), "a8352c");
        assert.match(badgeMarkdown(23, 45), /agent--ready-23%2F45/);
        assert.equal(badgeEndpoint(23, 45).message, "23/45");
    });

    it("reports which dimensions moved", () => {
        const previous = { total: 9, dimensions: { tokens: 1, patterns: 1 }, generatedAt: "2026-01-01" };
        const current = { total: 13, dimensions: { tokens: 5, patterns: 1 } };
        const delta = compare(previous, current);
        assert.equal(delta.delta, 4);
        assert.deepEqual(delta.moved, [{ id: "tokens", from: 1, to: 5 }]);
        assert.equal(compare(null, current), null);
    });
});

describe("report", () => {
    const { config, facts } = load(EXAMPLE);
    const scored = score(facts, config);

    it("is one self-contained page with the score, evidence and the signature", () => {
        const page = html(facts, scored, []);
        assert.match(page, /<!doctype html>/);
        assert.doesNotMatch(page, /<script src=|<link rel="stylesheet"/);
        assert.match(page, new RegExp(`>${scored.total}<`));
        assert.match(page, /From one designer to designers with love/);
        assert.match(page, /adsa fix /);
    });

    it("escapes what it prints", () => {
        const page = html({ ...facts, name: "<script>x</script>" }, scored, []);
        assert.doesNotMatch(page, /<script>x<\/script>/);
    });

    it("has a markdown twin with a checklist", () => {
        const md = markdown(facts, scored);
        assert.match(md, /^# @acme\/ui/);
        assert.match(md, /- \[ \] \*\*/);
    });
});

describe("cli", () => {
    const capture = () => {
        let text = "";
        return { io: { stdout: { write: (s) => (text += s) } }, text: () => text };
    };

    it("parses commands, flags and values", () => {
        const parsed = parseArgs(["audit", "some/dir", "--json", "--min", "30"]);
        assert.equal(parsed.command, "audit");
        assert.deepEqual(parsed.args, ["some/dir"]);
        assert.equal(parsed.flags.json, true);
        assert.equal(parsed.flags.min, 30);
    });

    it("audits, writes the artifacts and gates on a drop", async () => {
        const dir = copyExample();
        const out = capture();
        assert.equal(await run(["audit", dir, "--quiet"], out.io), 0);
        assert.match(out.text(), /9\/45/);
        const scoreJson = JSON.parse(readFileSync(join(dir, ".adsa", "score.json"), "utf8"));
        assert.equal(scoreJson.total, 9);
        readFileSync(join(dir, ".adsa", "report.html"));
        readFileSync(join(dir, ".adsa", "badge.json"));
        assert.equal(await run(["audit", dir, "--quiet", "--gate", "--min", "40"], capture().io), 1);
        assert.equal(await run(["audit", dir, "--quiet", "--gate", "--min", "5"], capture().io), 0);
    });

    it("fails eval when the agent invented components", async () => {
        const out = capture();
        const code = await run(["eval", "score", OUTPUT, "--system", EXAMPLE], out.io);
        assert.equal(code, 1);
        assert.match(out.text(), /PageHeader/);
    });

    it("prints the rubric and the fix list", async () => {
        const rubric = capture();
        await run(["rubric"], rubric.io);
        assert.match(rubric.text(), /Gap handling/);
        const fixes = capture();
        await run(["fix", "--list"], fixes.io);
        assert.match(fixes.text(), /writes a brief/);
    });
});
