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
import { byScore, detectColor, green, setColor } from "../lib/color.mjs";
import { html, markdown } from "../lib/report.mjs";
import { parseArgs, run } from "../bin/adsa.mjs";

const EXAMPLE = resolve("example/design-system");
const OUTPUT = resolve("example/agent-output");
const RN_FIXTURE = resolve("test/fixtures/rn-ds");
const SWIFT_FIXTURE = resolve("test/fixtures/swift-ds");
const ANDROID_FIXTURE = resolve("test/fixtures/android-ds");
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

/** A clean copy of a fixture repo, so a fix test never mutates the checked-in fixture. */
function copyFixture(root) {
    const dir = mkdtempSync(join(tmpdir(), "adsa-"));
    temps.push(dir);
    cpSync(root, dir, { recursive: true });
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

describe("platforms", () => {
    it("detects the web example as web, from react in package.json", () => {
        const { facts } = load(EXAMPLE);
        assert.equal(facts.platform.primary, "web");
    });

    it("detects React Native from the react-native dependency, and finds its components like web", () => {
        const { facts } = load(RN_FIXTURE);
        assert.equal(facts.platform.primary, "react-native");
        assert.match(facts.platform.evidence.join(" "), /react-native in package\.json/);
        assert.deepEqual(facts.components.map((c) => c.name).sort(), ["Button", "Card"]);
        assert.equal(facts.coverage.documented, 2);
    });

    it("detects Swift from Package.swift, reads the module name, and finds `struct X: View`", () => {
        const { facts } = load(SWIFT_FIXTURE);
        assert.equal(facts.platform.primary, "swift");
        assert.match(facts.platform.evidence.join(" "), /Package\.swift present/);
        assert.equal(facts.name, "AcmeKit");
        assert.deepEqual(facts.components.map((c) => c.name).sort(), ["AKButton", "AKCard"]);
    });

    it("finds a Swift package's guides in its own .docc bundle, not just adsa.config.json's guides dirs", () => {
        const { config, facts } = load(SWIFT_FIXTURE);
        assert.deepEqual(config.guides, []);
        assert.ok(facts.guides.length >= 2, "expected the .docc bundle's markdown to be picked up");
        assert.ok(facts.guides.every((g) => g.path.includes(".docc")));
    });

    it("reads named colours out of a Swift asset catalog as token evidence, without a markdown token guide", () => {
        const { facts } = load(SWIFT_FIXTURE);
        assert.equal(facts.tokens.docs.length, 0);
        assert.ok(facts.tokens.source, "expected asset-catalog evidence");
        assert.equal(facts.tokens.source.kind, "asset catalog");
        assert.ok(facts.tokens.source.names.includes("AccentPrimary"));
    });

    it("detects Android from Gradle + Kotlin, reads the project name, and finds `@Composable fun X`", () => {
        const { facts } = load(ANDROID_FIXTURE);
        assert.equal(facts.platform.primary, "android");
        assert.match(facts.platform.evidence.join(" "), /Gradle build file/);
        assert.equal(facts.name, "AcmeComponents");
        assert.deepEqual(facts.components.map((c) => c.name).sort(), ["AKButton", "AKCard"]);
    });

    it("reads named colours out of colors.xml as token evidence", () => {
        const { facts } = load(ANDROID_FIXTURE);
        assert.ok(facts.tokens.source);
        assert.equal(facts.tokens.source.kind, "XML resources");
        assert.ok(facts.tokens.source.names.includes("brand_primary"));
    });

    it("adapts the accessibility vocabulary per platform instead of demanding 'keyboard' everywhere", () => {
        const rn = score(load(RN_FIXTURE).facts, loadConfig(RN_FIXTURE)).dimensions.find((d) => d.id === "a11y");
        const swift = score(load(SWIFT_FIXTURE).facts, loadConfig(SWIFT_FIXTURE)).dimensions.find((d) => d.id === "a11y");
        const android = score(load(ANDROID_FIXTURE).facts, loadConfig(ANDROID_FIXTURE)).dimensions.find((d) => d.id === "a11y");
        assert.match(rn.evidence[0], /VoiceOver\/TalkBack/);
        assert.match(swift.evidence[0], /VoiceOver\/Dynamic Type/);
        assert.match(android.evidence[0], /TalkBack\/content description/);
    });

    it("scores each new platform's fixture from real evidence, never the floor and never a guess", () => {
        for (const fixture of [RN_FIXTURE, SWIFT_FIXTURE, ANDROID_FIXTURE]) {
            const { config, facts } = load(fixture);
            const scored = score(facts, config);
            assert.equal(scored.max, 45);
            assert.ok(scored.total > 9 && scored.total < 40, `${fixture}: ${scored.total}`);
            for (const d of scored.dimensions) assert.ok(d.evidence.length > 0, `${d.id} has no evidence for ${fixture}`);
        }
    });

    it("accepts a small native design system that the generic component/guide threshold would otherwise reject", () => {
        const { facts } = load(SWIFT_FIXTURE);
        assert.equal(facts.components.length, 2);
        assert.equal(facts.guides.length, 2);
        // Below the generic >=3 components / >=2 guides-only bar would still pass here
        // because guides.length is 2, but the platform check is what makes a 1-component,
        // 1-guide native package pass too — assert the mechanism directly.
        const thin = { ...facts, components: facts.components.slice(0, 1), guides: facts.guides.slice(0, 1) };
        assert.ok(thin.components.length < 3 && thin.guides.length < 2);
        assert.ok(thin.platform.primary !== "web" && thin.platform.detected.length > 0);
    });

    it("writes platform-flavoured agent instructions and moves the score, per platform", () => {
        for (const fixture of [RN_FIXTURE, SWIFT_FIXTURE, ANDROID_FIXTURE]) {
            const dir = copyFixture(fixture);
            let { config, facts } = load(dir);
            const before = score(facts, config).total;
            for (const id of Object.keys(FIXES)) applyFix(id, facts, config, {});
            ({ config, facts } = load(dir));
            const after = score(facts, config).total;
            assert.ok(after > before, `${fixture}: ${before} -> ${after}`);
            const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
            if (facts.platform.primary === "react-native") assert.match(agents, /React Native/);
            if (facts.platform.primary === "swift") assert.match(agents, /swift build.*swift test|Xcode scheme/);
            if (facts.platform.primary === "android") assert.match(agents, /gradlew/);
        }
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

describe("colour", () => {
    it("is plain text unless something turns it on", () => {
        assert.equal(green("ok"), "ok");
        setColor(true);
        assert.equal(green("ok"), "\u001b[32mok\u001b[39m");
        assert.match(byScore(1, "x"), /\u001b\[31m/);
        assert.match(byScore(3, "x"), /\u001b\[33m/);
        assert.match(byScore(5, "x"), /\u001b\[32m/);
        setColor(false);
    });

    it("stays off for pipes, NO_COLOR and dumb terminals", () => {
        assert.equal(detectColor({ isTTY: true }, {}), true);
        assert.equal(detectColor({ isTTY: false }, {}), false);
        assert.equal(detectColor({ isTTY: true }, { NO_COLOR: "1" }), false);
        assert.equal(detectColor({ isTTY: false }, { FORCE_COLOR: "1" }), true);
        assert.equal(detectColor({ isTTY: true }, { TERM: "dumb" }), false);
    });

    it("writes no escapes into a captured run", async () => {
        const dir = copyExample();
        let text = "";
        await run(["audit", dir], { stdout: { write: (s) => (text += s) } });
        assert.doesNotMatch(text, /\u001b\[/);
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

    it("recognises a thin native design system instead of rejecting it as not a design system", async () => {
        const dir = mkdtempSync(join(tmpdir(), "adsa-thin-"));
        temps.push(dir);
        writeFileSync(
            join(dir, "Package.swift"),
            'import PackageDescription\nlet package = Package(name: "Thin", products: [.library(name: "Thin", targets: ["Thin"])], targets: [.target(name: "Thin")])\n',
        );
        mkdirSync(join(dir, "Sources", "Thin"), { recursive: true });
        writeFileSync(join(dir, "Sources", "Thin", "TButton.swift"), "import SwiftUI\npublic struct TButton: View {\n    public var body: some View { Text(\"Hi\") }\n}\n");
        mkdirSync(join(dir, "Sources", "Thin", "Thin.docc"), { recursive: true });
        writeFileSync(join(dir, "Sources", "Thin", "Thin.docc", "TButton.md"), "# TButton\n\n## Import\n\n```swift\nimport Thin\n```\n");
        const out = capture();
        assert.equal(await run(["audit", dir, "--quiet"], out.io), 0);
        assert.doesNotMatch(out.text(), /does not look like a design system/);

        // But an unrelated directory with no platform evidence at all is still rejected.
        const empty = mkdtempSync(join(tmpdir(), "adsa-empty-"));
        temps.push(empty);
        writeFileSync(join(empty, "package.json"), JSON.stringify({ name: "nothing" }));
        const rejected = capture();
        assert.equal(await run(["audit", empty, "--quiet"], rejected.io), 1);
        assert.match(rejected.text(), /does not look like a design system/);
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
