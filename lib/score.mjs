/**
 * Turns facts into a score. Every dimension returns the evidence it used, so the
 * number is arguable: a maintainer who disagrees can point at the line that produced it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const RUBRIC = JSON.parse(readFileSync(join(here, "..", "rubric", "rubric.json"), "utf8"));

const pct = (n) => `${Math.round(n * 100)}%`;
/** Evidence lines end up on a landing page and in a pull request. They read as English. */
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What "accessibility documentation" means in the vocabulary of each platform. */
const A11Y_LABEL = {
    web: "keyboard or accessibility",
    "react-native": "VoiceOver/TalkBack or accessibility",
    swift: "VoiceOver/Dynamic Type",
    android: "TalkBack/content description",
};

const SCORERS = {
    "agent-instructions"(f) {
        const files = f.agentFiles.filter((a) => a.lines > 3);
        // A file in the package's own directory is about the package. Requiring the
        // name in the text is the right question for a monorepo root, and the wrong one
        // for the AGENTS.md a single-package repository keeps beside its components.
        const main = files.find((a) => a.mentionsPackage) || files.find((a) => a.scope !== "repo") || files[0];
        if (!main) return { score: 1, evidence: ["No AGENTS.md, CLAUDE.md or equivalent in the repository."] };
        const ev = [`${main.label || main.file}, ${main.lines} lines.`];
        if (!main.mentionsPackage && main.scope === "repo") {
            ev.push(`It never mentions ${f.name}, so an agent gets no design-system rules from it.`);
            return { score: 1, evidence: ev };
        }
        const parts = [
            ["an import rule", main.hasImportRule],
            ["a lookup command", main.hasLookupCommand],
            ["token rules", main.hasTokenRule],
            ["a list of what is forbidden", main.hasForbidden],
            ["a check to run before finishing", main.hasFinishCheck],
        ];
        const present = parts.filter(([, ok]) => ok).map(([label]) => label);
        const absent = parts.filter(([, ok]) => !ok).map(([label]) => label);
        ev.push(`Contains ${present.join(", ") || "none of the expected rules"}.`);
        if (absent.length) ev.push(`Missing ${absent.join(", ")}.`);
        return { score: absent.length === 0 ? 5 : present.length >= 2 ? 3 : 1, evidence: ev };
    },

    "machine-surface"(f) {
        const m = f.machine;
        const ev = [];
        const served = m.servedMcp || [];
        const siblings = m.siblingClis || [];
        const commands = m.commands || [];
        if (m.mcpInPackage) ev.push(`An MCP server ships inside the package (bin: ${m.binNames.join(", ")}).`);
        if (served.length) ev.push(`This repository serves an MCP server: ${served.slice(0, 3).join(", ")}.`);
        if (m.declaredServers.length) ev.push(`${m.mcpConfigs.join(", ")} registers ${m.declaredServers.join(", ")}.`);
        if (m.cliShipped && !m.mcpInPackage) ev.push(`A CLI ships with the package (bin: ${m.binNames.join(", ")}).`);
        if (siblings.length) ev.push(`A CLI ships from ${siblings.map((c) => `${c.name} (${c.bin.join(", ")})`).slice(0, 2).join(", ")}.`);
        if (m.llmsTxt.length) ev.push(`${m.llmsTxt.join(", ")} present.`);
        if (m.skills.length) ev.push(`${m.skills.length} agent skill${m.skills.length === 1 ? "" : "s"} published.`);
        if (commands.length) ev.push(`${commands.length} agent command${commands.length === 1 ? "" : "s"} published.`);
        if (m.storybookMcp) ev.push("@storybook/addon-mcp is installed, which answers from a running Storybook in this repo only.");
        if (!ev.length) ev.push("No MCP server, no docs CLI, no llms.txt, no published skills: an agent has to read files.");
        const mcp = m.mcpInPackage || m.declaredServers.length || served.length;
        const queryable = m.cliShipped || siblings.length || m.llmsTxt.length || m.skills.length || commands.length || m.storybookMcp;
        return { score: mcp ? 5 : queryable ? 3 : 1, evidence: ev };
    },

    "docs-coverage"(f) {
        const c = f.coverage;
        if (!c.total) return { score: 1, evidence: [`${f.shape.componentFiles} component source files were read and none exported a component — check \`source\` in adsa.config.json.`] };
        const gate = f.verification.docChecks || f.verification.scoreGate;
        const noun = f.shape.kind === "classes" ? "component classes" : "importable components";
        const ev = [`${c.documented} of ${c.total} ${noun} have a guide (${pct(c.ratio)}).`];
        if (f.icons) ev.push(`${f.icons} icon or logo exports were set aside; nobody writes a guide per icon.`);
        if (c.missing.length) ev.push(`Undocumented, first few: ${c.missing.slice(0, 8).join(", ")}.`);
        ev.push(gate ? "CI runs a documentation check." : "Nothing in CI stops a new export from shipping without a guide.");
        const score = c.ratio >= 0.9 && gate ? 5 : c.ratio >= 0.7 ? 3 : 1;
        return { score, evidence: ev };
    },

    "docs-freshness"(f) {
        const s = f.freshness;
        const ev = [`${f.guides.length} guides, ${s.blocks} code blocks, ${s.guidesWithPropTable} with a prop table.`];
        if (s.guidesGenerated) ev.push(`${s.guidesGenerated} guides carry a generated marker.`);
        else ev.push("No guide is marked as generated, so every table is hand-maintained.");
        if (s.unknownCount) ev.push(`${plural(s.unknownCount, "import")} in the guides ${s.unknownCount === 1 ? "names a symbol" : "name symbols"} this repo does not export, e.g. ${s.unknownImports.slice(0, 3).map((u) => `${u.name} in ${u.guide}`).join("; ")}.`);
        else ev.push("Every symbol imported in the guides exists in the source.");
        ev.push(s.compiledInCi ? "CI checks the guides against the code." : "Nothing compares the guides to the code.");
        let score = s.compiledInCi && s.guidesGenerated ? 5 : s.guidesGenerated || s.guidesWithPropTable ? 3 : 1;
        if (s.unknownCount > 5) score = 1;
        else if (s.unknownCount > 0) score = Math.min(score, 3);
        return { score, evidence: ev };
    },

    tokens(f) {
        const t = f.tokens;
        const ev = [];
        ev.push(t.docs.length ? `Token documentation: ${t.docs.slice(0, 4).join(", ")}.` : "No token documentation found in the guides.");
        const source = t.source;
        if (!t.docs.length && source && source.count) {
            const noun = source.count === 1 ? "named token" : "named tokens";
            ev.push(`${source.count} ${noun} defined in ${source.kind} (${source.files.slice(0, 2).join(", ")}), e.g. ${source.names.slice(0, 3).join(", ")} — real, but nothing in prose describes when to use which.`);
        }
        ev.push(`${t.motion ? "Motion documented" : "No motion documentation"}; ${t.spacing ? "spacing documented" : "no spacing documentation"}.`);
        if (t.rawPaletteCount) ev.push(`${t.rawPaletteCount} raw palette classes in guide examples, e.g. ${t.rawPalette.slice(0, 3).map((h) => h.value).join(", ")}.`);
        if (t.hexCount) ev.push(`${t.hexCount} raw hex values in guide examples.`);
        const hasNamedTokens = t.docs.length > 0 || Boolean(source && source.count);
        let score = t.docs.length && t.motion && t.spacing ? 5 : hasNamedTokens ? 3 : 1;
        if (t.rawPaletteCount > 0) score = Math.min(score, 3);
        return { score, evidence: ev };
    },

    patterns(f) {
        const p = f.patterns;
        const ev = [];
        if (p.files.length) ev.push(`Pattern-level docs: ${p.files.slice(0, 4).join(", ")}.`);
        if (p.mapFound) ev.push("A task-to-component table exists in the guides.");
        if (!p.files.length && !p.mapFound) ev.push("Components only. Nothing describes how a page is assembled.");
        if (p.files.length && !p.rich) ev.push("The pattern docs do not cover states or traps, so an agent still guesses the empty and error cases.");
        return { score: p.rich ? 5 : p.files.length || p.mapFound ? 3 : 1, evidence: ev };
    },

    a11y(f) {
        const a = f.a11y;
        const label = A11Y_LABEL[a.platform] || A11Y_LABEL.web;
        const ev = [`${a.withSection} of ${a.total} guides carry a ${label} section (${pct(a.ratio)}).`];
        if (a.generated) ev.push("At least some of those sections are generated rather than hand-written.");
        ev.push(a.automation ? "Accessibility checks run in CI." : "No automated accessibility check found.");
        if (a.baseline.length) ev.push(`A known-violations baseline exists: ${a.baseline.join(", ")}.`);
        return { score: a.ratio >= 0.9 && (a.generated || a.automation) ? 5 : a.ratio >= 0.3 ? 3 : 1, evidence: ev };
    },

    verification(f) {
        const v = f.verification;
        const ev = [`${plural(v.testFiles, "test file")}, ${plural(v.storyFiles, "story", "stories")}.`];
        const bits = [v.testScript && "test", v.typecheckScript && "typecheck", v.lintScript && "lint"].filter(Boolean);
        ev.push(bits.length ? `Scripts: ${bits.join(", ")}.` : "No test, typecheck or lint script.");
        if (v.workflows.length) ev.push(`CI: ${v.workflows.join(", ")}.`);
        else ev.push("No CI workflow found, so nothing runs on a pull request.");
        if (v.storyTests) ev.push("Stories are rendered and tested in CI.");
        if (v.axe) ev.push("Accessibility assertions run as part of that.");
        if (v.scoreGate) ev.push("The agent-readiness score itself is gated in CI.");
        const strong = (v.storyTests && v.axe) || (v.testScript && v.docChecks && v.workflows.length);
        return { score: strong ? 5 : v.testScript || v.lintScript || v.workflows.length ? 3 : 1, evidence: ev };
    },

    "gap-handling"(f) {
        const g = f.gaps;
        const ev = [];
        ev.push(g.file ? `A list of known absences exists: ${g.file}.` : "Nothing lists what the system deliberately does not have.");
        ev.push(g.stopAndAsk ? "The agent instructions tell the agent to stop and ask instead of inventing." : "No stop-and-ask rule, so an unlisted gap gets filled silently.");
        ev.push(g.reportCommand ? `A gap can be reported with \`${g.reportCommand}\`.` : "No way for an agent to report a new gap where the next agent will read it.");
        const score = g.file && g.stopAndAsk && g.reportCommand ? 5 : g.file || g.stopAndAsk ? 3 : 1;
        return { score, evidence: ev };
    },
};

/**
 * Dimensions this repository cannot answer, because of what it is rather than what it
 * is missing. A system with no importable surface at all — a stylesheet, a token
 * package, a documentation repo — has nothing for "does every component have a guide"
 * to be about, and scoring that 1 out of 5 twice reports a shape as a failure.
 *
 * Only the unambiguous case skips. A repo full of `.tsx` files where the scan found no
 * exports is this tool failing, and it keeps its low score and says so.
 */
function autoSkipped(facts, config) {
    if (config.autoSkip === false || facts.shape.kind !== "docs-only") return new Map();
    const why = `No importable components and no component source files in ${facts.scanned.package}: this dimension does not apply, so it is out of the maximum rather than scored as a failure.`;
    return new Map([
        ["docs-coverage", why],
        ["docs-freshness", why],
    ]);
}

/** @returns {{ total:number, max:number, dimensions:Array }} */
export function score(facts, config = {}) {
    const skip = new Set(config.skip || []);
    const auto = autoSkipped(facts, config);
    const dimensions = RUBRIC.dimensions.map((dim) => {
        if (skip.has(dim.id) || auto.has(dim.id)) {
            const why = skip.has(dim.id) ? "Skipped by configuration." : auto.get(dim.id);
            return { id: dim.id, title: dim.title, score: null, max: 5, skipped: true, evidence: [why], fixes: [] };
        }
        const result = SCORERS[dim.id](facts);
        return {
            id: dim.id,
            title: dim.title,
            question: dim.question,
            why: dim.why,
            score: result.score,
            max: 5,
            level: dim.levels[String(result.score)],
            next: result.score < 5 ? dim.levels[String(result.score === 1 ? 3 : 5)] : null,
            evidence: result.evidence,
            fixes: result.score < 5 ? dim.fixes : [],
        };
    });
    const scored = dimensions.filter((d) => !d.skipped);
    return {
        total: scored.reduce((n, d) => n + d.score, 0),
        max: scored.length * 5,
        dimensions,
    };
}

/** The machine-readable artifact: committed to the repo so the next run can compare. */
export function scoreFile(facts, scored) {
    return {
        tool: "adsa",
        rubric: RUBRIC.version,
        generatedAt: new Date().toISOString(),
        target: { name: facts.name, version: facts.version },
        total: scored.total,
        max: scored.max,
        dimensions: Object.fromEntries(scored.dimensions.map((d) => [d.id, d.score])),
        summary: {
            components: facts.coverage.total,
            documented: facts.coverage.documented,
            guides: facts.guides.length,
            codeBlocks: facts.freshness.blocks,
            unknownImports: facts.freshness.unknownCount,
            guidesWithA11y: facts.a11y.withSection,
        },
    };
}
