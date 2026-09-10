/**
 * Which directory to audit. A design system usually lives in a monorepo, and the
 * package the reader means is rarely the directory they typed: they hand over the
 * repository and expect the tool to find the components.
 *
 * Getting this wrong is the worst thing this tool can do. Every dimension is then
 * measured from inside the wrong folder, and "no agent instructions in the
 * repository" means "none in a subfolder of a repository that has them".
 */
import { join, basename } from "node:path";
import { isDir, readJson, rel } from "./fsx.mjs";
import { countGuides, workspaceDirs } from "./config.mjs";
import { countComponents } from "./scan.mjs";

/**
 * @param {string} root the directory the reader named
 * @param {{workspace?:string, noWorkspace?:boolean}} options `--workspace` / `--no-workspace`
 * @returns {{ dir:string, note:string|null, candidates:Array<object>, error?:string }}
 */
export function resolveTarget(root, options = {}) {
    if (options.noWorkspace) return { dir: root, note: null, candidates: [] };

    if (options.workspace) {
        const all = profile(workspaceDirs(root), true);
        const wanted = all.find((c) => c.name === options.workspace || basename(c.dir) === options.workspace || rel(root, c.dir) === options.workspace);
        if (!wanted) {
            const known = all.map((c) => c.name).join(", ") || "none";
            return { dir: root, note: null, candidates: all, error: `No workspace matches "${options.workspace}". This repository has: ${known}.` };
        }
        return { dir: wanted.dir, note: `workspace: audited ${wanted.name} (--workspace)`, candidates: all };
    }

    // A root that publishes the components itself is the package, whatever else the
    // repository keeps beside it: its own export map is what a consumer installs.
    const pkg = readJson(join(root, "package.json"));
    const rootExports = Object.keys(pkg?.exports || {}).filter((k) => k.startsWith("./")).length;
    if (rootExports >= 5 || isDir(join(root, "guidelines"))) return { dir: root, note: null, candidates: [] };

    const workspaces = workspaceDirs(root);
    if (!workspaces.length) return { dir: root, note: null, candidates: [] };

    // Published packages first. Only when none of them exports a component does a
    // private workspace count: a repository that keeps its components in its own docs
    // app — a registry, a showcase — still keeps them somewhere, and reporting a
    // repository full of components as having none is the worse answer.
    const published = profile(workspaces, false);
    const all = published.some((c) => c.components > 0) ? published : profile(workspaces, true);
    const withComponents = all.filter((c) => c.components > 0);
    if (!withComponents.length) return { dir: root, note: null, candidates: all };

    const best = withComponents[0];
    const runnerUp = withComponents[1];
    const note = `workspace: audited ${best.name}, ${best.components} components${runnerUp ? ` (next: ${runnerUp.name}, ${runnerUp.components})` : ""}`;
    return { dir: best.dir, note, candidates: withComponents };
}

/**
 * Rank the packages by what actually distinguishes a design system: the number of
 * components a consumer can import from it. Ranking by the presence of a `docs/`
 * folder — what this did before — hands the audit to whichever package happens to
 * keep markdown next to it, and a codemod package with thirty migration notes beat
 * the component library every time.
 *
 * `explicit` is a name the reader typed, so nothing is filtered out: a private
 * workspace is still a package somebody can ask to audit.
 */
/** `"private": "true"` is in the wild, and reads as published to a strict check. */
const isPrivate = (pkg) => pkg.private === true || pkg.private === "true";

function profile(dirs, explicit) {
    const out = [];
    for (const dir of dirs) {
        const pkg = readJson(join(dir, "package.json"));
        if (!pkg || (isPrivate(pkg) && !explicit)) continue;
        const components = countComponents(dir);
        const guides = countGuides(dir);
        const exports_ = Object.keys(pkg.exports || {}).filter((k) => k.startsWith("./")).length;
        if (!explicit && !components && !guides && !exports_) continue;
        out.push({ dir, name: pkg.name || basename(dir), components, guides, exports: exports_ });
    }
    return out.sort((a, b) => b.components - a.components || b.guides - a.guides || b.exports - a.exports);
}
