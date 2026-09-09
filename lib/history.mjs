/** Score history, committed with the repo so a regression is visible in a diff. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readJson } from "./fsx.mjs";

export const DIR = ".adsa";

export function historyPath(root) {
    return join(root, DIR, "history.json");
}

export function readHistory(root) {
    const json = readJson(historyPath(root));
    return Array.isArray(json) ? json : [];
}

/** Appends a run, collapsing same-day reruns so the file does not grow per invocation. */
export function appendHistory(root, entry) {
    const history = readHistory(root);
    const day = entry.date.slice(0, 10);
    const filtered = history.filter((h) => h.date.slice(0, 10) !== day);
    filtered.push(entry);
    write(historyPath(root), filtered);
    return filtered;
}

export function write(path, data) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

/** Per-dimension delta against the previous run. */
export function compare(previous, current) {
    if (!previous) return null;
    const moved = [];
    for (const [id, score] of Object.entries(current.dimensions)) {
        const before = previous.dimensions[id];
        if (before !== score && before != null && score != null) moved.push({ id, from: before, to: score });
    }
    return { from: previous.total, to: current.total, delta: current.total - previous.total, moved, since: previous.generatedAt || previous.date };
}
