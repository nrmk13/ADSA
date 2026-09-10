/**
 * The measured field. A score out of 45 means nothing on its own — the question a
 * reader always asks first is "is that good?" — so every place a score is shown can
 * answer it with the same twelve public design systems, audited at a named commit.
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

/** Where a score sits in the field: how many of the reference systems it beats. */
export function standing(total) {
    const systems = REFERENCE.systems;
    const below = systems.filter((s) => s.total < total).length;
    const best = systems[0];
    return {
        count: systems.length,
        below,
        best,
        median: systems[Math.floor(systems.length / 2)].total,
        sentence:
            total >= best.total
                ? `${total}/45 is at or above ${best.name} (${best.total}), the highest of the ${systems.length} public design systems measured with this rubric.`
                : `${total}/45 sits above ${below} of the ${systems.length} public design systems measured with this rubric; ${best.name} leads at ${best.total}.`,
    };
}
