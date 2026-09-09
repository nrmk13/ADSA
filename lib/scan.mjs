/**
 * Reads a design system repository and returns facts. Nothing here scores anything:
 * every field is something observed in the repo, so a report can quote its evidence
 * and a maintainer can disagree with the reading rather than the number.
 */
import { basename, join } from "node:path";
import { exists, isDir, read, readJson, rel, walk, walkDirs } from "./fsx.mjs";

const CODE_FENCE = /```(tsx|jsx|ts|js|typescript|javascript|swift|kotlin|kt)\s*\n([\s\S]*?)```/g;
const PALETTE = "slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RAW_PALETTE = new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow|decoration)-(?:${PALETTE})-\\d{2,3}\\b`, "g");
const RAW_NEUTRAL = /\b(?:bg|text|border)-(?:white|black)\b/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const A11Y_HEADING = /^#{2,4}.*(keyboard|accessib|a11y|screen reader|aria|voiceover|talkback|dynamic type|touch target|contentdescription)/im;
const GENERATED = /<!--\s*(?:generated|auto-?generated|do not edit|prop-table:start|props:start)/i;
const PROP_TABLE = /^\|[^\n]*\bprops?\b[^\n]*\|[^\n]*\btype\b[^\n]*\|/im;
const PASCAL_EXPORT = /export\s+(?:default\s+)?(?:const|function|class)\s+([A-Z][A-Za-z0-9_]*)/g;
const TYPE_EXPORT = /export\s+(?:type|interface)\s+([A-Z][A-Za-z0-9_]*)/g;
/** `struct Foo: View`, `public class Foo: UIView` — captures the whole conformance list so a multi-protocol clause still matches. */
const SWIFT_TYPE = /\b(?:@[\w:()]+\s+)*(?:public\s+|open\s+|internal\s+)?(?:final\s+)?(struct|class)\s+([A-Z][A-Za-z0-9_]*)\s*(?:<[^>{]*>)?\s*:\s*([^{]+?)\{/g;
const SWIFT_SYMBOL = /\b(?:public\s+|open\s+)?(?:static\s+)?(?:struct|class|enum|func)\s+([A-Za-z][A-Za-z0-9_]*)/g;
/** `@Composable` followed, within a short window (annotations, modifiers, newlines), by `fun Name(`. */
const COMPOSABLE = /@Composable[\s\S]{0,120}?\bfun\s+([A-Z][A-Za-z0-9_]*)\s*\(/g;
const KOTLIN_SYMBOL = /\b(?:public\s+|internal\s+)?(?:class|object|interface|enum class)\s+([A-Z][A-Za-z0-9_]*)/g;

export function scan(root, config) {
    const pkg = readJson(join(root, "package.json")) || {};
    const platform = detectPlatform(root, pkg);
    const facts = {
        root,
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
    facts.guides = findGuides(root, config);
    facts.agentFiles = readAgentFiles(root, config, facts.name);
    facts.machine = findMachineSurface(root, pkg, config);
    facts.ci = readCi(root, pkg, platform.primary);
    facts.coverage = matchCoverage(facts.components, facts.guides);
    facts.freshness = checkFreshness(facts.guides, facts.symbols, facts.name, facts.ci);
    facts.tokens = checkTokens(facts.guides, facts.ci, root, platform.primary);
    facts.patterns = checkPatterns(facts.guides);
    facts.a11y = checkA11y(facts.guides, facts.ci, root, platform.primary);
    facts.verification = checkVerification(root, pkg, facts.ci, platform.primary);
    facts.gaps = checkGaps(root, facts.guides, facts.agentFiles, pkg);
    return facts;
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
 * What a consumer can import. Package `exports` subpaths are the most reliable
 * answer, and when a package ships them they *are* the surface, so the source scan
 * is only a fallback for repos with a single entry point. Native platforms have no
 * `package.json`, so they go straight to their own declaration syntax.
 */
function findComponents(root, pkg, config, platform) {
    if (platform === "swift") return findSwiftComponents(root, config);
    if (platform === "android") return findKotlinComponents(root, config);

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
 * Markdown guides from `config.guides`, plus any DocC bundle (`*.docc`) found
 * anywhere in the repo — that is where a Swift package's guides usually live, and
 * it is not a directory a maintainer would think to list in `adsa.config.json`.
 */
function findGuides(root, config) {
    const dirs = new Set(config.guides);
    for (const doccDir of walkDirs(root, [".docc"], 6)) dirs.add(rel(root, doccDir));
    const guides = [];
    for (const dir of dirs) {
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
            hasImportRule: /import\s*\{|from ["'][^"']+["']|import path|subpath|^import\s+\w/im.test(text),
            hasLookupCommand: /```|npx |yarn |pnpm |run `|swift |gradlew/i.test(text),
            hasTokenRule: /token|bg-primary|text-secondary|semantic|colorset|colors\.xml|theme/i.test(text),
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

function readCi(root, pkg, platform) {
    const files = [...walk(join(root, ".github/workflows"), [".yml", ".yaml"], 2)];
    const text = files.map((f) => read(f) || "").join("\n");
    const scripts = pkg.scripts || {};
    const all = text + "\n" + Object.values(scripts).join("\n");
    return {
        workflows: files.map((f) => rel(root, f)),
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

function checkVerification(root, pkg, ci, platform) {
    const scripts = pkg.scripts || {};
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
