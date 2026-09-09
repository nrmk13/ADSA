/**
 * Reads a design system repository and returns facts. Nothing here scores anything:
 * every field is something observed in the repo, so a report can quote its evidence
 * and a maintainer can disagree with the reading rather than the number.
 */
import { basename, join } from "node:path";
import { exists, isDir, read, readJson, rel, walk } from "./fsx.mjs";

const CODE_FENCE = /```(tsx|jsx|ts|js|typescript|javascript)\s*\n([\s\S]*?)```/g;
const PALETTE = "slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RAW_PALETTE = new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow|decoration)-(?:${PALETTE})-\\d{2,3}\\b`, "g");
const RAW_NEUTRAL = /\b(?:bg|text|border)-(?:white|black)\b/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const A11Y_HEADING = /^#{2,4}.*(keyboard|accessib|a11y|screen reader|aria)/im;
const GENERATED = /<!--\s*(?:generated|auto-?generated|do not edit|prop-table:start|props:start)/i;
const PROP_TABLE = /^\|[^\n]*\bprops?\b[^\n]*\|[^\n]*\btype\b[^\n]*\|/im;
const PASCAL_EXPORT = /export\s+(?:default\s+)?(?:const|function|class)\s+([A-Z][A-Za-z0-9_]*)/g;
const TYPE_EXPORT = /export\s+(?:type|interface)\s+([A-Z][A-Za-z0-9_]*)/g;

export function scan(root, config) {
    const pkg = readJson(join(root, "package.json")) || {};
    const facts = {
        root,
        name: pkg.name || basename(root),
        version: pkg.version || null,
        packageJson: Boolean(pkg.name),
        config: { guides: config.guides, source: config.source, file: config.configFile },
    };

    facts.stack = detectStack(root, pkg);
    facts.components = findComponents(root, pkg, config);
    facts.icons = countIconExports(pkg);
    facts.symbols = findSymbols(root, config);
    facts.guides = findGuides(root, config);
    facts.agentFiles = readAgentFiles(root, config, facts.name);
    facts.machine = findMachineSurface(root, pkg, config);
    facts.ci = readCi(root, pkg);
    facts.coverage = matchCoverage(facts.components, facts.guides);
    facts.freshness = checkFreshness(facts.guides, facts.symbols, facts.name, facts.ci);
    facts.tokens = checkTokens(facts.guides, facts.ci);
    facts.patterns = checkPatterns(facts.guides);
    facts.a11y = checkA11y(facts.guides, facts.ci, root);
    facts.verification = checkVerification(root, pkg, facts.ci);
    facts.gaps = checkGaps(root, facts.guides, facts.agentFiles, pkg);
    return facts;
}

/* ---------------------------------------------------------------- stack */

function detectStack(root, pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.peerDependencies || {}) };
    const has = (name) => Boolean(deps[name]);
    const headless = ["react-aria-components", "@radix-ui/react-dialog", "@radix-ui/themes", "@headlessui/react", "@ark-ui/react", "@base-ui-components/react"].filter(has);
    return {
        react: has("react") || has("react-dom"),
        vue: has("vue"),
        svelte: has("svelte"),
        typescript: has("typescript") || exists(join(root, "tsconfig.json")),
        tailwind: has("tailwindcss"),
        storybook: Object.keys(deps).some((d) => d.startsWith("@storybook/")) || isDir(join(root, ".storybook")),
        headless,
        types: exists(join(root, "dist")) && walk(join(root, "dist"), [".d.ts"], 3).length > 0,
    };
}

/* ----------------------------------------------------------- components */

/**
 * What a consumer can import. Package `exports` subpaths are the most reliable
 * answer, and when a package ships them they *are* the surface, so the source scan
 * is only a fallback for repos with a single entry point.
 */
function findComponents(root, pkg, config) {
    const subpaths = Object.keys(pkg.exports || {})
        .filter((k) => k.startsWith("./") && !k.includes("*") && !/\.(css|json|js|mjs|cjs)$/.test(k))
        .map((k) => k.replace(/^\.\//, ""))
        .filter((slug) => !["styles", "theme", "tokens", "eslint", "prose", "package.json"].includes(slug));
    if (subpaths.length >= 5) {
        return subpaths
            .filter((slug) => !isIconSlug(slug))
            .map((slug) => ({ slug, name: pascal(slug), from: "exports" }))
            .sort((a, b) => a.slug.localeCompare(b.slug));
    }
    const out = new Map();
    for (const dir of config.source) {
        for (const file of walk(join(root, dir), [".tsx", ".jsx", ".vue", ".svelte"], 6)) {
            if (isNoiseFile(rel(root, file))) continue;
            const text = read(file) || "";
            for (const m of text.matchAll(PASCAL_EXPORT)) {
                const symbol = m[1];
                if (isNotAComponent(symbol, text) || /Icon$|^Logo/.test(symbol)) continue;
                const slug = kebab(symbol);
                if (!out.has(slug)) out.set(slug, { slug, name: symbol, from: rel(root, file) });
            }
        }
    }
    return [...out.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/** A per-icon guide is not a thing anyone writes, so icon exports are not coverage. */
function isIconSlug(slug) {
    return /(^|[-/])(icons?|logos?|flags?|illustrations?)([-/]|$)/i.test(slug) || /-(icon|logo)s?$/i.test(slug);
}

/** Icon and logo sets are exports, but nobody writes a guide per icon. */
function isNoiseFile(path) {
    if (/\.(test|spec|stories|story)\.|\.d\.ts$/.test(path)) return true;
    return /(^|\/)(icons?|logos?|illustrations?|flags?|payment-?icons?|social-?icons?|brand)(\/|$)/i.test(path);
}

/** Exports set aside as icon or logo sets, reported so the count is not a surprise. */
function countIconExports(pkg) {
    return Object.keys(pkg.exports || {}).filter((k) => k.startsWith("./") && isIconSlug(k.replace(/^\.\//, ""))).length;
}

/** Every exported symbol anywhere in the source: the universe a guide may legitimately import. */
function findSymbols(root, config) {
    const symbols = new Set();
    const dirs = [...config.source, "dist"];
    for (const dir of dirs) {
        for (const file of walk(join(root, dir), [".tsx", ".ts", ".jsx", ".vue", ".svelte"], 7)) {
            const text = read(file) || "";
            for (const m of text.matchAll(PASCAL_EXPORT)) symbols.add(m[1]);
            for (const m of text.matchAll(TYPE_EXPORT)) symbols.add(m[1]);
            for (const m of text.matchAll(/export\s*\{([^}]+)\}/g)) {
                for (const part of m[1].split(",")) {
                    const name = part.trim().split(/\s+as\s+/).pop().trim();
                    if (/^[A-Z]/.test(name)) symbols.add(name);
                }
            }
            for (const m of text.matchAll(/declare\s+const\s+([A-Z][A-Za-z0-9_]*)/g)) symbols.add(m[1]);
        }
    }
    return symbols;
}

/** Hooks, contexts and helpers are exports, but not things a page is built from. */
function isNotAComponent(symbol, text) {
    if (/^(use[A-Z]|with[A-Z])/.test(symbol)) return false; // handled by the next check
    if (/^use[A-Z]/.test(symbol)) return true;
    if (/(Context|Provider|Props|Type|Config|Schema|Utils?|Helpers?)$/.test(symbol) && !new RegExp(`<${symbol}[\\s/>]`).test(text)) return true;
    return false;
}

/* --------------------------------------------------------------- guides */

function findGuides(root, config) {
    const guides = [];
    for (const dir of config.guides) {
        for (const file of walk(join(root, dir), [".md", ".mdx"], 6)) {
            const name = basename(file);
            if (/^(README|CHANGELOG|CONTRIBUTING|LICENSE|CODE_OF_CONDUCT|SECURITY)\./i.test(name)) continue;
            const text = read(file) || "";
            guides.push(guideFacts(root, file, text));
        }
    }
    return guides;
}

function guideFacts(root, file, text) {
    const blocks = [...text.matchAll(CODE_FENCE)].map((m) => m[2]);
    const code = blocks.join("\n");
    return {
        path: rel(root, file),
        slug: basename(file).replace(/\.mdx?$/, "").toLowerCase(),
        title: (text.match(/^#\s+(.+)$/m) || [, ""])[1].trim(),
        lines: text.split("\n").length,
        blocks: blocks.length,
        imports: importedNames(code),
        tags: jsxTags(code),
        hasPropTable: PROP_TABLE.test(text),
        generated: GENERATED.test(text),
        hasA11y: A11Y_HEADING.test(text),
        rawPalette: unique([...(code.match(RAW_PALETTE) || []), ...(code.match(RAW_NEUTRAL) || [])]),
        hex: unique(code.match(HEX) || []),
        body: text,
    };
}

function importedNames(code) {
    const out = [];
    for (const m of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
        const from = m[2];
        for (const part of m[1].split(",")) {
            const name = part.trim().split(/\s+as\s+/)[0].trim();
            if (name && /^[A-Z]/.test(name)) out.push({ name, from });
        }
    }
    return out;
}

function jsxTags(code) {
    return unique([...code.matchAll(/<([A-Z][A-Za-z0-9_]*(?:\.[A-Z][A-Za-z0-9_]*)?)/g)].map((m) => m[1]));
}

/* --------------------------------------------------------- agent instructions */

function readAgentFiles(root, config, packageName) {
    const out = [];
    for (const candidate of config.agentFiles) {
        const path = join(root, candidate);
        const text = read(path);
        if (text === null) continue;
        out.push({
            file: candidate,
            lines: text.split("\n").length,
            mentionsPackage: packageName ? text.includes(packageName) : false,
            hasImportRule: /import\s*\{|from ["'][^"']+["']|import path|subpath/i.test(text),
            hasLookupCommand: /```|npx |yarn |pnpm |run `/.test(text),
            hasTokenRule: /token|bg-primary|text-secondary|semantic/i.test(text),
            hasForbidden: /forbidden|never|do not|don't|avoid/i.test(text),
            hasFinishCheck: /before you (?:finish|call the work done)|before finishing|definition of done|must pass|checklist/i.test(text),
            hasStopAndAsk: /stop and ask|ask (?:the |a )?(?:human|person|maintainer)|do not invent|don't invent|never invent/i.test(text),
        });
    }
    return out;
}

/* ------------------------------------------------------- machine surface */

function findMachineSurface(root, pkg, config) {
    const mcpConfigs = [".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json"].filter((f) => exists(join(root, f)));
    const declaredServers = mcpConfigs.flatMap((f) => {
        const json = readJson(join(root, f)) || {};
        return Object.keys(json.mcpServers || json.servers || {});
    });
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const binNames = Object.keys(pkg.bin && typeof pkg.bin === "object" ? pkg.bin : pkg.bin ? { [pkg.name]: pkg.bin } : {});
    const shippedFiles = pkg.files || [];
    const cliShipped = binNames.length > 0 && shippedFiles.some((f) => /^(cli|bin|dist)/.test(f));
    const mcpInPackage = cliShipped && walk(root, [".mjs", ".ts", ".js"], 2).some((f) => /mcp/i.test(basename(f)));
    const skills = [...walk(join(root, ".claude/skills"), ["SKILL.md"], 3), ...walk(join(root, "skills"), ["SKILL.md"], 3)];
    return {
        mcpConfigs,
        declaredServers: unique(declaredServers),
        storybookMcp: Boolean(deps["@storybook/addon-mcp"]),
        binNames,
        cliShipped,
        mcpInPackage,
        llmsTxt: ["llms.txt", "public/llms.txt", "static/llms.txt", "docs/llms.txt"].filter((f) => exists(join(root, f))),
        skills: skills.map((f) => rel(root, f)),
    };
}

/* ------------------------------------------------------------------- CI */

function readCi(root, pkg) {
    const files = [...walk(join(root, ".github/workflows"), [".yml", ".yaml"], 2)];
    const text = files.map((f) => read(f) || "").join("\n");
    const scripts = pkg.scripts || {};
    const all = text + "\n" + Object.values(scripts).join("\n");
    return {
        workflows: files.map((f) => rel(root, f)),
        scripts,
        runsTests: /\b(vitest|jest|node --test|yarn test|npm test|pnpm test)\b/.test(all),
        runsStoryTests: /(test-storybook|test:storybook|storybook.*test|addon-vitest)/.test(all),
        runsAxe: /(axe|addon-a11y|a11y)/.test(all),
        checksDocs: /(check:(props|guidelines|examples|docs|a11y)|prop-table|generate-prop|guide-examples|check-docs)/.test(all),
        runsAdsa: /adsa\b/.test(all),
        runsLint: /(eslint|biome|lint)/.test(all),
        runsTypecheck: /(tsc|typecheck|type-check)/.test(all),
    };
}

/* --------------------------------------------------------- derived checks */

/**
 * A component counts as documented when a guide actually talks about it: same slug,
 * a singular/plural variant, a guide that owns its prefix (calendar-header -> calendar),
 * or a guide whose body names the symbol. Deliberately generous — a false "missing"
 * in someone else's repo is worse than a slightly kind number.
 */
function matchCoverage(components, guides) {
    const bySlug = new Map(guides.map((g) => [g.slug, g]));
    const documented = [];
    const missing = [];
    for (const c of components) {
        const guide = bySlug.get(c.slug) || bySlug.get(depluralize(c.slug)) || bySlug.get(c.slug + "s") || byPrefix(guides, c.slug) || byMention(guides, c.name);
        if (guide) documented.push({ ...c, guide: guide.path });
        else missing.push(c);
    }
    const total = components.length;
    return { total, documented: documented.length, missing: missing.map((c) => c.name), ratio: total ? documented.length / total : 0 };
}

function depluralize(slug) {
    return slug.replace(/ies$/, "y").replace(/([^s])s$/, "$1");
}

function byPrefix(guides, slug) {
    return guides.find((g) => g.slug.length >= 4 && (slug.startsWith(g.slug + "-") || slug.startsWith(depluralize(g.slug) + "-")));
}

function byMention(guides, name) {
    const re = new RegExp(`(<|\\b)${name}\\b`);
    return guides.find((g) => re.test(g.body));
}

function checkFreshness(guides, symbols, packageName, ci) {
    const unknown = [];
    for (const guide of guides) {
        const fromSystem = guide.imports.filter((i) => (packageName && i.from.startsWith(packageName)) || i.from.startsWith("."));
        for (const imp of fromSystem) {
            if (!symbols.has(imp.name)) unknown.push({ guide: guide.path, name: imp.name, from: imp.from });
        }
    }
    return {
        unknownImports: unknown.slice(0, 40),
        unknownCount: unknown.length,
        guidesWithPropTable: guides.filter((g) => g.hasPropTable).length,
        guidesGenerated: guides.filter((g) => g.generated).length,
        blocks: guides.reduce((n, g) => n + g.blocks, 0),
        compiledInCi: ci.checksDocs,
        symbolsKnown: symbols.size,
    };
}

function checkTokens(guides, ci) {
    const docs = guides.filter((g) => /token|colour|color|typography|spacing|motion|elevation|shadow|radius/i.test(g.slug + " " + g.title));
    const rawHits = guides.flatMap((g) => g.rawPalette.map((c) => ({ guide: g.path, value: c })));
    const hexHits = guides.flatMap((g) => g.hex.map((c) => ({ guide: g.path, value: c })));
    return {
        docs: docs.map((g) => g.path),
        motion: docs.some((g) => /motion|duration|easing|transition/i.test(g.slug + g.title) || /^#{1,4}\s.*(motion|easing|duration)/im.test(g.body)),
        spacing: docs.some((g) => /spacing|space|layout|grid/i.test(g.slug + g.title) || /^#{1,4}\s.*(spacing|space scale)/im.test(g.body)),
        rawPalette: rawHits.slice(0, 30),
        rawPaletteCount: rawHits.length,
        hex: hexHits.slice(0, 20),
        hexCount: hexHits.length,
        lintEnforced: /(eslint|biome).*(token|palette)|no-restricted-syntax/i.test(Object.values(ci.scripts).join(" ")),
    };
}

function checkPatterns(guides) {
    const files = guides.filter((g) => /pattern|template|recipe|layout|page|blueprint|composition/i.test(g.slug + " " + g.title));
    // A pattern is worth 5 only if it carries structure: states, traps, a skeleton.
    const rich = files.filter((g) => /empty|loading|error|state|skeleton|trap/i.test(g.body) && g.lines > 40);
    // A task-to-component map is the cheap version: any guide with such a table.
    const mapFound = guides.some((g) => /^\|[^\n]*\b(pattern|task|use case|when you need|goal)\b[^\n]*\|/im.test(g.body));
    return { files: files.map((g) => g.path), rich: rich.length, mapFound };
}

function checkA11y(guides, ci, root) {
    const withSection = guides.filter((g) => g.hasA11y);
    return {
        total: guides.length,
        withSection: withSection.length,
        ratio: guides.length ? withSection.length / guides.length : 0,
        generated: withSection.some((g) => g.generated),
        automation: ci.runsAxe,
        baseline: ["docs/a11y-baseline.md", "a11y-baseline.md", ".a11y-baseline.json"].filter((f) => exists(join(root, f))),
    };
}

function checkVerification(root, pkg, ci) {
    const scripts = pkg.scripts || {};
    const tests = walk(root, [".test.ts", ".test.tsx", ".test.mjs", ".spec.ts", ".spec.tsx"], 6).length;
    const stories = walk(root, [".stories.ts", ".stories.tsx", ".stories.js"], 6).length;
    return {
        testScript: Boolean(scripts.test),
        typecheckScript: Boolean(scripts.typecheck || scripts["type-check"]),
        lintScript: Boolean(scripts.lint),
        testFiles: tests,
        storyFiles: stories,
        storyTests: ci.runsStoryTests,
        axe: ci.runsAxe,
        workflows: ci.workflows,
        docChecks: ci.checksDocs,
        scoreGate: ci.runsAdsa,
    };
}

function checkGaps(root, guides, agentFiles, pkg) {
    const guideFile = guides.find((g) => /gap|absence|missing|not-built|unsupported|what-we-don/i.test(g.slug + " " + g.title));
    const named = ["GAPS.md", "docs/GAPS.md", "guidelines/GAPS.md", "docs/gaps.md"].filter((f) => exists(join(root, f)));
    const scripts = Object.entries(pkg.scripts || {}).filter(([k]) => /gap/i.test(k));
    return {
        file: named[0] || (guideFile ? guideFile.path : null),
        reportCommand: scripts.length ? scripts[0][0] : null,
        stopAndAsk: agentFiles.some((f) => f.hasStopAndAsk),
    };
}

/* --------------------------------------------------------------- helpers */

export function kebab(s) {
    return s
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[\s_.]+/g, "-")
        .toLowerCase();
}

export function pascal(s) {
    return s
        .split(/[-_/\s]+/)
        .filter(Boolean)
        .map((p) => p[0].toUpperCase() + p.slice(1))
        .join("");
}

function unique(list) {
    return [...new Set(list)];
}
