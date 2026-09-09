/** Filesystem helpers. No dependencies: this runs inside somebody else's repo. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", ".next", "coverage", ".turbo", ".yarn", "storybook-static", ".cache"]);

/** Every file under `dir` with one of `exts`, depth-limited. Returns absolute paths. */
export function walk(dir, exts, maxDepth = 8, _depth = 0, _out = []) {
    if (_depth > maxDepth || !existsSync(dir)) return _out;
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return _out;
    }
    for (const e of entries) {
        if (e.name.startsWith(".") && e.name !== ".github") continue;
        const path = join(dir, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name)) continue;
            walk(path, exts, maxDepth, _depth + 1, _out);
        } else if (!exts || exts.some((x) => e.name.endsWith(x))) {
            _out.push(path);
        }
    }
    return _out;
}

export function read(path) {
    try {
        return readFileSync(path, "utf8");
    } catch {
        return null;
    }
}

export function readJson(path) {
    const text = read(path);
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export function exists(path) {
    return existsSync(path);
}

export function isDir(path) {
    try {
        return statSync(path).isDirectory();
    } catch {
        return false;
    }
}

export function rel(root, path) {
    const r = relative(root, path);
    return r.split("\\").join("/");
}

/** First existing path from a list of candidates, relative to root. */
export function firstExisting(root, candidates) {
    for (const c of candidates) if (existsSync(join(root, c))) return c;
    return null;
}
