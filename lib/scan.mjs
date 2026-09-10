/**
 * Reads a design system repository and returns facts. Nothing here scores anything:
 * every field is something observed in the repo, so a report can quote its evidence
 * and a maintainer can disagree with the reading rather than the number.
 */
import { basename, dirname, join } from "node:path";
import { exists, isDir, read, readJson, rel, walk, walkDirs } from "./fsx.mjs";
import { COLOCATED_GUIDE, defaultGuideDirs, loadConfig, workspaceDirs } from "./config.mjs";

const CODE_FENCE = /```(tsx|jsx|ts|js|typescript|javascript|swift|kotlin|kt)\s*\n([\s\S]*?)```/g;
const PALETTE = "slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RAW_PALETTE = new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow|decoration)-(?:${PALETTE})-\\d{2,3}\\b`, "g");
const RAW_NEUTRAL = /\b(?:bg|text|border)-(?:white|black)\b/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const A11Y_HEADING = /^#{2,4}.*(keyboard|accessib|a11y|screen reader|aria|voiceover|talkback|dynamic type|touch target|contentdescription)/im;
const GENERATED = /<!--\s*(?:generated|auto-?generated|do not edit|prop-table:start|props:start)/i;
const PROP_TABLE = /^\|[^\n]*\bprops?\b[^\n]*\|[^\n]*\btype\b[^\n]*\|/im;
/**
 * A documentation site that renders its props from the types puts a component in the
 * page — `<PropTable component="Button" />` — and never writes the table itself. That
 * is the thing this dimension is looking for, and reading only markdown pipes counted
 * the systems doing it properly as having no prop tables and hand-maintaining them.
 */
const PROP_COMPONENT = /<(Props?Table|PropsTable|PropTable|ComponentProps|ArgTypes|ApiTable|TypeTable|AutoTypeTable|PropertyTable|ApiReference|PropDefs)\b/;
const PASCAL_EXPORT = /export\s+(?:default\s+)?(?:const|function|class)\s+([A-Z][A-Za-z0-9_]*)/g;
const TYPE_EXPORT = /export\s+(?:type|interface)\s+([A-Z][A-Za-z0-9_]*)/g;
/** `struct Foo: View`, `public class Foo: UIView` — captures the whole conformance list so a multi-protocol clause still matches. */
const SWIFT_TYPE = /\b(?:@[\w:()]+\s+)*(?:public\s+|open\s+|internal\s+)?(?:final\s+)?(struct|class)\s+([A-Z][A-Za-z0-9_]*)\s*(?:<[^>{]*>)?\s*:\s*([^{]+?)\{/g;
const SWIFT_SYMBOL = /\b(?:public\s+|open\s+)?(?:static\s+)?(?:struct|class|enum|func)\s+([A-Za-z][A-Za-z0-9_]*)/g;
/** `@Composable` followed, within a short window (annotations, modifiers, newlines), by `fun Name(`. */
/**
 * Subpaths every second package exports and nobody imports as a component. Without
 * this, a CLI that ships `./registry`, `./schema`, `./mcp` and `./utils` reads as a
 * five-component design system and wins the workspace over the component library.
 */
const NOT_A_COMPONENT_SUBPATH = new Set([
    "styles", "theme", "themes", "tokens", "eslint", "prose", "package.json", "registry", "schema", "mcp", "cli",
    "utils", "utilities", "helpers", "hooks", "preset", "presets", "config", "plugin", "plugins", "types", "server",
    "test", "testing", "next", "vite", "webpack", "babel", "codemod", "migrate", "internal", "unstable", "experimental",
]);

const NAMESPACE_EXPORT = /export\s+\*\s+as\s+([A-Z][A-Za-z0-9_]*)\s+from/g;
const COMPOSABLE = /@Composable[\s\S]{0,120}?\bfun\s+([A-Z][A-Za-z0-9_]*)\s*\(/g;
const KOTLIN_SYMBOL = /\b(?:public\s+|internal\s+)?(?:class|object|interface|enum class)\s+([A-Z][A-Za-z0-9_]*)/g;

export function scan(root, config, repoRoot = root) {
    const pkg = readJson(join(root, "package.json")) || {};
    const repoPkg = repoRoot === root ? pkg : readJson(join(repoRoot, "package.json")) || {};
    const platform = detectPlatform(root, pkg);
    const facts = {
        root,
        repoRoot,
        // What a package inherits from the repository around it: agent instructions,
        // CI, the agent surface. Null when the package is the repository.
        monorepo: repoRoot === root ? null : { root: repoRoot, package: rel(repoRoot, root) },
        name: detectName(root, pkg),
        version: pkg.version || null,
        packageJson: Boolean(pkg.name),
        platform,
        config: { guides: config.guides, source: config.source, file: config.configFile },
    };

    facts.stack = detectStack(root, pkg, platform);
    facts.components = findComponents(root, pkg, config, platform.primary);
    facts.icons = countIconExports(pkg);
    facts.symbols = findSymbols(root, config, platform.primary);
    let guideDirs = resolveGuideDirs(root, config, repoRoot);
    facts.guides = findGuides(root, config, guideDirs);
    const site = config.guidesExplicit ? null : findDocsSite(repoRoot, facts.components, facts.guides);
    if (site) {
        guideDirs = [...guideDirs, site];
        facts.guides = findGuides(root, config, guideDirs);
    }
    facts.agentFiles = readAgentFiles(root, repoRoot, config, facts.name);
    facts.machine = findMachineSurface(root, repoRoot, pkg, config);
    facts.ci = readCi(repoRoot, pkg, repoPkg, platform.primary);
    facts.coverage = matchCoverage(facts.components, facts.guides);
    facts.freshness = checkFreshness(facts.guides, facts.symbols, facts.name, facts.ci);
    facts.tokens = checkTokens(facts.guides, facts.ci, root, platform.primary);
    facts.patterns = checkPatterns(facts.guides);
    facts.a11y = checkA11y(facts.guides, facts.ci, root, platform.primary);
    facts.verification = checkVerification(root, pkg, repoPkg, facts.ci, platform.primary);
    facts.gaps = checkGaps(root, repoRoot, facts.guides, facts.agentFiles, pkg, repoPkg);
    facts.scanned = describeScan(facts, config, guideDirs);
    return facts;
}

/**
 * Which directories this run actually read. Printed by `audit`, because "not found"
 * and "not looked for" are the same sentence otherwise — the exact confusion this
 * tool exists to stop an agent from making.
 */
/**
 * The directory where this repository documents its components, found by asking which
 * directory's markdown is *named after the components* — `accordion.mdx`, or
 * `accordion/page.mdx`.
 *
 * No list of directory names finds these. A monorepo keeps its guides in whatever its
 * documentation site happens to be called — `apps/www/content/docs`, `apps/v4/content`,
 * `docs/src/app`, `apps/mantine.dev/src/pages` — and every system whose docs the list
 * missed was reported as a system with no documentation at all. Matching against the
 * component names is what makes the answer checkable: a folder of blog posts scores
 * zero, and a folder of component guides cannot.
 *
 * Returns a directory only when it beats what has already been found.
 */
function findDocsSite(repoRoot, components, found) {
    const slugs = new Set(components.map((c) => c.slug));
    if (slugs.size < 3) return null;
    const matched = (files) => new Set(files.filter((f) => slugs.has(guideSlug(f))).map((f) => guideSlug(f))).size;
    const already = new Set(found.filter((g) => slugs.has(g.slug)).map((g) => g.slug)).size;

    const byDir = new Map();
    for (const file of walk(repoRoot, [".md", ".mdx"], 9)) {
        if (/^(README|CHANGELOG|CONTRIBUTING|LICENSE|CODE_OF_CONDUCT|SECURITY)\./i.test(basename(file))) continue;
        // A folder-routed site gives every guide a folder of its own, so the section
        // that holds them all is one level further up: `components/button/page.mdx`
        // groups with `components/card/page.mdx`, not alone.
        const dir = ROUTE_FILE.test(basename(file)) ? dirname(dirname(file)) : dirname(file);
        if (!byDir.has(dir)) byDir.set(dir, []);
        byDir.get(dir).push(file);
    }

    let best = null;
    for (const [dir, files] of byDir) {
        const score = matched(files);
        if (score >= 3 && score > already && (!best || score > best.score)) best = { dir, score };
    }
    return best ? docsRoot(best.dir) : null;
}

/**
 * The documentation tree a component folder belongs to, so patterns and token pages
 * beside the component pages are read too. Climbing stops at the first folder a
 * documentation site is ever called, and after three levels, so a site nested in a
 * repository never widens into the repository.
 */
const ROUTE_FILE = /^(page|index|content|_index|readme)\.mdx?$/i;

const DOCS_ROOT_NAMES = new Set(["docs", "doc", "content", "pages", "guides", "documentation"]);

function docsRoot(dir) {
    let at = dir;
    for (let i = 0; i < 3; i++) {
        if (DOCS_ROOT_NAMES.has(basename(at).toLowerCase())) return at;
        const parent = dirname(at);
        if (parent === at) break;
        at = parent;
    }
    return dir;
}

function describeScan(facts, config, guideDirs) {
    return {
        package: facts.monorepo ? facts.monorepo.package : ".",
        repo: facts.repoRoot,
        guides: guideDirs.map((d) => rel(facts.root, d) || "."),
        source: [...config.source],
        colocatedGuides: facts.guides.filter((g) => g.colocated).length,
    };
}

/* ------------------------------------------------------------- platform */

/**
 * What platform this design system is built for, from real evidence: a package.json
 * dependency, a Package.swift, an .xcodeproj bundle, a Gradle build next to Kotlin
 * files. A repo can carry more than one signal — a monorepo with an app and a native
 * shell — so every platform with real evidence is kept in `detected`, strongest
 * first, and the strongest becomes `primary`. Nothing here is invented: a platform
 * is reported only when a file that actually exists says so.
 */
function detectPlatform(root, pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.peerDependencies || {}) };
    const has = (name) => Boolean(deps[name]);
    const candidates = [];

    if (has("react-native") || has("expo")) {
        const files = walk(root, [".tsx", ".jsx"], 6).length;
        const ev = [];
        if (has("react-native")) ev.push("react-native in package.json dependencies");
        if (has("expo")) ev.push("expo in package.json dependencies");
        if (files) ev.push(`${files} .tsx/.jsx files`);
        candidates.push({ id: "react-native", score: 100 + files, evidence: ev });
    } else if (has("react") || has("react-dom") || has("vue") || has("svelte")) {
        const files = walk(root, [".tsx", ".jsx", ".vue", ".svelte"], 6).length;
        const ev = [];
        if (has("react") || has("react-dom")) ev.push("react in package.json dependencies");
        if (has("vue")) ev.push("vue in package.json dependencies");
        if (has("svelte")) ev.push("svelte in package.json dependencies");
        if (files) ev.push(`${files} component files`);
        candidates.push({ id: "web", score: 90 + files, evidence: ev });
    }

    const swiftFiles = walk(root, [".swift"], 8);
    const hasPackageSwift = exists(join(root, "Package.swift"));
    const xcodeProjects = walkDirs(root, [".xcodeproj", ".xcworkspace"], 4);
    if (hasPackageSwift || xcodeProjects.length || swiftFiles.length >= 3) {
        const ev = [];
        if (hasPackageSwift) ev.push("Package.swift present");
        if (xcodeProjects.length) ev.push(`${xcodeProjects.length} .xcodeproj/.xcworkspace bundle(s)`);
        if (swiftFiles.length) ev.push(`${swiftFiles.length} .swift files`);
        candidates.push({ id: "swift", score: (hasPackageSwift ? 50 : 0) + (xcodeProjects.length ? 50 : 0) + swiftFiles.length, evidence: ev });
    }

    const ktFiles = walk(root, [".kt"], 8);
    const gradleFiles = walk(root, [".gradle", ".gradle.kts"], 5);
    if ((gradleFiles.length && ktFiles.length) || ktFiles.length >= 3) {
        const ev = [];
        if (gradleFiles.length) ev.push(`${gradleFiles.length} Gradle build file(s)`);
        if (ktFiles.length) ev.push(`${ktFiles.length} .kt files`);
        candidates.push({ id: "android", score: (gradleFiles.length ? 50 : 0) + ktFiles.length, evidence: ev });
    }

    candidates.sort((a, b) => b.score - a.score);
    const primary = candidates.length ? candidates[0].id : "web";
    return {
        primary,
        detected: candidates.map(({ id, evidence }) => ({ id, evidence })),
        evidence: candidates.length ? candidates[0].evidence : ["No platform-specific evidence found; defaulting to web."],
    };
}

/** package.json first, then the platform's own manifest, then the directory name. */
function detectName(root, pkg) {
    if (pkg.name) return pkg.name;
    const packageSwift = read(join(root, "Package.swift"));
    const swiftName = packageSwift && packageSwift.match(/name:\s*"([^"]+)"/);
    if (swiftName) return swiftName[1];
    const settings = read(join(root, "settings.gradle.kts")) || read(join(root, "settings.gradle"));
    const gradleName = settings && settings.match(/rootProject\.name\s*=\s*["']([^"']+)["']/);
    if (gradleName) return gradleName[1];
    return basename(root);
}

/* ---------------------------------------------------------------- stack */

function detectStack(root, pkg, platform) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.peerDependencies || {}) };
    const has = (name) => Boolean(deps[name]);
    const headless = ["react-aria-components", "@radix-ui/react-dialog", "@radix-ui/themes", "@headlessui/react", "@ark-ui/react", "@base-ui-components/react"].filter(has);
    return {
        react: has("react") || has("react-dom"),
        reactNative: has("react-native") || has("expo"),
        expo: has("expo"),
        nativewind: has("nativewind"),
        vue: has("vue"),
        svelte: has("svelte"),
        typescript: has("typescript") || exists(join(root, "tsconfig.json")),
        tailwind: has("tailwindcss"),
        storybook: Object.keys(deps).some((d) => d.startsWith("@storybook/")) || isDir(join(root, ".storybook")),
        headless,
        types: exists(join(root, "dist")) && walk(join(root, "dist"), [".d.ts"], 3).length > 0,
        swiftPackage: platform?.primary === "swift" && exists(join(root, "Package.swift")),
        gradleKts: platform?.primary === "android" && walk(root, [".gradle.kts"], 3).length > 0,
    };
}

/* ----------------------------------------------------------- components */

/**
 * How many importable components a directory would report if it were audited. This
 * is how the right package is picked out of a monorepo, so it runs on packages that
 * will never be audited — cheap enough to run on all of them, and exactly the same
 * rule as the audit, so the count the reader is shown is the count that was ranked.
 */
export function countComponents(dir) {
    const pkg = readJson(join(dir, "package.json")) || {};
    return findComponents(dir, pkg, loadConfig(dir), detectPlatform(dir, pkg).primary).length;
}

/**
 * What a consumer can import. Package `exports` subpaths are the most reliable
 * answer, and when a package ships them they *are* the surface, so the source scan
 * is only a fallback for repos with a single entry point. Native platforms have no
 * `package.json`, so they go straight to their own declaration syntax.
 */
function findComponents(root, pkg, config, platform) {
    if (platform === "swift") return findSwiftComponents(root, config);
    if (platform === "android") return findKotlinComponents(root, config);

    const registry = readRegistry(root);
    if (registry) return registry;

    const subpaths = Object.keys(pkg.exports || {})
        .filter((k) => k.startsWith("./") && !k.includes("*") && !/\.(css|json|js|mjs|cjs)$/.test(k))
        .map((k) => k.replace(/^\.\//, ""))
        .filter((slug) => !NOT_A_COMPONENT_SUBPATH.has(slug));
    if (subpaths.length >= 5) {
        return subpaths
            .filter((slug) => !isIconSlug(slug))
            .map((slug) => ({ slug, name: pascal(slug), from: "exports" }))
            .sort((a, b) => a.slug.localeCompare(b.slug));
    }
    const out = new Map();
    for (const dir of config.source) {
        // `export * as Dialog from "@acme/react-dialog"`: the aggregate package a
        // monorepo publishes, whose own source is one line per component. Reading only
        // JSX files reports the package a consumer actually installs as empty.
        for (const file of walk(join(root, dir), [".ts"], 3)) {
            for (const m of (read(file) || "").matchAll(NAMESPACE_EXPORT)) {
                const slug = kebab(m[1]);
                if (!out.has(slug)) out.set(slug, { slug, name: m[1], from: rel(root, file) });
            }
        }
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

/**
 * A registry ships components as source rather than as an import, and `registry.json`
 * declares which of its items are components: a block, an example and a chart are all
 * in there too, and counting them makes a system of forty components look like one of
 * four hundred, none of them documented.
 */
function readRegistry(root) {
    const file = readJson(join(root, "registry.json"));
    const items = Array.isArray(file?.items) ? file.items.filter((i) => i.type === "registry:ui" && i.name) : [];
    if (items.length < 5) return null;
    return [...new Map(items.map((i) => [kebab(i.name), { slug: kebab(i.name), name: pascal(i.name), from: "registry.json" }])).values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/** `public struct Foo: View` / `open class Foo: UIView` / `struct Foo: UIViewController`. */
function findSwiftComponents(root, config) {
    const out = new Map();
    for (const dir of config.source.length ? config.source : ["."]) {
        for (const file of walk(join(root, dir), [".swift"], 8)) {
            if (isNoiseSwiftFile(rel(root, file))) continue;
            const text = read(file) || "";
            for (const m of text.matchAll(SWIFT_TYPE)) {
                const [, , name, conforms] = m;
                if (!/\b(View|UIView|UIViewController)\b/.test(conforms)) continue;
                const slug = kebab(name);
                if (!out.has(slug)) out.set(slug, { slug, name, from: rel(root, file) });
            }
        }
    }
    return [...out.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function isNoiseSwiftFile(path) {
    return /(Tests?|Mock|Preview)\.swift$/.test(path) || /\/(Tests?|Preview Content)\//i.test(path);
}

/** `@Composable fun Foo(...)`. */
function findKotlinComponents(root, config) {
    const out = new Map();
    for (const dir of config.source.length ? config.source : ["."]) {
        for (const file of walk(join(root, dir), [".kt"], 8)) {
            if (isNoiseKotlinFile(rel(root, file))) continue;
            const text = read(file) || "";
            for (const m of text.matchAll(COMPOSABLE)) {
                const name = m[1];
                const slug = kebab(name);
                if (!out.has(slug)) out.set(slug, { slug, name, from: rel(root, file) });
            }
        }
    }
    return [...out.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function isNoiseKotlinFile(path) {
    return /Test\.kt$/.test(path) || /\/(test|androidTest)\//i.test(path);
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
function findSymbols(root, config, platform) {
    if (platform === "swift") return findSwiftSymbols(root, config);
    if (platform === "android") return findKotlinSymbols(root, config);

    const symbols = new Set();
    // Wider than the component scan on purpose: `config.source` is where components
    // live, and a provider, a hook or a type exported from `src/styled-system` is
    // still a symbol a guide may legitimately import. Reading only the component
    // folder reported real exports as imports that do not exist.
    const dirs = [...new Set([...config.source, "src", "lib", "dist"])];
    for (const dir of dirs) {
        for (const file of walk(join(root, dir), [".tsx", ".ts", ".jsx", ".vue", ".svelte"], 7)) {
            const text = read(file) || "";
            for (const m of text.matchAll(PASCAL_EXPORT)) symbols.add(m[1]);
            for (const m of text.matchAll(TYPE_EXPORT)) symbols.add(m[1]);
            // `export * as Accordion from "./accordion"` is how a namespace API is
            // published, and a guide importing `Accordion` was being reported as
            // importing something that does not exist.
            for (const m of text.matchAll(NAMESPACE_EXPORT)) symbols.add(m[1]);
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

function findSwiftSymbols(root, config) {
    const symbols = new Set();
    for (const dir of config.source.length ? config.source : ["."]) {
        for (const file of walk(join(root, dir), [".swift"], 8)) {
            const text = read(file) || "";
            for (const m of text.matchAll(SWIFT_SYMBOL)) symbols.add(m[1]);
        }
    }
    return symbols;
}

function findKotlinSymbols(root, config) {
    const symbols = new Set();
    for (const dir of config.source.length ? config.source : ["."]) {
        for (const file of walk(join(root, dir), [".kt"], 8)) {
            const text = read(file) || "";
            for (const m of text.matchAll(COMPOSABLE)) symbols.add(m[1]);
            for (const m of text.matchAll(KOTLIN_SYMBOL)) symbols.add(m[1]);
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

/**
 * Pages a documentation site keeps beside its guides that are not guides: a blog, a
 * changelog, release notes, a migration write-up. They quote APIs that were removed
 * on purpose, and counting them made a well-documented system look stale — a hundred
 * "imports that do not exist", every one of them a symbol a release note is explaining
 * the removal of.
 */
const NOT_A_GUIDE = /(^|\/)(blog|posts?|changelogs?|releases?|release-notes|news|migrations?|migrating[^/]*|upgrade(-guide)?|archive)(\/|\.mdx?$|$)/i;

/** Every markdown guide in `guideDirs`, plus the ones colocated with the source. */
function findGuides(root, config, guideDirs) {
    const guides = [];
    const seen = new Set();
    for (const dir of guideDirs) {
        for (const file of walk(dir, [".md", ".mdx"], 6)) {
            const name = basename(file);
            if (/^(README|CHANGELOG|CONTRIBUTING|LICENSE|CODE_OF_CONDUCT|SECURITY)\./i.test(name)) continue;
            if (NOT_A_GUIDE.test(file)) continue;
            if (seen.has(file)) continue;
            seen.add(file);
            guides.push(guideFacts(root, file, read(file) || "", false));
        }
    }
    for (const file of colocatedGuides(root, config)) {
        if (seen.has(file)) continue;
        seen.add(file);
        guides.push(guideFacts(root, file, read(file) || "", true));
    }
    return guides;
}

/**
 * Absolute directories to read guides from.
 *
 * `config.guides` first; then any DocC bundle (`*.docc`) found anywhere in the
 * package, because that is where a Swift package's guides live and it is not a
 * directory a maintainer would think to list; then — unless the config named the
 * directories by hand — the repository's own, because a monorepo commonly documents
 * every package centrally in one `docs/` at the root.
 */
export function resolveGuideDirs(root, config, repoRoot = root) {
    const dirs = new Set(config.guides.map((d) => join(root, d)));
    for (const doccDir of walkDirs(root, [".docc"], 6)) dirs.add(doccDir);
    if (repoRoot !== root && !config.guidesExplicit) {
        for (const d of defaultGuideDirs(repoRoot)) dirs.add(join(repoRoot, d));
    }
    // A skill's references are documentation — written for an agent, which is the
    // reader this whole audit is about. A system that ships its catalog, its patterns
    // and its motion rules as a skill has documented itself, and reading only `docs/`
    // reported the most agent-native shape there is as having no documentation at all.
    for (const base of unique([root, repoRoot])) {
        for (const d of SKILL_DIRS) if (isDir(join(base, d))) dirs.add(join(base, d));
    }
    return [...dirs];
}

const SKILL_DIRS = [".claude/skills", ".cursor/skills", "skills"];

/**
 * A guide can live next to the component it documents — `Button/Button.spec.md` —
 * rather than in a documentation folder. That is a deliberate layout, not an absent
 * one, and a scanner that only reads `docs/` reports a fully documented system as
 * having no guides at all.
 */
function colocatedGuides(root, config) {
    const out = [];
    for (const dir of config.source) {
        for (const file of walk(join(root, dir), [".md", ".mdx"], 6)) {
            if (!COLOCATED_GUIDE.test(basename(file))) continue;
            if (/^(README|CHANGELOG)\./i.test(basename(file))) continue;
            out.push(file);
        }
    }
    return out;
}

/**
 * The component a guide is about. `Button.spec.md`, `ButtonGroup.md` and
 * `button-group.md` all name a component the same way once the documentation
 * suffix is dropped and the casing is normalised.
 */
function guideSlug(file) {
    const stem = basename(file).replace(/\.mdx?$/, "").replace(/\.(spec|docs?|guide)$/i, "");
    // A docs site routes by folder: `components/accordion/page.mdx` is the accordion
    // guide, and every one of them would otherwise be a guide called "page".
    if (/^(page|index|content|_index|readme)$/i.test(stem)) return kebab(basename(dirname(file)));
    return kebab(stem);
}

function guideFacts(root, file, text, colocated = false) {
    const blocks = [...text.matchAll(CODE_FENCE)].map((m) => m[2]);
    const code = blocks.join("\n");
    return {
        path: rel(root, file),
        colocated,
        slug: guideSlug(file),
        title: (text.match(/^#\s+(.+)$/m) || [, ""])[1].trim(),
        lines: text.split("\n").length,
        blocks: blocks.length,
        imports: importedNames(code),
        tags: jsxTags(code),
        hasPropTable: PROP_TABLE.test(text) || PROP_COMPONENT.test(text),
        generated: GENERATED.test(text) || PROP_COMPONENT.test(text),
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

/**
 * Agent instructions, read from the package and from the repository that declares it.
 * A monorepo writes AGENTS.md once, at the root, and it governs every package under
 * it — reading only the package directory reports a documented repo as undocumented.
 */
function readAgentFiles(root, repoRoot, config, packageName) {
    const out = [];
    const seen = new Set();
    for (const base of [root, repoRoot]) {
        for (const candidate of config.agentFiles) {
            const path = join(base, candidate);
            const text = read(path);
            if (text === null || seen.has(path)) continue;
            seen.add(path);
            const fromRepoRoot = base !== root;
            out.push({
                file: candidate,
                scope: fromRepoRoot ? "repo" : "package",
                label: fromRepoRoot ? `${candidate} at the repository root` : candidate,
                lines: text.split("\n").length,
                mentionsPackage: packageName ? text.includes(packageName) : false,
                hasImportRule: /import\s*\{|from ["'][^"']+["']|import path|subpath|^import\s+\w/im.test(text),
                hasLookupCommand: /```|npx |yarn |pnpm |run `|swift |gradlew/i.test(text),
                hasTokenRule: /token|bg-primary|text-secondary|semantic|colorset|colors\.xml|theme/i.test(text),
                hasForbidden: /forbidden|never|do not|don't|avoid/i.test(text),
                hasFinishCheck: /before you (?:finish|call the work done)|before finishing|definition of done|must pass|checklist/i.test(text),
                hasStopAndAsk: /stop and ask|ask (?:the |a )?(?:human|person|maintainer)|do not invent|don't invent|never invent/i.test(text),
            });
        }
    }
    return out;
}

/* ------------------------------------------------------- machine surface */

/** Packages that make up the repository: its own manifest, plus every workspace it declares. */
function repoPackages(repoRoot) {
    const out = [];
    for (const dir of [repoRoot, ...workspaceDirs(repoRoot)]) {
        const pkg = readJson(join(dir, "package.json"));
        if (pkg) out.push({ dir, pkg });
    }
    return out;
}

/** Libraries a repository uses to *serve* MCP, rather than to consume one. */
const MCP_SERVER_DEPS = ["mcp-handler", "@modelcontextprotocol/sdk", "@vercel/mcp-adapter", "fastmcp", "mcp-lite"];
const MCP_CONFIG_FILES = [".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json", ".windsurf/mcp.json"];
const LLMS_TXT_FILES = ["llms.txt", "public/llms.txt", "static/llms.txt", "docs/llms.txt", "app/llms.txt"];
const ROUTE_FILES = ["route.ts", "route.tsx", "route.js", "route.mjs", "route.jsx"];
const MCP_SERVER_FILES = ["mcp-server.ts", "mcp-server.mjs", "mcp-server.js", "mcp.server.ts"];

/**
 * What an agent can query instead of reading files. Two things were invisible here
 * before: a surface the repository *serves* rather than commits — an MCP endpoint or
 * an llms.txt behind a route handler — and a surface that lives in a sibling
 * workspace, which is where a monorepo always puts its CLI.
 */
function findMachineSurface(root, repoRoot, pkg, config) {
    const bases = unique([root, repoRoot]);
    const mcpConfigs = [];
    const declaredServers = [];
    for (const base of bases) {
        for (const candidate of MCP_CONFIG_FILES) {
            const path = join(base, candidate);
            if (!exists(path)) continue;
            mcpConfigs.push(rel(repoRoot, path));
            const json = readJson(path) || {};
            declaredServers.push(...Object.keys(json.mcpServers || json.servers || {}));
        }
    }

    const packages = repoPackages(repoRoot);
    const repoDeps = Object.assign({}, ...packages.map((p) => ({ ...(p.pkg.dependencies || {}), ...(p.pkg.devDependencies || {}) })));
    const binNames = Object.keys(pkg.bin && typeof pkg.bin === "object" ? pkg.bin : pkg.bin ? { [pkg.name]: pkg.bin } : {});
    const shippedFiles = pkg.files || [];
    const cliShipped = binNames.length > 0 && shippedFiles.some((f) => /^(cli|bin|dist)/.test(f));
    const mcpInPackage = cliShipped && walk(root, [".mjs", ".ts", ".js"], 2).some((f) => /mcp/i.test(basename(f)));
    // One walk of the repository, split afterwards: a route that answers on /mcp,
    // a route that renders llms.txt, and a server file named outright.
    const found = walk(repoRoot, [...ROUTE_FILES, ...MCP_SERVER_FILES], 10).map((f) => rel(repoRoot, f));
    const routes = found.filter((f) => ROUTE_FILES.some((r) => f.endsWith(r)));
    const servers = found.filter((f) => MCP_SERVER_FILES.some((r) => f.endsWith(r)));

    return {
        mcpConfigs,
        declaredServers: unique(declaredServers),
        servedMcp: findServedMcp(repoRoot, packages, routes, servers),
        storybookMcp: Boolean(repoDeps["@storybook/addon-mcp"]),
        binNames,
        cliShipped,
        mcpInPackage,
        siblingClis: findSiblingClis(root, packages),
        llmsTxt: findLlmsTxt(bases, repoRoot, routes),
        skills: findSkills(bases, repoRoot),
        commands: findCommands(bases, repoRoot),
    };
}

/**
 * An MCP server this repository hosts: the library that implements one, or the route
 * that answers on it. A system that serves MCP from its docs site never writes the
 * `.mcp.json` that consumes it — that file belongs to the projects using the system.
 */
function findServedMcp(repoRoot, packages, routes, servers) {
    const evidence = [];
    for (const { dir, pkg } of packages) {
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        const found = MCP_SERVER_DEPS.filter((d) => deps[d]);
        if (found.length) evidence.push(`${found.join(", ")} in ${rel(repoRoot, join(dir, "package.json")) || "package.json"}`);
    }
    for (const route of routes) {
        if (/(^|\/)mcp(\/|$)/i.test(dirname(route))) evidence.push(route);
    }
    evidence.push(...servers);
    return unique(evidence);
}

/** A docs CLI shipped from a sibling workspace — where a monorepo keeps it. */
function findSiblingClis(root, packages) {
    return packages
        .filter((p) => p.dir !== root && p.pkg.bin && !p.pkg.private)
        .map((p) => ({ name: p.pkg.name, bin: Object.keys(typeof p.pkg.bin === "object" ? p.pkg.bin : { [p.pkg.name]: p.pkg.bin }) }))
        .filter((c) => c.name);
}

/** A committed llms.txt, or one a route handler generates from the live docs. */
function findLlmsTxt(bases, repoRoot, routes) {
    const out = [];
    for (const base of bases) {
        for (const candidate of LLMS_TXT_FILES) {
            if (exists(join(base, candidate))) out.push(rel(repoRoot, join(base, candidate)));
        }
    }
    for (const route of routes) {
        if (/llms[.-]txt/i.test(route)) out.push(route);
    }
    return unique(out);
}

/**
 * Published agent skills. A skill is a markdown file in a skills directory — the
 * `SKILL.md` convention is one shape of that, not the only one, and requiring the
 * filename reported a repo full of skills as having none.
 */
function findSkills(bases, repoRoot) {
    const out = [];
    for (const base of bases) {
        for (const dir of [".claude/skills", "skills", ".cursor/skills"]) {
            for (const file of walk(join(base, dir), [".md"], 3)) {
                if (/^(README|CHANGELOG)\./i.test(basename(file))) continue;
                out.push(rel(repoRoot, file));
            }
        }
    }
    return unique(out);
}

/** Slash commands are instructions an agent can run by name, same as a skill. */
function findCommands(bases, repoRoot) {
    const out = [];
    for (const base of bases) {
        for (const file of walk(join(base, ".claude/commands"), [".md"], 2)) {
            if (/^(README|CHANGELOG)\./i.test(basename(file))) continue;
            out.push(rel(repoRoot, file));
        }
    }
    return unique(out);
}

/* ------------------------------------------------------------------- CI */

/**
 * CI belongs to the repository, not to a package inside it: a monorepo keeps one
 * `.github/workflows` at the root and runs every package from there. `repoPkg` is
 * the root manifest, whose scripts are what those workflows actually call.
 */
function readCi(repoRoot, pkg, repoPkg, platform) {
    const files = [...walk(join(repoRoot, ".github/workflows"), [".yml", ".yaml"], 2)];
    const text = files.map((f) => read(f) || "").join("\n");
    const scripts = { ...(repoPkg.scripts || {}), ...(pkg.scripts || {}) };
    const all = text + "\n" + Object.values(scripts).join("\n");
    return {
        workflows: files.map((f) => rel(repoRoot, f)),
        scripts,
        runsTests: /\b(vitest|jest|node --test|yarn test|npm test|pnpm test|xcodebuild|swift test|gradlew|gradle test|fastlane)\b/.test(all),
        runsStoryTests: /(test-storybook|test:storybook|storybook.*test|addon-vitest)/.test(all),
        runsAxe: /(axe|addon-a11y|a11y|accessibility.?scanner|accessibility.?snapshot)/i.test(all),
        checksDocs: /(check:(props|guidelines|examples|docs|a11y)|prop-table|generate-prop|guide-examples|check-docs)/.test(all),
        runsAdsa: /adsa\b/.test(all),
        runsLint: /(eslint|biome|lint|swiftlint|ktlint|detekt)/i.test(all),
        runsTypecheck: /(tsc|typecheck|type-check)/.test(all),
        platform,
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
        // A relative import in a documentation page is the reader's own file —
        // `./components/UserForm` in an example is not a claim about this package.
        // Beside a component, in a colocated guide, `./Button` is exactly that claim.
        const fromSystem = guide.imports.filter((i) => (packageName && i.from.startsWith(packageName)) || (guide.colocated && i.from.startsWith(".")));
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

function checkTokens(guides, ci, root, platform) {
    const docs = guides.filter((g) => /token|colour|color|typography|spacing|motion|elevation|shadow|radius|theme|palette/i.test(g.slug + " " + g.title));
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
        source: findSourceTokens(root, platform),
    };
}

/**
 * Named tokens defined in the platform's own resource format, rather than prose:
 * a Swift asset catalog's colorsets, or the named `<color>` entries in an Android
 * `colors.xml`/`themes.xml`. Real files, real counts — an agent can open either and
 * see the same semantic names a guide would otherwise have to spell out.
 */
function findSourceTokens(root, platform) {
    if (platform === "swift") {
        const catalogs = walkDirs(root, [".xcassets"], 6);
        const colorSets = catalogs.flatMap((c) => walkDirs(c, [".colorset"], 3));
        if (!catalogs.length) return null;
        return {
            kind: "asset catalog",
            files: catalogs.map((c) => rel(root, c)),
            count: colorSets.length,
            names: colorSets.slice(0, 6).map((c) => basename(c).replace(/\.colorset$/, "")),
        };
    }
    if (platform === "android") {
        const files = walk(root, ["colors.xml", "themes.xml"], 8);
        if (!files.length) return null;
        const names = [];
        let count = 0;
        for (const f of files) {
            for (const m of (read(f) || "").matchAll(/<color\s+name="([^"]+)"/g)) {
                count++;
                if (names.length < 6) names.push(m[1]);
            }
        }
        return { kind: "XML resources", files: files.map((f) => rel(root, f)), count, names };
    }
    return null;
}

function checkPatterns(guides) {
    const files = guides.filter((g) => /pattern|template|recipe|layout|page|blueprint|composition/i.test(g.slug + " " + g.title));
    // A pattern is worth 5 only if it carries structure: states, traps, a skeleton.
    const rich = files.filter((g) => /empty|loading|error|state|skeleton|trap/i.test(g.body) && g.lines > 40);
    // A task-to-component map is the cheap version: any guide with such a table.
    const mapFound = guides.some((g) => /^\|[^\n]*\b(pattern|task|use case|when you need|goal)\b[^\n]*\|/im.test(g.body));
    return { files: files.map((g) => g.path), rich: rich.length, mapFound };
}

function checkA11y(guides, ci, root, platform) {
    const withSection = guides.filter((g) => g.hasA11y);
    return {
        total: guides.length,
        withSection: withSection.length,
        ratio: guides.length ? withSection.length / guides.length : 0,
        generated: withSection.some((g) => g.generated),
        automation: ci.runsAxe,
        baseline: ["docs/a11y-baseline.md", "a11y-baseline.md", ".a11y-baseline.json"].filter((f) => exists(join(root, f))),
        platform,
    };
}

function checkVerification(root, pkg, repoPkg, ci, platform) {
    // A workspace package often leaves `test` and `lint` to the repository root that
    // runs them; both sets are the same promise to a reader.
    const scripts = { ...(repoPkg.scripts || {}), ...(pkg.scripts || {}) };
    const tests = walk(root, [".test.ts", ".test.tsx", ".test.mjs", ".spec.ts", ".spec.tsx", "Tests.swift", "Test.kt", "Tests.kt"], 6).length;
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
        platform,
    };
}

function checkGaps(root, repoRoot, guides, agentFiles, pkg, repoPkg) {
    const guideFile = guides.find((g) => /gap|absence|missing|not-built|unsupported|what-we-don/i.test(g.slug + " " + g.title));
    const candidates = ["GAPS.md", "docs/GAPS.md", "guidelines/GAPS.md", "docs/gaps.md"];
    const named = unique([root, repoRoot]).flatMap((base) => candidates.filter((f) => exists(join(base, f))).map((f) => (base === root ? f : rel(root, join(base, f)))));
    const scripts = Object.entries({ ...(repoPkg.scripts || {}), ...(pkg.scripts || {}) }).filter(([k]) => /gap/i.test(k));
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
