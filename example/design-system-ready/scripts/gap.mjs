/**
 * `npm run gap:report -- "<what is missing>" "<use instead>" "<why>"`
 *
 * A gap an agent found and nobody wrote down is a gap the next agent finds again. This
 * appends a row to GAPS.md, which is the file the next agent reads — not a ticket, not
 * a chat message.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./components.mjs";

const [what, instead, why] = process.argv.slice(2);
if (!what || !instead) {
    console.error('Usage: npm run gap:report -- "Date range picker" "Two DatePicker fields" "Planned, no owner"');
    process.exit(1);
}

const path = join(ROOT, "GAPS.md");
const text = readFileSync(path, "utf8");
const row = `| ${what} | ${instead} | ${why || "Reported by an agent, not yet decided"} |`;
const rows = text.split("\n");
const last = rows.reduce((at, line, n) => (line.startsWith("| ") ? n : at), -1);
rows.splice(last + 1, 0, row);
writeFileSync(path, rows.join("\n"));
console.log(`GAPS.md — added: ${what}`);
