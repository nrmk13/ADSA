/**
 * Configuration. Everything has a default, and anything the tool can read from the
 * repo is never asked for: the config exists for the handful of things detection
 * gets wrong in a repo laid out unusually.
 */
import { basename, dirname, join } from "node:path";
import { readdirSync } from "node:fs";
import { exists, isDir, read, readJson, rel, walk } from "./fsx.mjs";

export const CONFIG_NAME = "adsa.config.json";

/** Never a workspace package, whatever a glob says. */
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", "out", ".git", "coverage", "storybook-static"]);

export const DEFAULTS = {
    /** Directories that hold component guides, in priority order. */
    guides: null,
    /** Where component source lives. */
    source: null,
    /** Extra packages a consumer must never import alongside this system. */
    forbidden: ["lucide-react", "@heroicons/react", "react-icons", "@mui/material", "@chakra-ui/react", "antd", "shadcn-ui"],
    /** Files that carry agent instructions, in priority order. */
    agentFiles: ["AGENTS.md", "CLAUDE.md", ".cursorrules", ".github/copilot-instructions.md"],
    /** Minimum score for `adsa audit --gate`. */
    minScore: null,
    /** Dimensions to skip, e.g. ["patterns"] for a primitives-only library. */
    skip: [],
};

/** A guide living next to the component it documents: `Button/Button.spec.md`. */
export const COLOCATED_GUIDE = /\.(spec|docs?|guide)\.mdx?$/i;

/** Catch-alls: real guides often live here, but so does everything else. */
const BROAD_GUIDE_DIRS = new Set(["docs", "documentation"]);
const GUIDE_DIRS = ["guidelines", "docs/components", "docs/guides", "documentation/components", "www/content", "apps/docs/content", "docs", "documentation"];
const SOURCE_DIRS = ["src/components", "Sources", "src/main/kotlin", "src", "packages/ui/src", "lib/components", "components"];

export function loadConfig(root) {
    const file = readJson(join(root, CONFIG_NAME)) || {};
    const config = { ...DEFAULTS, ...file };
    config.guidesExplicit = Boolean(file.guides);
    config.guides = config.guides ? listed(root, config.guides) : defaultGuideDirs(root);
    config.source = config.source ? listed(root, config.source) : defaultSourceDirs(root);
    config.configFile = exists(join(root, CONFIG_NAME)) ? CONFIG_NAME : null;
    return config;
}

function listed(root, value) {
    const list = Array.isArray(value) ? value : [value];
    return list.filter((d) => isDir(join(root, d)));
}

/**
 * Every specific guide directory that exists — a repo can keep `guidelines/` and
 * `docs/components/` and mean both. `docs/` and `documentation/` are catch-alls, so
 * they are only believed when nothing more specific was found.
 */
export function defaultGuideDirs(root) {
    const found = GUIDE_DIRS.filter((d) => isDir(join(root, d)));
    const specific = found.filter((d) => !BROAD_GUIDE_DIRS.has(d));
    return specific.length ? specific : found.slice(0, 1);
}

function defaultSourceDirs(root) {
    // A registry is a distribution format, not a folder somebody happened to name that:
    // `registry.json` is the manifest that says so, and the components it ships are the
    // system. The app's own `components/` is the site's chrome and would win otherwise.
    if (exists(join(root, "registry.json")) && isDir(join(root, "registry"))) return ["registry"];

    return SOURCE_DIRS.filter((d) => isDir(join(root, d))).slice(0, 1);
}

/**
 * The monorepo root that declares `pkgDir` as one of its own workspaces, or null.
 *
 * This is the only ancestor whose AGENTS.md, CI and agent surface belong to the
 * package being audited. An ancestor that merely happens to contain the directory —
 * a design system vendored inside an unrelated repository, a fixture inside this
 * one — declares nothing, and lending it its parent's files would invent a score.
 */
export function resolveRepoRoot(pkgDir) {
    let dir = dirname(pkgDir);
    for (let i = 0; i < 8; i++) {
        const parent = dirname(dir);
        if (declaresWorkspace(dir, pkgDir)) return dir;
        if (parent === dir) return null;
        dir = parent;
    }
    return null;
}

/** Every workspace directory `root` declares, absolute. Empty when it declares none. */
export function workspaceDirs(root) {
    const { include, exclude } = workspacePatterns(root, readJson(join(root, "package.json")));
    const excluded = new Set(exclude.flatMap((pattern) => expand(root, pattern)));
    return [...new Set(include.flatMap((pattern) => expand(root, pattern)))].filter((dir) => !excluded.has(dir));
}

function declaresWorkspace(root, pkgDir) {
    return workspaceDirs(root).includes(pkgDir);
}

/**
 * The workspace globs a repository declares, negations kept: `!**\/fixtures/**` is
 * how a repo says a directory full of package.json files is not a package.
 *
 * The pnpm file is read as its own `packages:` block rather than as every list item
 * in the document — `onlyBuiltDependencies` is a list of dependency names, and
 * reading it as workspace globs invents packages the repo does not have.
 */
function workspacePatterns(root, pkg) {
    const fromPkg = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages || [];
    const yaml = read(join(root, "pnpm-workspace.yaml")) || "";
    // Everything indented under `packages:`, comments and blank lines included — a
    // comment between two entries used to end the list, and half the globs vanished.
    const block = (yaml.match(/^packages:[ \t]*\n((?:(?:[ \t]+[^\n]*)?\n)*)/m) || [, ""])[1];
    const fromYaml = [...block.matchAll(/^\s*-\s*["']?([^"'\n]+)["']?/gm)].map((m) => m[1].trim());
    const all = [...new Set([...fromPkg, ...fromYaml])].filter(Boolean);
    return { include: all.filter((g) => !g.startsWith("!")), exclude: all.filter((g) => g.startsWith("!")).map((g) => g.slice(1)) };
}

/** Only the `dir/*` and `dir` shapes real workspace globs use. */
/**
 * A workspace glob as the package managers read it, segment by segment: `packages/*`,
 * `packages/**`, `packages/*\/*` for a nested layout, `packages/@scope/*` for a scope
 * folder. Reading only the first segment before the star — what this used to do —
 * returns the scope folders themselves, which have no package.json, so a repo like
 * Mantine or Radix looked like a repo with no packages at all.
 */
function expand(root, pattern) {
    let dirs = [root];
    for (const segment of pattern.split("/").filter((s) => s && s !== ".")) {
        const next = [];
        for (const dir of dirs) {
            if (segment === "**") next.push(dir, ...descend(dir, 2));
            else if (segment.includes("*")) next.push(...children(dir).filter((d) => segmentMatch(segment, basename(d))));
            else if (isDir(join(dir, segment))) next.push(join(dir, segment));
        }
        dirs = [...new Set(next)];
        if (dirs.length > 4000) break;
    }
    return dirs;
}

function children(dir) {
    try {
        return readdirSync(dir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !IGNORED_DIRS.has(e.name))
            .map((e) => join(dir, e.name));
    } catch {
        return [];
    }
}

/** Every directory under `dir`, `depth` levels down. `**` in a glob means this. */
function descend(dir, depth, level = 0, out = []) {
    if (level >= depth) return out;
    for (const child of children(dir)) {
        out.push(child);
        descend(child, depth, level + 1, out);
    }
    return out;
}

function segmentMatch(segment, name) {
    return new RegExp("^" + segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$").test(name);
}

/**
 * How many guides this package actually has. The presence of a `docs/` folder says
 * nothing — a package with one README-shaped page and a package with ninety component
 * guides both used to score 1, and the wrong one won.
 */
export function countGuides(dir) {
    let n = 0;
    for (const d of defaultGuideDirs(dir)) n += walk(join(dir, d), [".md", ".mdx"], 6).length;
    for (const s of defaultSourceDirs(dir)) n += walk(join(dir, s), [".md", ".mdx"], 6).filter((f) => COLOCATED_GUIDE.test(f)).length;
    return n;
}
