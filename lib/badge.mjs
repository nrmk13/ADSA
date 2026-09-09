/** README badge. Static shields.io URL, plus an endpoint file for repos that prefer one. */
const COLORS = [
    [0.85, "17795c", "brightgreen"],
    [0.6, "1f5fd0", "blue"],
    [0.35, "a2650b", "orange"],
    [0, "a8352c", "red"],
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
