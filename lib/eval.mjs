/**
 * The experiment. A static audit says how well documented a system is; this measures
 * what an agent actually produced when it used the system, which is the only number
 * that has ever changed anyone's mind.
 *
 * The agent does the building. This writes the task and then measures the result.
 */
import { join, relative } from "node:path";
import { isDir, read, rel, walk } from "./fsx.mjs";

const IMPORT = /import\s*(?:type\s*)?(?:\{([^}]*)\}|(\w+)|\*\s*as\s*(\w+))?\s*(?:,\s*\{([^}]*)\})?\s*from\s*["']([^"']+)["']/g;
const PALETTE = "slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RAW_PALETTE = new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide)-(?:${PALETTE})-\\d{2,3}\\b`, "g");
const HEX = /#[0-9a-fA-F]{6}\b/g;

/** Always relative: a task file is committed, and an absolute path is both a leak and wrong for everyone else. */
function systemPath(root) {
    const rel = relative(process.cwd(), root);
    return !rel ? "." : rel.startsWith("..") ? "<path-to-the-design-system>" : rel;
}

export function taskFile(facts, values) {
    return `# Agent-readiness experiment

Give this task to a coding agent in a **fresh session**, with no other context than
this repository and the design system it depends on.

## The task

Build one real page using **only ${facts.name}**. Pick a page your product actually
has — a list with filters, a settings form, a detail view — not a showcase of
components.

Rules for the agent:

- Every UI element comes from ${facts.name}. No second component library, no icons
  from anywhere else, no local copies of component source.
- Colour, spacing and typography come from the system's tokens.
- If something you need does not exist in the system, **stop and say so** instead of
  building your own version of it.
- Work to a running page, not a sketch.

## Then measure it

\`\`\`bash
adsa eval score <the-project-you-just-built> --system ${systemPath(facts.root)}
\`\`\`

The number that matters is how many imports name components the system does not
have. Everything else is commentary.

## What to record

| Metric | Round 1 | Round 2 |
| :-- | :-- | :-- |
| Components invented | | |
| Imports from the system | | |
| Forbidden packages | | |
| Raw palette classes | | |
| Time to a working page | | |

Run it again after the fixes. The gap between the two columns is the argument.
`;
}

/**
 * @param {string} consumerRoot project the agent produced
 * @param {object} facts scan of the design system it was supposed to use
 */
export function evaluate(consumerRoot, facts, config) {
    const files = walk(consumerRoot, [".tsx", ".jsx", ".ts", ".js", ".vue", ".svelte"], 7).filter((f) => !/\.(test|spec|stories)\./.test(f));
    const known = facts.symbols instanceof Set ? facts.symbols : new Set(facts.symbols || []);
    const forbidden = new Set(config.forbidden || []);
    const result = {
        project: consumerRoot,
        system: facts.name,
        files: files.length,
        used: new Set(),
        invented: [],
        systemImports: 0,
        forbiddenImports: [],
        rawPalette: [],
        hex: [],
        localUiFolder: ["components/ui", "src/components/ui", "app/components/ui"].filter((p) => isDir(join(consumerRoot, p))),
    };

    for (const file of files) {
        const text = read(file) || "";
        const lines = text.split("\n");
        for (const [index, line] of lines.entries()) {
            for (const m of line.matchAll(RAW_PALETTE)) result.rawPalette.push({ file: rel(consumerRoot, file), line: index + 1, value: m[0] });
            for (const m of line.matchAll(HEX)) result.hex.push({ file: rel(consumerRoot, file), line: index + 1, value: m[0] });
        }
        for (const m of text.matchAll(IMPORT)) {
            const from = m[5];
            const named = `${m[1] || ""},${m[4] || ""}`
                .split(",")
                .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
                .filter((s) => s && /^[A-Z]/.test(s));
            const pkg = packageOf(from);
            if (forbidden.has(pkg)) {
                result.forbiddenImports.push({ file: rel(consumerRoot, file), package: pkg });
                continue;
            }
            if (!isSystemImport(from, facts.name)) continue;
            result.systemImports += named.length;
            for (const name of named) {
                if (known.has(name)) result.used.add(name);
                else result.invented.push({ file: rel(consumerRoot, file), name, from });
            }
        }
    }

    result.used = [...result.used].sort();
    result.inventedRatio = result.systemImports ? result.invented.length / result.systemImports : 0;
    result.verdict = verdict(result);
    return result;
}

function isSystemImport(from, name) {
    if (!name) return false;
    return from === name || from.startsWith(name + "/");
}

function packageOf(from) {
    if (from.startsWith(".") || from.startsWith("/")) return null;
    const parts = from.split("/");
    return from.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function verdict(r) {
    if (!r.systemImports) return "The agent did not import from the system at all — check the package name and whether it was installed.";
    if (r.invented.length === 0 && !r.forbiddenImports.length && !r.rawPalette.length) return "Clean run: every component came from the system, no forbidden packages, no raw palette.";
    const bits = [];
    if (r.invented.length) bits.push(`${r.invented.length} of ${r.systemImports} imports name components that do not exist`);
    if (r.forbiddenImports.length) bits.push(`${r.forbiddenImports.length} imports from packages the system forbids`);
    if (r.rawPalette.length) bits.push(`${r.rawPalette.length} raw palette classes`);
    if (r.localUiFolder.length) bits.push(`a local ${r.localUiFolder[0]} folder`);
    return `${bits.join(", ")}.`;
}
