/**
 * The measured field. A score out of 45 means nothing on its own — the question a
 * reader always asks first is "is that good?" — so every place a score is shown can
 * answer it with the same public design systems, audited at a named commit.
 *
 * This is not a ranking of design systems. It measures one thing: what a coding agent
 * can find in the repository. A system whose documentation lives on a website scores
 * low here and may still be a fine design system for people.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const REFERENCE = JSON.parse(readFileSync(join(here, "..", "rubric", "reference.json"), "utf8"));

/**
 * Where a score sits in the field: how many of the reference systems it beats.
 *
 * When dimensions do not apply — a system with no importable surface is not asked
 * whether every component has a guide — the comparison is recomputed over exactly the
 * dimensions that were scored. Otherwise a 9 out of 35 gets measured against thirteen
 * systems scored out of 45, and the sentence is arithmetic about two different things.
 */
export function standing(total, applicable = null) {
    const all = Object.keys(REFERENCE.systems[0].dimensions).length;
    const ids = applicable && applicable.length && applicable.length < all ? applicable : null;
    const comparable = (s) => (ids ? ids.reduce((n, id) => n + (s.dimensions[id] ?? 0), 0) : s.total);
    const systems = [...REFERENCE.systems].map((s) => ({ ...s, comparable: comparable(s) })).sort((a, b) => b.comparable - a.comparable);
    const max = ids ? ids.length * 5 : 45;
    const below = systems.filter((s) => s.comparable < total).length;
    const best = systems[0];
    const scale = ids ? ` on the ${ids.length} dimensions that apply here` : "";
    return {
        count: systems.length,
        below,
        best,
        median: systems[Math.floor(systems.length / 2)].comparable,
        sentence:
            total >= best.comparable
                ? `${total}/${max} is at or above ${best.name} (${best.comparable}), the highest of the ${systems.length} public design systems measured with this rubric${scale}.`
                : `${total}/${max} sits above ${below} of the ${systems.length} public design systems measured with this rubric${scale}; ${best.name} leads at ${best.comparable}.`,
    };
}

/** The dimensions a run actually scored, in rubric order — the basis for a fair comparison. */
export function scoredIds(scored) {
    return scored.dimensions.filter((d) => !d.skipped).map((d) => d.id);
}
