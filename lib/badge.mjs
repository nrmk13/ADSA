/** README badge. Static shields.io URL, plus an endpoint file for repos that prefer one.
 *
 * The four bands are the four verdicts the report uses, and the colours are the
 * page palette darkened until white text on them clears 4.5:1 — a badge is small
 * text on a solid fill, and it is the one artifact that ends up on someone else's
 * README. One scale, so the badge, the report and the page never disagree. */
const COLORS = [
    [0.85, "166534", "agent-ready"],
    [0.6, "15803d", "good foundation"],
    [0.35, "a16207", "gaps to address"],
    [0, "b91c1c", "not ready"],
];

export function badgeColor(total, max) {
    const ratio = max ? total / max : 0;
    return COLORS.find(([floor]) => ratio >= floor)[1];
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
