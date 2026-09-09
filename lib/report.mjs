/** Renders the audit as one self-contained HTML file and a markdown twin. */
import { RUBRIC } from "./score.mjs";

const SIGNATURE = "From one designer to designers with love &lt;3";

const BAND = (n, max) => {
    const r = n / max;
    return r >= 0.85 ? "strong" : r >= 0.6 ? "fair" : r >= 0.35 ? "weak" : "poor";
};

const VERDICT = {
    strong: "Agents can work in this system. Keep the gates that make that true.",
    fair: "The bones are right. The gaps are the ones that let an agent invent things.",
    weak: "An agent will produce plausible, wrong UI here more often than not.",
    poor: "There is nothing here for an agent to follow, so it will follow its own habits.",
};

const FIX_LABELS = {
    "agents-md": ["Write agent instructions", "S"],
    "mcp-config": ["Expose the docs as MCP tools", "M"],
    "coverage-gate": ["Fail CI on an undocumented export", "S"],
    "prop-tables": ["Generate prop tables from types", "M"],
    "examples-check": ["Compile guide examples in CI", "M"],
    "tokens-doc": ["Document tokens as tables", "S"],
    "patterns-doc": ["Write page-level patterns", "L"],
    "a11y-docs": ["Add keyboard and accessibility sections", "M"],
    "ci-workflow": ["Put the checks in CI", "S"],
    "gaps-file": ["List what the system does not have", "S"],
};

export function html(facts, scored, history = []) {
    const band = BAND(scored.total, scored.max);
    const rows = scored.dimensions.map((d) => dimensionRow(d)).join("\n");
    const todo = buildTodo(scored);
    const trend = history.length > 1 ? history.map((h) => h.total) : null;
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(facts.name)} — agent readiness</title>
<style>
:root{
  --paper:#fbfbfc;--card:#fff;--ink:#111318;--muted:#5b6472;--faint:#8b94a2;
  --line:#e5e8ed;--rail:#eef0f4;--accent:#1f5fd0;--accent-soft:#e9f0fd;
  --strong:#17795c;--fair:#1f5fd0;--weak:#a2650b;--poor:#a8352c;
  --sans:"Inter var",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root{
  --paper:#0d0f13;--card:#14171d;--ink:#e8ebf0;--muted:#98a1b0;--faint:#6b7482;
  --line:#222731;--rail:#1b1f27;--accent:#6ea1ff;--accent-soft:#16233a;
  --strong:#43c39a;--fair:#6ea1ff;--weak:#d9a13f;--poor:#e2726a;
}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:900px;margin:0 auto;padding:clamp(28px,5vw,64px) clamp(18px,4vw,32px) 80px;display:flex;flex-direction:column;gap:44px}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
h1{font-size:clamp(26px,4vw,36px);line-height:1.12;letter-spacing:-.02em;margin:.35em 0 0;text-wrap:balance}
h2{font-size:15px;letter-spacing:-.01em;margin:0}
.hero{display:flex;flex-direction:column;gap:22px}
.verdict{font-size:clamp(18px,2.4vw,22px);line-height:1.4;margin:0;color:var(--ink);max-width:58ch}
.total{display:flex;align-items:flex-end;gap:14px;font-family:var(--mono);font-variant-numeric:tabular-nums}
.total b{font-size:clamp(48px,9vw,76px);font-weight:500;line-height:.9;letter-spacing:-.03em;color:var(--${band})}
.total span{font-size:16px;color:var(--faint);padding-bottom:6px}
.meta{display:flex;flex-wrap:wrap;gap:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:14px 0}
.meta div{padding-right:24px;margin-right:24px;border-right:1px solid var(--rail)}
.meta div:last-child{border:0;margin:0;padding:0}
.meta b{display:block;font-family:var(--mono);font-size:15px;font-variant-numeric:tabular-nums}
.meta span{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
section{display:flex;flex-direction:column;gap:18px}
.section-head{border-bottom:1px solid var(--line);padding-bottom:10px;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
.section-head p{margin:0;color:var(--faint);font-size:13.5px;flex:1;min-width:220px}
.dim{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:18px 20px;display:flex;flex-direction:column;gap:12px}
.dim-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.dim-top h3{margin:0;font-size:15.5px;letter-spacing:-.01em;flex:1;min-width:170px}
.meter{display:flex;gap:3px}
.meter i{width:22px;height:8px;border-radius:2px;background:var(--rail)}
.meter i.on{background:var(--accent)}
.dim[data-score="5"] .meter i.on{background:var(--strong)}
.dim[data-score="1"] .meter i.on{background:var(--poor)}
.dim[data-score="3"] .meter i.on{background:var(--weak)}
.num{font-family:var(--mono);font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums;min-width:34px;text-align:right}
.q{margin:0;color:var(--muted);font-size:14px}
.ev{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px;font-size:13.5px;color:var(--muted)}
.ev li{padding-left:14px;position:relative}
.ev li::before{content:"";position:absolute;left:0;top:.62em;width:5px;height:1px;background:var(--faint)}
.at{font-size:13px;color:var(--faint);border-left:2px solid var(--rail);padding-left:12px}
.at b{color:var(--ink);font-weight:600}
ol.todo{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;counter-reset:t}
ol.todo li{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:13px 16px;display:flex;gap:12px;align-items:flex-start}
ol.todo input{margin:3px 0 0;accent-color:var(--accent);width:15px;height:15px}
.todo-main{flex:1;min-width:0}
.todo-main b{font-weight:600;font-size:14.5px}
.todo-main p{margin:2px 0 0;color:var(--muted);font-size:13.5px}
.todo-main code{font-family:var(--mono);font-size:12px;background:var(--accent-soft);color:var(--accent);padding:2px 6px;border-radius:4px}
.size{font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--faint);border:1px solid var(--line);border-radius:3px;padding:3px 7px}
.done .todo-main b{text-decoration:line-through;color:var(--faint)}
.badge{font-family:var(--mono);font-size:12px;background:var(--card);border:1px solid var(--line);border-radius:7px;padding:12px 14px;overflow-x:auto;white-space:pre}
footer{border-top:1px solid var(--line);padding-top:16px;color:var(--faint);font-family:var(--mono);font-size:11px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
a{color:var(--accent)}
@media print{body{background:#fff}.dim,ol.todo li{break-inside:avoid}}
</style></head>
<body><div class="wrap">

<header class="hero">
  <div>
    <div class="eyebrow">Agent readiness · rubric ${RUBRIC.version} · ${new Date().toISOString().slice(0, 10)}</div>
    <h1>${esc(facts.name)}${facts.version ? ` <span style="color:var(--faint);font-weight:400">${esc(facts.version)}</span>` : ""}</h1>
  </div>
  <div class="total"><b>${scored.total}</b><span>/ ${scored.max}</span></div>
  <p class="verdict">${VERDICT[band]}</p>
  <div class="meta">
    <div><b>${facts.coverage.documented}/${facts.coverage.total}</b><span>components documented</span></div>
    <div><b>${facts.guides.length}</b><span>guides</span></div>
    <div><b>${facts.freshness.blocks}</b><span>code blocks</span></div>
    <div><b>${facts.freshness.unknownCount}</b><span>imports that don't exist</span></div>
    <div><b>${stackLabel(facts.stack)}</b><span>stack</span></div>
  </div>
</header>

<section>
  <div class="section-head"><h2>The nine dimensions</h2><p>Each one is scored 1, 3 or 5 from what is in the repository. The evidence under each row is what produced the number.</p></div>
  ${rows}
</section>

<section>
  <div class="section-head"><h2>What to do, in order</h2><p>Cheapest first. Ticking a box is saved in this browser only.</p></div>
  <ol class="todo">${todo}</ol>
</section>

<section>
  <div class="section-head"><h2>Keep the score</h2><p>Commit <code>.adsa/score.json</code>, gate it in CI, and put the badge in your README so a drop is visible.</p></div>
  <div class="badge">![Agent-ready](https://img.shields.io/badge/agent--ready-${scored.total}%2F${scored.max}-${badgeColor(band)})</div>
  ${trend ? `<p class="at">Score history: <b>${trend.join(" → ")}</b></p>` : ""}
</section>

<footer><span>adsa · agentic design system audit</span><span>${SIGNATURE}</span></footer>
</div>
<script>
(function(){
  var KEY = "adsa-todo:" + document.title;
  var done = {};
  try { done = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
  document.querySelectorAll("ol.todo li").forEach(function (li) {
    var box = li.querySelector("input");
    var id = li.dataset.fix;
    box.checked = Boolean(done[id]);
    li.classList.toggle("done", box.checked);
    box.addEventListener("change", function () {
      done[id] = box.checked;
      li.classList.toggle("done", box.checked);
      try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) {}
    });
  });
})();
</script>
</body></html>
`;
}

function dimensionRow(d) {
    if (d.skipped) {
        return `<article class="dim" data-score="skip"><div class="dim-top"><h3>${esc(d.title)}</h3><span class="num">skipped</span></div></article>`;
    }
    const cells = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= d.score ? "on" : ""}"></i>`).join("");
    return `<article class="dim" data-score="${d.score}">
  <div class="dim-top"><h3>${esc(d.title)}</h3><div class="meter">${cells}</div><span class="num">${d.score} / 5</span></div>
  <p class="q">${esc(d.question)}</p>
  <ul class="ev">${d.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
  ${d.next ? `<p class="at"><b>To reach ${d.score === 1 ? 3 : 5}:</b> ${esc(d.next)}</p>` : `<p class="at"><b>At 5.</b> ${esc(d.level)}</p>`}
</article>`;
}

function buildTodo(scored) {
    const items = [];
    for (const d of scored.dimensions) {
        for (const fix of d.fixes) {
            const [label, size] = FIX_LABELS[fix] || [fix, "M"];
            items.push({ fix, label, size, dim: d.title, gain: 5 - d.score });
        }
    }
    const order = { S: 0, M: 1, L: 2 };
    items.sort((a, b) => order[a.size] - order[b.size] || b.gain - a.gain);
    if (!items.length) return `<li><div class="todo-main"><b>Nothing outstanding.</b><p>Every dimension is at 5. Re-run after the next release to make sure it stays there.</p></div></li>`;
    return items
        .map(
            (i) => `<li data-fix="${i.fix}"><input type="checkbox" aria-label="${esc(i.label)} done"><div class="todo-main"><b>${esc(i.label)}</b><p>${esc(i.dim)}, +${i.gain} available · run <code>adsa fix ${i.fix}</code></p></div><span class="size">${i.size}</span></li>`,
        )
        .join("");
}

function stackLabel(stack) {
    const bits = [stack.react && "React", stack.vue && "Vue", stack.svelte && "Svelte", stack.typescript && "TS", stack.tailwind && "Tailwind", stack.storybook && "Storybook"].filter(Boolean);
    return bits.join(" · ") || "unknown";
}

function badgeColor(band) {
    return { strong: "17795c", fair: "1f5fd0", weak: "a2650b", poor: "a8352c" }[band];
}

export function markdown(facts, scored) {
    const band = BAND(scored.total, scored.max);
    const lines = [
        `# ${facts.name} — agent readiness`,
        "",
        `**${scored.total} / ${scored.max}** · rubric ${RUBRIC.version} · ${new Date().toISOString().slice(0, 10)}`,
        "",
        VERDICT[band],
        "",
        `| Dimension | Score | Evidence |`,
        `| :-- | :-- | :-- |`,
    ];
    for (const d of scored.dimensions) {
        if (d.skipped) {
            lines.push(`| ${d.title} | skipped | — |`);
            continue;
        }
        lines.push(`| ${d.title} | ${d.score} / 5 | ${d.evidence.join(" ").replace(/\|/g, "\\|")} |`);
    }
    lines.push("", "## What to do, in order", "");
    const items = scored.dimensions.flatMap((d) => d.fixes.map((f) => ({ f, d })));
    if (!items.length) lines.push("- Nothing outstanding. Re-run after the next release.");
    for (const { f, d } of items) {
        const [label, size] = FIX_LABELS[f] || [f, "M"];
        lines.push(`- [ ] **${label}** (${size}) — ${d.title}, +${5 - d.score} available. \`adsa fix ${f}\``);
    }
    lines.push("", "---", "", "*From one designer to designers with love <3*", "");
    return lines.join("\n");
}

function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
