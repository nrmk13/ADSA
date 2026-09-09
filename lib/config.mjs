/**
 * Configuration. Everything has a default, and anything the tool can read from the
 * repo is never asked for: the config exists for the handful of things detection
 * gets wrong in a repo laid out unusually.
 */
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { exists, isDir, read, readJson } from "./fsx.mjs";

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

const GUIDE_DIRS = ["guidelines", "docs/components", "docs/guides", "documentation/components", "docs", "documentation", "www/content", "apps/docs/content"];
const SOURCE_DIRS = ["src/components", "Sources", "src/main/kotlin", "src", "packages/ui/src", "lib/components", "components"];

export function loadConfig(root) {
    const file = readJson(join(root, CONFIG_NAME)) || {};
    const config = { ...DEFAULTS, ...file };
    config.guides = normalizeDirs(root, config.guides, GUIDE_DIRS);
    config.source = normalizeDirs(root, config.source, SOURCE_DIRS);
    config.configFile = exists(join(root, CONFIG_NAME)) ? CONFIG_NAME : null;
    return config;
}

function normalizeDirs(root, value, candidates) {
    const list = value ? (Array.isArray(value) ? value : [value]) : candidates;
    const found = list.filter((d) => isDir(join(root, d)));
    // Only the first match from the candidate list, so `docs` does not shadow `guidelines`.
    return value ? found : found.slice(0, 1);
}

/**
 * Design systems usually live in a monorepo. When the given directory is a workspace
 * root with nothing to audit in it, pick the package that looks most like the design
 * system — the one with the most guides and exported subpaths — and say so.
 *
 * @returns {{ dir:string, note:string|null, candidates:Array<{dir:string,name:string,score:number}> }}
 */
export function resolveTarget(root) {
    const pkg = readJson(join(root, "package.json"));
    if (pkg && (pkg.exports || isDir(join(root, "guidelines")))) return { dir: root, note: null, candidates: [] };

    const patterns = workspacePatterns(root, pkg);
    if (!patterns.length) return { dir: root, note: null, candidates: [] };

    const candidates = [];
    for (const pattern of patterns) {
        for (const dir of expand(root, pattern)) {
            const p = readJson(join(dir, "package.json"));
            if (!p || p.private === true) continue;
            const guides = countGuides(dir);
            const exports_ = Object.keys(p.exports || {}).filter((k) => k.startsWith("./")).length;
            const score = guides * 3 + exports_;
            if (score > 0) candidates.push({ dir, name: p.name || dir, score, guides, exports: exports_ });
        }
    }
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length) return { dir: root, note: null, candidates: [] };
    return { dir: candidates[0].dir, note: `workspace: audited ${candidates[0].name}`, candidates };
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

function countGuides(dir) {
    for (const candidate of ["guidelines", "docs", "documentation"]) {
        if (isDir(join(dir, candidate))) return 1;
    }
    return 0;
}
