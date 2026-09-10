/** The four verdicts, and the README badge that carries one of them.
 *
 * The thresholds are not a curve and not a guess: the public design systems in `rubric/reference.json` were
 * audited with this rubric (`rubric/reference.json`), and the field runs from 13/45
 * to 33/45. Nothing reaches 40, and the systems people hold up as the good ones sit
 * between 21 and 33 — so a scale where 38/45 was the first green band called every
 * design system in the world unready, which is a scale that tells you nothing.
 *
 * So the bands are anchored to the measured field: *agent-ready* starts at the level
 * the best-documented system reaches today, and the middle of the field is *gaps to
 * address*, because the middle of the field is where an agent still guesses.
 *
 * The colours are the page palette darkened until white text on them clears 4.5:1 —
 * a badge is small text on a solid fill, and it is the one artifact that ends up on
 * somebody else's README. One scale, so the badge, the report, the terminal and the
 * page never disagree.
 */
export const BANDS = [
    { floor: 0.68, id: "ready", label: "agent-ready", color: "166534", note: "At the level of the best-documented public design system measured." },
    { floor: 0.53, id: "good", label: "good foundation", color: "15803d", note: "Above most public design systems. An agent can work here, with gaps." },
    { floor: 0.33, id: "gaps", label: "gaps to address", color: "a16207", note: "Where most design systems sit. An agent fills the rest by guessing." },
    { floor: 0, id: "unready", label: "not ready", color: "b91c1c", note: "An agent will invent most of what it needs." },
];

/** @returns {{floor:number,id:string,label:string,color:string,note:string}} */
export function band(total, max) {
    const ratio = max ? total / max : 0;
    return BANDS.find((b) => ratio >= b.floor);
}

export function badgeColor(total, max) {
    return band(total, max).color;
}

export function badgeMarkdown(total, max, link) {
    const url = `https://img.shields.io/badge/agent--ready-${total}%2F${max}-${badgeColor(total, max)}`;
    const img = `![Agent-ready ${total}/${max}](${url})`;
    return link ? `[${img}](${link})` : img;
}

/** shields.io endpoint schema, so a badge can read the committed score directly. */
export function badgeEndpoint(total, max) {
    return { schemaVersion: 1, label: "agent-ready", message: `${total}/${max}`, color: `#${badgeColor(total, max)}` };
}
