/**
 * Fails when a consumer can import something that has no guide.
 *
 * Coverage that nothing enforces goes down with every release: the export is the
 * cheap half and the guide is the expensive half, and one of them always lands first.
 * The package's `exports` map is the list, because that is the surface a consumer
 * sees — not the source, which contains plenty a consumer cannot reach.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./components.mjs";

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const allow = JSON.parse(readFileSync(join(ROOT, "guidelines/allowlist.json"), "utf8")).exports;

const subpaths = Object.keys(pkg.exports || {})
    .filter((k) => k.startsWith("./"))
    .map((k) => k.slice(2))
    .filter((slug) => !/\.(css|json|js)$/.test(slug));

const isIconSet = (slug) => /^(icons?|logos?|flags?)$/.test(slug);
const setAside = subpaths.filter(isIconSet);
const undocumented = subpaths.filter((slug) => !isIconSet(slug) && !allow[slug] && !existsSync(join(ROOT, "guidelines", `${slug}.md`)));

for (const [slug, reason] of Object.entries(allow)) console.log(`allowed without a guide: ${slug} — ${reason}`);
if (setAside.length) console.log(`set aside as icon or logo sets: ${setAside.join(", ")}`);

if (undocumented.length) {
    console.error(`\n${undocumented.length} export(s) a consumer can import with no guide:`);
    for (const slug of undocumented) console.error(`  @acme/ui/${slug}  →  write guidelines/${slug}.md`);
    console.error("\nIf one genuinely needs no guide, add it to guidelines/allowlist.json with a reason.");
    process.exit(1);
}

const documented = subpaths.length - setAside.length - Object.keys(allow).length;
console.log(`documentation coverage: ${documented}/${documented} importable components`);
