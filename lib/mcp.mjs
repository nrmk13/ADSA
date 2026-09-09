/**
 * MCP server over stdio: newline-delimited JSON-RPC, tools only. Hand-rolled, because
 * five tools do not justify a dependency in something people run with npx.
 *
 * It answers from the repository it is started in, so the guides an agent reads are
 * the ones in the checked-out version — not the newest ones on the internet.
 */
import { read } from "./fsx.mjs";
import { join } from "node:path";
import { dense } from "./dense.mjs";
import { score } from "./score.mjs";

const PROTOCOL = "2025-06-18";

export const TOOLS = [
    {
        name: "list_components",
        description: "List every documented component with its import path and guide.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_guide",
        description: "The full guide for one component: imports, props, rules, examples.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Component name, slug or exported symbol." },
                dense: { type: "boolean", description: "Drop prose, keep headings, code and tables. Default true." },
            },
            required: ["name"],
        },
    },
    {
        name: "search",
        description: "Find the component for a task, e.g. 'icon only button', 'date range', 'empty table'.",
        inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
    },
    {
        name: "list_gaps",
        description: "What this design system deliberately does not have, and what to use instead. Read this before building anything the guides do not cover.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "readiness_score",
        description: "The agent-readiness score of this design system, per dimension, with evidence.",
        inputSchema: { type: "object", properties: {} },
    },
];

const STOP = new Set(["a", "an", "the", "for", "with", "and", "or", "of", "to", "in", "on", "is", "it", "my", "our", "how", "do", "i", "use", "using", "component"]);

export function searchGuides(facts, query, limit = 8) {
    const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t));
    if (!terms.length) return [];
    return facts.guides
        .map((g) => {
            const haystack = `${g.slug} ${g.title}`.toLowerCase();
            const body = g.body.toLowerCase();
            let points = 0;
            for (const t of terms) {
                if (haystack.includes(t)) points += 5;
                if (g.slug.split("-").includes(t)) points += 3;
                const hits = body.split(t).length - 1;
                points += Math.min(hits, 6);
            }
            return { guide: g, points };
        })
        .filter((r) => r.points > 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, limit)
        .map((r) => ({ path: r.guide.path, title: r.guide.title || r.guide.slug, slug: r.guide.slug, score: r.points }));
}

export function findGuide(facts, name) {
    const needle = name.toLowerCase().replace(/[\s_]+/g, "-");
    const bare = needle.split(".")[0];
    return (
        facts.guides.find((g) => g.slug === needle || g.slug === bare) ||
        facts.guides.find((g) => (g.title || "").toLowerCase() === name.toLowerCase()) ||
        facts.guides.find((g) => g.tags.includes(name) || g.imports.some((i) => i.name === name)) ||
        null
    );
}

export function handleMessage(context, message) {
    const { facts, config } = context;
    const id = message.id;
    const reply = (result) => ({ jsonrpc: "2.0", id, result });
    const fail = (code, msg) => ({ jsonrpc: "2.0", id, error: { code, message: msg } });
    const text = (s) => reply({ content: [{ type: "text", text: s }] });

    switch (message.method) {
        case "initialize":
            return reply({ protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: "adsa", version: "0.1.0" } });
        case "notifications/initialized":
        case "notifications/cancelled":
            return null;
        case "ping":
            return reply({});
        case "tools/list":
            return reply({ tools: TOOLS });
        case "tools/call": {
            const args = message.params?.arguments || {};
            switch (message.params?.name) {
                case "list_components": {
                    const rows = facts.guides.map((g) => `${g.title || g.slug} — ${g.path}`);
                    return text(`${facts.name}${facts.version ? " " + facts.version : ""}\n${rows.length} guides\n\n${rows.join("\n")}`);
                }
                case "get_guide": {
                    const guide = findGuide(facts, String(args.name || ""));
                    if (!guide) {
                        const near = searchGuides(facts, String(args.name || ""), 5).map((r) => r.slug);
                        return text(`No guide for "${args.name}".${near.length ? ` Closest: ${near.join(", ")}.` : ""} Use list_components to see everything, and list_gaps before assuming it exists.`);
                    }
                    const body = args.dense === false ? guide.body : dense(guide.body);
                    return text(`${guide.path}\n\n${body}`);
                }
                case "search": {
                    const results = searchGuides(facts, String(args.query || ""), Number(args.limit) || 8);
                    if (!results.length) return text(`Nothing matched "${args.query}". If this system has no such component, list_gaps says what to use instead — do not invent one.`);
                    return text(results.map((r) => `${r.slug} — ${r.title} (${r.path})`).join("\n"));
                }
                case "list_gaps": {
                    const file = facts.gaps.file;
                    const body = file ? read(join(facts.root, file)) : null;
                    if (!body) return text("This repository has no gap list. Nothing states what the system deliberately lacks, so treat anything you cannot find as unknown and ask rather than inventing it.");
                    return text(`${file}\n\n${body}`);
                }
                case "readiness_score": {
                    const scored = score(facts, config);
                    const rows = scored.dimensions.map((d) => `${d.skipped ? "—" : d.score + "/5"}  ${d.title}${d.skipped ? " (skipped)" : ""}\n    ${(d.evidence || []).join(" ")}`);
                    return text(`${facts.name}: ${scored.total}/${scored.max}\n\n${rows.join("\n")}`);
                }
                default:
                    return fail(-32601, `Unknown tool "${message.params?.name}"`);
            }
        }
        default:
            return fail(-32601, `Unknown method "${message.method}"`);
    }
}

export async function serve(stdin, stdout, context) {
    let buffer = "";
    stdin.setEncoding("utf8");
    for await (const chunk of stdin) {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (!line) continue;
            let response;
            try {
                response = handleMessage(context, JSON.parse(line));
            } catch (error) {
                response = { jsonrpc: "2.0", id: null, error: { code: -32700, message: String(error.message || error) } };
            }
            if (response) stdout.write(JSON.stringify(response) + "\n");
        }
    }
}
