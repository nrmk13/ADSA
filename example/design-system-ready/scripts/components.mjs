/**
 * What the package exports, and the props of each component, read from the source.
 *
 * This is the one place that parses TypeScript, badly and on purpose: the system is
 * six files, and a real library would read the emitted `.d.ts` with the compiler API.
 * The shape of the output is what matters — every generator and every check below
 * reads components from here, so a component can never be documented under a name
 * the source does not use.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/components");

const EXPORTED = /export (?:const|function) ([A-Z][A-Za-z0-9]*)/g;
const INTERFACE = /export interface (\w+)\s*(?:extends ([^{]+))?\{([\s\S]*?)\n\}/g;
const PROP = /(?:\/\*\*(?!\/)([\s\S]*?)\*\/\s*)?(\w+)(\?)?:\s*([^;\n]+);/g;

/** Every component the package publishes, in the order a reader meets them. */
export function components() {
    const out = [];
    for (const file of readdirSync(SRC).filter((f) => f.endsWith(".tsx")).sort()) {
        const text = readFileSync(join(SRC, file), "utf8");
        const slug = file.replace(/\.tsx$/, "");
        const names = [...text.matchAll(EXPORTED)].map((m) => m[1]);
        const types = {};
        for (const m of text.matchAll(INTERFACE)) types[m[1]] = { extends: (m[2] || "").trim(), props: props(m[3]) };
        const main = names[0];
        // Not every component declares a named props interface: a small one writes the
        // object inline in its signature, and reading only interfaces reported those
        // components as taking no props at all.
        const inline = text.match(new RegExp(`export (?:const|function) ${main}\\s*=?\\s*\\(\\{[^}]*\\}:\\s*\\{([^}]*)\\}`));
        const type = types[`${main}Props`] || (inline ? { extends: "", props: props(inline[1].replace(/,/g, ";") + ";") } : null);
        out.push({ slug, file: `src/components/${file}`, name: main, exports: names, type, unions: unions(text) });
    }
    return out;
}

function props(body) {
    return [...body.matchAll(PROP)].map((m) => ({
        doc: (m[1] || "").replace(/\s*\*\s?/g, " ").trim(),
        name: m[2],
        required: !m[3],
        type: m[4].trim(),
    }));
}

/** `export type ButtonColor = "primary" | ...`, so a table can print the real values. */
function unions(text) {
    const out = {};
    for (const m of text.matchAll(/export type (\w+) = ([^;]+);/g)) out[m[1]] = m[2].trim();
    return out;
}

/** Every symbol a guide is allowed to import from this package. */
export function symbols() {
    return new Set(components().flatMap((c) => c.exports));
}

/** The subpath a component is imported from: `@acme/ui/button`. */
export const subpath = (slug) => `@acme/ui/${slug}`;
