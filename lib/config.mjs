/**
 * Configuration. Everything has a default, and anything the tool can read from the
 * repo is never asked for: the config exists for the handful of things detection
 * gets wrong in a repo laid out unusually.
 */
import { basename, dirname, join } from "node:path";
import { readdirSync } from "node:fs";
import { exists, isDir, read, readJson, rel, walk } from "./fsx.mjs";

export const CONFIG_NAME = "adsa.config.json";

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
    return SOURCE_DIRS.filter((d) => isDir(join(root, d))).slice(0, 1);
}

/**
 * Design systems usually live in a monorepo. When the given directory is a workspace
 * root with nothing to audit in it, pick the package that looks most like the design
 * system — the one with the most guides and exported subpaths — and say so.
 *
 * `--workspace <name>` picks one by hand; `--no-workspace` audits the given directory
 * as it stands. Both beat detection, because detection is the part that gets it wrong.
 *
 * @returns {{ dir:string, note:string|null, candidates:Array<{dir:string,name:string,score:number}>, error?:string }}
 */
export function resolveTarget(root, options = {}) {
    const pkg = readJson(join(root, "package.json"));
    const patterns = workspacePatterns(root, pkg);

    if (options.noWorkspace) return { dir: root, note: null, candidates: [] };

    if (options.workspace) {
        const all = workspaceCandidates(root, patterns, true);
        const wanted = all.find((c) => c.name === options.workspace || basename(c.dir) === options.workspace || rel(root, c.dir) === options.workspace);
        if (!wanted) {
            const known = all.map((c) => c.name).join(", ") || "none";
            return { dir: root, note: null, candidates: all, error: `No workspace matches "${options.workspace}". This repository has: ${known}.` };
        }
        return { dir: wanted.dir, note: `workspace: audited ${wanted.name} (--workspace)`, candidates: all };
    }

    if (pkg && (pkg.exports || isDir(join(root, "guidelines")))) return { dir: root, note: null, candidates: [] };
    if (!patterns.length) return { dir: root, note: null, candidates: [] };

    const candidates = workspaceCandidates(root, patterns, false);
    if (!candidates.length) return { dir: root, note: null, candidates: [] };
    return { dir: candidates[0].dir, note: `workspace: audited ${candidates[0].name}`, candidates };
}

/**
 * `explicit` is a name the reader typed, so nothing is filtered out: a private
 * workspace is still a package somebody can ask to audit. Detection is stricter —
 * a private package is not what a consumer installs.
 */
function workspaceCandidates(root, patterns, explicit) {
    const candidates = [];
    for (const pattern of patterns) {
        for (const dir of expand(root, pattern)) {
            const p = readJson(join(dir, "package.json"));
            if (!p || (p.private === true && !explicit)) continue;
            const guides = countGuides(dir);
            const exports_ = Object.keys(p.exports || {}).filter((k) => k.startsWith("./")).length;
            const score = guides * 3 + exports_;
            if (score > 0 || explicit) candidates.push({ dir, name: p.name || dir, score, guides, exports: exports_ });
        }
    }
    return candidates.sort((a, b) => b.score - a.score);
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
    const patterns = workspacePatterns(root, readJson(join(root, "package.json")));
    return [...new Set(patterns.flatMap((pattern) => expand(root, pattern)))];
}

function declaresWorkspace(root, pkgDir) {
    const patterns = workspacePatterns(root, readJson(join(root, "package.json")));
    return patterns.some((pattern) => expand(root, pattern).includes(pkgDir));
}

function workspacePatterns(root, pkg) {
    const fromPkg = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages || [];
    const yaml = read(join(root, "pnpm-workspace.yaml")) || "";
    const fromYaml = [...yaml.matchAll(/^\s*-\s*["']?([^"'\n]+)["']?/gm)].map((m) => m[1].trim());
    return [...new Set([...fromPkg, ...fromYaml])].filter(Boolean);
}

/** Only the `dir/*` and `dir` shapes real workspace globs use. */
function expand(root, pattern) {
    const clean = pattern.replace(/\/\*\*$/, "/*");
    if (!clean.includes("*")) return isDir(join(root, clean)) ? [join(root, clean)] : [];
    const base = join(root, clean.slice(0, clean.indexOf("*")).replace(/\/$/, ""));
    if (!isDir(base)) return [];
    try {
        return readdirSync(base, { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith("."))
            .map((e) => join(base, e.name));
    } catch {
        return [];
    }
}

/**
 * How many guides this package actually has. The presence of a `docs/` folder says
 * nothing — a package with one README-shaped page and a package with ninety component
 * guides both used to score 1, and the wrong one won.
 */
function countGuides(dir) {
    let n = 0;
    for (const d of defaultGuideDirs(dir)) n += walk(join(dir, d), [".md", ".mdx"], 6).length;
    for (const s of defaultSourceDirs(dir)) n += walk(join(dir, s), [".md", ".mdx"], 6).filter((f) => COLOCATED_GUIDE.test(f)).length;
    return n;
}
