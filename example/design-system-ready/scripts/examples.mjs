/**
 * Checks every code block in the guides against the source.
 *
 * Every example is a promise the system makes, and the promises rot silently: a prop
 * is renamed, a component is removed, and the guide keeps recommending it for a year.
 * A real library type-checks the blocks against the built package; this one is six
 * files, so the check reads the source instead and asks the two questions that catch
 * almost all of it — does this symbol exist, and does this prop exist.
 *
 * Report is `path:line — message` and the exit code is non-zero on the first failure.
 * Verify it by breaking an example on purpose: test/checks.test.mjs does exactly that.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { components, ROOT } from "./components.mjs";

const SKIP = /<!--\s*examples:skip\s+(.+?)\s*-->/;
/**
 * What a component that extends a DOM element's props also accepts. A real check reads
 * this from the compiler; a six-file system writes the list down, because the
 * alternative — trusting every attribute on a native component — is what let
 * `<Button variant="primary">` sit in a guide for a year. Anything not here and not a
 * prop of the component is a typo, a prop from another library, or a prop that was
 * renamed.
 */
const DOM_PROPS = new Set([
    "id", "className", "style", "title", "role", "key", "ref", "tabIndex", "hidden", "lang", "dir", "slot", "translate",
    "type", "name", "value", "defaultValue", "checked", "defaultChecked", "placeholder", "disabled", "readOnly", "required",
    "autoComplete", "autoFocus", "maxLength", "minLength", "min", "max", "step", "pattern", "multiple", "accept", "form",
    "href", "target", "rel", "download", "src", "alt", "width", "height", "loading", "colSpan", "rowSpan", "scope", "htmlFor",
    "onClick", "onChange", "onInput", "onSubmit", "onBlur", "onFocus", "onKeyDown", "onKeyUp", "onMouseEnter", "onMouseLeave",
]);

const parts = components();
const known = new Set(parts.flatMap((c) => c.exports));
const propsOf = new Map();
for (const c of parts) {
    const own = new Set((c.type?.props || []).map((p) => p.name));
    propsOf.set(c.name, { own, native: Boolean(c.type?.extends) });
    // The sub-parts — CardHeader, TableRow — are plain DOM wrappers.
    for (const name of c.exports.slice(1)) propsOf.set(name, { own: new Set(), native: true });
}

function guides(dir = join(ROOT, "guidelines"), out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) guides(path, out);
        else if (entry.name.endsWith(".md")) out.push(path);
    }
    return out;
}

const failures = [];
let blocks = 0;
let skipped = 0;

for (const path of guides()) {
    const rel = relative(ROOT, path);
    const text = readFileSync(path, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (!/^```(tsx|ts|jsx|js)\s*$/.test(lines[i])) continue;
        const start = i;
        const end = lines.indexOf("```", i + 1);
        const body = lines.slice(start + 1, end);
        i = end;
        const reason = (lines[start - 1] || "").match(SKIP);
        if (reason) {
            skipped++;
            console.log(`${rel}:${start + 1} — skipped: ${reason[1]}`);
            continue;
        }
        blocks++;
        check(rel, start + 2, body);
    }
}

function check(rel, offset, body) {
    const at = (n) => `${rel}:${offset + n}`;
    for (let n = 0; n < body.length; n++) {
        const line = body[n];
        // Every symbol imported from this package has to exist in it.
        const imported = line.match(/import\s*\{([^}]+)\}\s*from\s*["']@acme\/ui\/([\w-]+)["']/);
        if (imported) {
            for (const name of imported[1].split(",").map((s) => s.trim()).filter(Boolean)) {
                if (!known.has(name)) failures.push(`${at(n)} — \`${name}\` is not exported by this package`);
                else if (!parts.find((c) => c.slug === imported[2])?.exports.includes(name))
                    failures.push(`${at(n)} — \`${name}\` is not exported from @acme/ui/${imported[2]}`);
            }
        }
        // Every prop set on one of this system's components has to exist on it.
        for (const tag of line.matchAll(/<([A-Z][A-Za-z0-9]*)((?:\s+[^>]*?)?)\/?>/g)) {
            const contract = propsOf.get(tag[1]);
            if (!contract) continue;
            // Values first: a word inside `title="Delete Acme Ltd"` is not a prop name,
            // and reading it as one is how a check earns a reputation for lying.
            const attributes = tag[2].replace(/=\{[^}]*\}/g, "").replace(/="[^"]*"/g, "").replace(/='[^']*'/g, "");
            for (const prop of attributes.matchAll(/(?:^|\s)([a-zA-Z][\w-]*)(?==|\s|$)/g)) {
                const name = prop[1];
                if (contract.own.has(name) || name === "children" || name.startsWith("aria-") || name.startsWith("data-")) continue;
                if (contract.native && DOM_PROPS.has(name)) continue;
                failures.push(`${at(n)} — <${tag[1]}> has no prop \`${name}\``);
            }
        }
    }
}

console.log(`\nguide examples: ${blocks} checked, ${skipped} skipped`);
if (failures.length) {
    console.error(`\n${failures.length} example(s) the system no longer keeps:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
}
console.log("every example imports and uses something that exists");
