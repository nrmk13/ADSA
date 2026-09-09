/** Strips prose, keeps the parts an agent acts on: headings, code, tables, lists. */
export function dense(markdown) {
    const lines = markdown.split("\n");
    const out = [];
    let inFence = false;
    for (const line of lines) {
        if (/^\s*```/.test(line)) {
            inFence = !inFence;
            out.push(line);
            continue;
        }
        if (inFence) {
            out.push(line);
            continue;
        }
        if (/^\s*#{1,6}\s/.test(line) || /^\s*\|/.test(line) || /^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line) || /^\s*$/.test(line) || /^\s*>/.test(line)) {
            out.push(line);
        }
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
