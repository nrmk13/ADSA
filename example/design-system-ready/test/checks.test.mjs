/**
 * The checks, checked. A check that never fails is not a check, so each of these
 * breaks the system on purpose in a copy and asserts the right script goes red with
 * the right message.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const copies = [];
after(() => copies.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A throwaway copy of the whole system, so a test can break it. */
function copy() {
    const dir = mkdtempSync(join(tmpdir(), "acme-ui-"));
    copies.push(dir);
    cpSync(ROOT, dir, { recursive: true, filter: (src) => !/node_modules|\.adsa/.test(src) });
    return dir;
}

/** @returns {{code:number, out:string}} */
function run(dir, script) {
    return runWithArgs(dir, script, []);
}

function runWithArgs(dir, script, args) {
    try {
        return { code: 0, out: execFileSync("node", [join(dir, "scripts", script), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
    } catch (error) {
        return { code: error.status ?? 1, out: (error.stdout || "") + (error.stderr || "") };
    }
}

describe("the documentation checks fail when the documentation is wrong", () => {
    it("passes on the system as it is", () => {
        const dir = copy();
        for (const script of ["guidelines.mjs", "examples.mjs"]) assert.equal(run(dir, script).code, 0, script);
        assert.equal(run(dir, "props.mjs").code, 0);
    });

    it("catches an export with no guide", () => {
        const dir = copy();
        const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
        pkg.exports["./tooltip"] = "./dist/tooltip.js";
        writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 4));
        const { code, out } = run(dir, "guidelines.mjs");
        assert.equal(code, 1);
        assert.match(out, /@acme\/ui\/tooltip/);
    });

    it("catches a prop an example uses and the component does not have", () => {
        const dir = copy();
        const path = join(dir, "guidelines/button.md");
        writeFileSync(path, readFileSync(path, "utf8").replace('<Button color="primary" size="md">', '<Button variant="primary" size="md">'));
        const { code, out } = run(dir, "examples.mjs");
        assert.equal(code, 1);
        assert.match(out, /guidelines\/button\.md:\d+ — <Button> has no prop `variant`/);
    });

    it("catches an example importing something the package does not export", () => {
        const dir = copy();
        const path = join(dir, "guidelines/button.md");
        writeFileSync(path, readFileSync(path, "utf8").replace('import { Button } from "@acme/ui/button";', 'import { Button, ButtonGroup } from "@acme/ui/button";'));
        const { code, out } = run(dir, "examples.mjs");
        assert.equal(code, 1);
        assert.match(out, /`ButtonGroup` is not exported/);
    });

    it("catches a prop table that no longer matches the source", () => {
        const dir = copy();
        const path = join(dir, "src/components/button.tsx");
        writeFileSync(path, readFileSync(path, "utf8").replace("isLoading?: boolean;", "isLoading?: boolean;\n    isPending?: boolean;"));
        const { code, out } = runWithArgs(dir, "props.mjs", ["--check"]);
        assert.equal(code, 1, out);
    });

    it("catches a guide with no accessibility contract", () => {
        const dir = copy();
        writeFileSync(join(dir, "guidelines/tooltip.md"), "# Tooltip\n\nNothing here yet.\n");
        const { code, out } = run(dir, "a11y.mjs");
        assert.equal(code, 1);
        assert.match(out, /no accessibility contract for guidelines\/tooltip\.md/);
    });
});
