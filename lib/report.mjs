/**
 * The report: one self-contained HTML file laid out as a dashboard, plus a markdown
 * twin. No external fonts, scripts or stylesheets — it gets committed into somebody
 * else's repository and has to open from disk, offline, years from now.
 *
 * Every figure comes from the scan. Nothing here estimates, rounds up, or invents a
 * metric to fill a panel.
 */
import { RUBRIC } from "./score.mjs";

const SIGNATURE = "From one designer to designers with love &lt;3";

const A11Y_STAT_LABEL = {
    web: "keyboard",
    "react-native": "VoiceOver/TalkBack",
    swift: "VoiceOver/Dynamic Type",
    android: "TalkBack",
};

/** The author's mark: two sparkles drawn as one thick contour. Inline, so the file stays self-contained. */
const MARK = `<svg class="mark" viewBox="0 0 120 76" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="14" stroke-linejoin="round" transform="translate(10.0,10.0)"><path d="M 28 0 C 29.8032 15.12 40.88 26.1968 56 28 C 40.88 29.8032 29.8032 40.88 28 56 C 26.1968 40.88 15.12 29.8032 0 28 C 15.12 26.1968 26.1968 15.12 28 0 Z"/><path d="M 72 0 C 73.8032 15.12 84.88 26.1968 100 28 C 84.88 29.8032 73.8032 40.88 72 56 C 70.1968 40.88 59.12 29.8032 44 28 C 59.12 26.1968 70.1968 15.12 72 0 Z"/></g></svg>`;

const BAND = (n, max) => {
    const r = max ? n / max : 0;
    return r >= 0.85 ? "strong" : r >= 0.6 ? "fair" : r >= 0.35 ? "weak" : "poor";
};

const VERDICT = {
    strong: ["Agent-ready", "Agents can work in this system. Keep the gates that make that true."],
    fair: ["Good foundation", "The bones are right. The gaps left are the ones that let an agent invent things."],
    weak: ["Gaps to address", "An agent will produce plausible, wrong UI here more often than not."],
    poor: ["Not ready", "There is nothing here for an agent to follow, so it will follow its own habits."],
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
    const [verdictTitle, verdictLine] = VERDICT[band];
    const scoredDims = scored.dimensions.filter((d) => !d.skipped);
    const weakest = [...scoredDims].sort((a, b) => a.score - b.score).slice(0, 3);
    const todo = buildTodo(scored);
    const trend = history.filter((h) => h && h.total != null).slice(-8);
    const previous = trend.length > 1 ? trend[trend.length - 2] : null;
    const delta = previous ? scored.total - previous.total : null;
    const undocumented = Math.max(facts.coverage.total - facts.coverage.documented, 0);

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(facts.name)} — agent readiness</title>
<style>
:root{
  --paper:#f4f3ee;--panel:#ffffff;--sunk:#faf9f5;
  --ink:#15180f;--ink-2:#4d5344;--ink-3:#82887a;
  --line:#e3e1d6;--line-2:#eeece4;
  --green:#1d5b37;--green-tint:#e3ece1;
  --amber:#9c6a15;--amber-tint:#f3ead7;
  --red:#ac3823;--red-tint:#f6e2dc;
  --sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  color-scheme:light;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2{margin:0;letter-spacing:-0.018em;font-weight:600}
p{margin:0}
a{color:var(--green)}
code{font-family:var(--mono);font-size:.86em;background:var(--sunk);border:1px solid var(--line-2);border-radius:4px;padding:1px 5px}
::selection{background:var(--green);color:#fff}

.app{display:grid;grid-template-columns:236px minmax(0,1fr);max-width:1340px;margin:0 auto;min-height:100vh}

.rail{border-right:1px solid var(--line);padding:28px 24px;display:flex;flex-direction:column;gap:26px;position:sticky;top:0;align-self:start;height:100vh}
.brand{display:flex;align-items:center;gap:9px;font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.mark{width:26px;height:auto;color:var(--ink);flex:none}
.who b{display:block;font-size:16px;font-weight:600;letter-spacing:-0.02em;word-break:break-word}
.who span{font-family:var(--mono);font-size:12px;color:var(--ink-3)}
.railscore{display:flex;align-items:baseline;gap:7px;margin-bottom:9px}
.railscore b{font-size:36px;line-height:1;letter-spacing:-0.035em;font-variant-numeric:tabular-nums}
.railscore span{font-family:var(--mono);font-size:12px;color:var(--ink-3)}
.pill{display:inline-block;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px}
.pill.strong,.pill.fair{background:var(--green-tint);color:var(--green)}
.pill.weak{background:var(--amber-tint);color:var(--amber)}
.pill.poor{background:var(--red-tint);color:var(--red)}
.rail nav{display:flex;flex-direction:column}
.rail nav a{display:flex;justify-content:space-between;gap:10px;padding:7px 10px;margin:0 -10px;border-radius:7px;text-decoration:none;color:var(--ink-2);font-size:14px}
.rail nav a:hover{background:var(--sunk);color:var(--ink)}
.rail nav a[aria-current="true"]{background:var(--green-tint);color:var(--green);font-weight:600}
.rail nav a i{font-style:normal;font-family:var(--mono);font-size:11.5px;color:var(--ink-3)}
.rail .foot{margin-top:auto;font-size:12px;color:var(--ink-3);line-height:1.55}
.rail .foot a{text-decoration:none}

main{padding:28px clamp(20px,3vw,40px) 56px;display:flex;flex-direction:column;gap:16px;min-width:0}
.top{display:flex;flex-wrap:wrap;gap:16px 28px;align-items:flex-start;justify-content:space-between;margin-bottom:6px}
.top h1{font-size:21px}
.top .meta{font-family:var(--mono);font-size:12px;color:var(--ink-3);margin-top:5px}
.verdict{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:12px 15px;max-width:400px}
.verdict b{display:block;font-size:14px}
.verdict p{font-size:13.5px;color:var(--ink-2);margin-top:2px}

.grid{display:grid;gap:14px;align-items:start}
.gscore{grid-template-columns:minmax(0,320px) minmax(0,1fr)}
.g3{grid-template-columns:repeat(3,minmax(0,1fr))}
.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.g2{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}

.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px;min-width:0}
.panel > header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:14px}
.panel h2{font-size:14px}
.panel > header span{font-family:var(--mono);font-size:11.5px;color:var(--ink-3);white-space:nowrap}

.stat b{display:block;font-size:28px;line-height:1.08;letter-spacing:-0.03em;font-variant-numeric:tabular-nums}
.stat span{font-size:13.5px;color:var(--ink-2)}
.stat em{font-style:normal;display:block;font-size:12px;color:var(--ink-3);margin-top:4px;line-height:1.45}
.stat.good b{color:var(--green)}
.stat.warn b{color:var(--amber)}
.stat.bad b{color:var(--red)}

.ring-panel{display:flex;align-items:center;gap:18px}
.ring{width:104px;height:104px;border-radius:50%;flex:none;display:grid;place-items:center;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.ring-hole{width:76px;height:76px;border-radius:50%;background:var(--panel)}
.ring-copy b{display:block;font-size:30px;line-height:1.05;letter-spacing:-0.035em;font-variant-numeric:tabular-nums}
.ring-copy b span{font-size:16px;color:var(--ink-3);letter-spacing:0}
.ring-copy > span{display:block;font-size:13.5px;color:var(--ink-2);margin-top:2px}
.ring-copy em{font-style:normal;display:block;font-size:12px;color:var(--ink-3);margin-top:5px}
.legend.key{margin-top:16px;padding-top:14px;border-top:1px solid var(--line-2);font-size:12.5px;color:var(--ink-3)}
.coverage{display:flex;height:9px;border-radius:5px;overflow:hidden;background:var(--line-2);margin-bottom:12px}
.legend{display:flex;flex-wrap:wrap;gap:18px;font-size:13.5px;color:var(--ink-2)}
.legend span{display:flex;align-items:center;gap:7px}
.legend s{width:9px;height:9px;border-radius:3px;display:block;text-decoration:none}

.bars{display:flex;flex-direction:column;gap:10px}
.bar{display:grid;grid-template-columns:minmax(0,1fr) 132px 36px;gap:14px;align-items:center;font-size:13.5px}
.track{height:8px;border-radius:4px;background:var(--line-2);overflow:hidden}
.track i{display:block;height:100%;border-radius:4px}
.v{font-family:var(--mono);font-size:12px;color:var(--ink-3);text-align:right;font-variant-numeric:tabular-nums}
.s5{background:var(--green)}
.s3{background:var(--amber)}
.s1{background:var(--red)}

.issues{display:flex;flex-direction:column}
.issue{display:flex;gap:11px;align-items:flex-start;padding:11px 0;border-bottom:1px solid var(--line-2)}
.issue:first-child{padding-top:0}
.issue:last-child{border-bottom:0;padding-bottom:0}
.issue .dot{width:8px;height:8px;border-radius:50%;margin-top:7px;flex:none}
.issue b{font-size:13.5px;display:block}
.issue p{font-size:13px;color:var(--ink-2)}
.issue .tag{margin-left:auto;font-family:var(--mono);font-size:11.5px;color:var(--ink-3);white-space:nowrap;padding-top:2px}

.dims{display:flex;flex-direction:column;gap:10px}
details.dim{background:var(--panel);border:1px solid var(--line);border-radius:12px}
details.dim > summary{list-style:none;cursor:pointer;padding:15px 18px;display:grid;grid-template-columns:20px minmax(0,1fr) 118px 40px;gap:14px;align-items:center}
details.dim > summary::-webkit-details-marker{display:none}
.chev{color:var(--ink-3);font-family:var(--mono);font-size:13px;transition:transform .18s ease}
details.dim[open] .chev{transform:rotate(90deg)}
details.dim summary b{font-size:14.5px;font-weight:600;display:block}
details.dim summary .q{display:block;font-size:13px;color:var(--ink-3);font-weight:400}
details.dim .body{padding:0 18px 18px 52px;display:flex;flex-direction:column;gap:12px}
.ev{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.ev li{font-size:13.5px;color:var(--ink-2);padding-left:15px;position:relative}
.ev li::before{content:"";position:absolute;left:0;top:.66em;width:6px;height:1px;background:var(--ink-3)}
.next{font-size:13.5px;color:var(--ink-2);background:var(--sunk);border:1px solid var(--line-2);border-radius:9px;padding:11px 13px}
.next b{color:var(--ink)}

ol.todo{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
ol.todo li{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid var(--line);border-radius:10px}
ol.todo input{margin:2px 0 0;width:15px;height:15px;accent-color:var(--green)}
ol.todo .m{flex:1;min-width:0}
ol.todo b{font-size:14px;display:block}
ol.todo p{font-size:13px;color:var(--ink-2);margin-top:1px}
ol.todo .size{font-family:var(--mono);font-size:11px;color:var(--ink-3);border:1px solid var(--line);border-radius:4px;padding:2px 7px}
li.done b{text-decoration:line-through;color:var(--ink-3)}

.snippet{font-family:var(--mono);font-size:12px;background:var(--sunk);border:1px solid var(--line-2);border-radius:9px;padding:12px 14px;overflow-x:auto;white-space:pre;color:var(--ink-2)}
.trend{display:flex;align-items:flex-end;gap:5px;height:54px;margin-bottom:10px}
.trend i{flex:1;background:var(--green-tint);border-radius:3px 3px 0 0}
.trend i:last-child{background:var(--green)}
.delta{font-family:var(--mono);font-size:12px;color:var(--ink-3)}
.delta.up{color:var(--green)}
.delta.down{color:var(--red)}

footer.sig{margin-top:8px;font-family:var(--mono);font-size:11.5px;color:var(--ink-3);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}

@media (max-width:980px){
  .app{grid-template-columns:minmax(0,1fr)}
  .gscore{grid-template-columns:minmax(0,1fr)}
  .g3{grid-template-columns:repeat(3,minmax(0,1fr))}
  .rail{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}
  .rail nav{display:none}
  .g4{grid-template-columns:repeat(2,minmax(0,1fr))}
  .g2{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:560px){
  .g4,.g3{grid-template-columns:minmax(0,1fr)}
  .bar{grid-template-columns:minmax(0,1fr) 70px 36px;gap:10px}
  details.dim > summary{grid-template-columns:18px minmax(0,1fr) 40px;gap:10px}
  details.dim > summary .track{display:none}
  details.dim .body{padding-left:18px}
}
@media print{
  body{background:#fff}
  .rail{position:static;height:auto}
  .panel,ol.todo li,details.dim{break-inside:avoid}
  .chev{display:none}
}
</style></head>
<body>
<div class="app">

<aside class="rail">
  <div class="brand">${MARK}<span>Agent readiness</span></div>
  <div class="who">
    <b>${esc(facts.name)}</b>
    <span>${facts.version ? "v" + esc(facts.version) : "unversioned"}</span>
  </div>
  <div>
    <div class="railscore"><b>${scored.total}</b><span>/ ${scored.max}</span></div>
    <span class="pill ${band}">${verdictTitle}</span>
  </div>
  <nav>
    <a href="#overview">Overview</a>
    <a href="#dimensions">Dimensions <i>${scoredDims.length}</i></a>
    <a href="#fix">What to fix <i>${todo.length}</i></a>
    <a href="#keep">Keep the score</a>
  </nav>
  <div class="foot">Generated by <a href="https://github.com/nrmk13/ADSA">adsa</a><br>rubric ${RUBRIC.version} · ${new Date().toISOString().slice(0, 10)}</div>
</aside>

<main>
  <div class="top" id="overview">
    <div>
      <h1>Report for ${esc(facts.name)}</h1>
      <div class="meta">${facts.guides.length} guides · ${facts.coverage.total} importable components · ${facts.freshness.blocks} code blocks read</div>
    </div>
    <div class="verdict"><b>${verdictTitle}</b><p>${verdictLine}</p></div>
  </div>

  <div class="grid gscore">
    <div class="panel ring-panel ${band}">
      ${ring(scored)}
      <div class="ring-copy">
        <b>${scored.total} <span>/ ${scored.max}</span></b>
        <span>Agent readiness</span>
        <em>${delta === null ? `rubric ${RUBRIC.version}, ${scoredDims.length} dimensions` : `${delta >= 0 ? "+" : ""}${delta} since the last run`}</em>
      </div>
    </div>
    <div class="grid g3">
      ${stat(ratioClass(facts.coverage.ratio), String(facts.coverage.documented), "Components documented", `${pct(facts.coverage.ratio)} of ${facts.coverage.total}${facts.icons ? `, ${facts.icons} icon exports set aside` : ""}`)}
      ${stat(facts.freshness.unknownCount ? "bad" : "good", String(facts.freshness.unknownCount), "Imports that do not exist", facts.freshness.unknownCount ? "Named in the guides, missing from the source" : "Every symbol in the guides is real")}
      ${stat(facts.a11y.ratio >= 0.9 ? "good" : facts.a11y.ratio >= 0.3 ? "warn" : "bad", String(facts.a11y.withSection), `Guides with ${A11Y_STAT_LABEL[facts.platform?.primary] || "keyboard"} docs`, `${pct(facts.a11y.ratio)} of ${facts.a11y.total} guides`)}
    </div>
  </div>

  <div class="grid g2">
    <section class="panel">
      <header><h2>Documentation coverage</h2><span>${facts.coverage.documented} / ${facts.coverage.total}</span></header>
      <div class="coverage" role="img" aria-label="${facts.coverage.documented} documented, ${undocumented} undocumented">
        <i style="flex:${Math.max(facts.coverage.documented, 0.001)};background:var(--green)"></i><i style="flex:${Math.max(undocumented, 0.001)};background:var(--red)"></i>
      </div>
      <div class="legend">
        <span><s style="background:var(--green)"></s>${facts.coverage.documented} with a guide</span>
        <span><s style="background:var(--red)"></s>${undocumented} without</span>
      </div>
      ${facts.coverage.missing.length ? `<p style="margin-top:12px;font-size:13px;color:var(--ink-3)">Undocumented: ${esc(facts.coverage.missing.slice(0, 10).join(", "))}${facts.coverage.missing.length > 10 ? `, and ${facts.coverage.missing.length - 10} more` : ""}.</p>` : ""}
    </section>

    <section class="panel">
      <header><h2>Look at these first</h2><span>lowest three</span></header>
      <div class="issues">${weakest.map(issueRow).join("")}</div>
    </section>
  </div>

  <section class="panel">
    <header><h2>Score by dimension</h2><span>${scored.total} / ${scored.max}</span></header>
    <div class="bars">${scored.dimensions.map(barRow).join("")}</div>
    <div class="legend key">
      <span><s style="background:var(--red)"></s>1 — nothing to follow</span>
      <span><s style="background:var(--amber)"></s>3 — partly there</span>
      <span><s style="background:var(--green)"></s>5 — done, and enforced</span>
    </div>
  </section>

  <section id="dimensions">
    <header style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:10px 2px 12px">
      <h2 style="font-size:14px">The evidence</h2><span style="font-family:var(--mono);font-size:11.5px;color:var(--ink-3)">what produced each number</span>
    </header>
    <div class="dims">${scored.dimensions.map(dimensionCard).join("")}</div>
  </section>

  <section class="panel" id="fix">
    <header><h2>What to do, in order</h2><span>cheapest first</span></header>
    <ol class="todo">${todoRows(todo)}</ol>
  </section>

  <section class="grid g2" id="keep">
    <div class="panel">
      <header><h2>Keep the score</h2><span>.adsa/score.json</span></header>
      <p style="font-size:13.5px;color:var(--ink-2);margin-bottom:12px">Commit the score, gate it in CI, and put the badge in your README so a drop shows up in a diff.</p>
      <div class="snippet">![Agent-ready](https://img.shields.io/badge/agent--ready-${scored.total}%2F${scored.max}-${badgeColor(band)})</div>
    </div>
    <div class="panel">
      <header><h2>History</h2><span>${trend.length} run${trend.length === 1 ? "" : "s"}</span></header>
      ${trendBlock(trend, scored, delta)}
    </div>
  </section>

  <footer class="sig">
    <span>adsa · agentic design system audit</span>
    <span>${SIGNATURE}</span>
  </footer>
</main>
</div>

<script>
(function () {
    // The rail is a table of contents, so it should say where you are.
    var links = [].slice.call(document.querySelectorAll(".rail nav a"));
    var targets = links.map(function (a) { return document.querySelector(a.getAttribute("href")); }).filter(Boolean);
    if (window.IntersectionObserver && targets.length) {
        var seen = {};
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) { seen[e.target.id] = e.isIntersecting; });
            var current = targets.filter(function (t) { return seen[t.id]; })[0];
            links.forEach(function (a) {
                if (current && a.getAttribute("href") === "#" + current.id) a.setAttribute("aria-current", "true");
                else a.removeAttribute("aria-current");
            });
        }, { rootMargin: "-20% 0px -70% 0px" });
        targets.forEach(function (t) { io.observe(t); });
    }

    var KEY = "adsa-todo:" + document.title;
    var done = {};
    try { done = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
    document.querySelectorAll("ol.todo li").forEach(function (li) {
        var box = li.querySelector("input");
        if (!box) return;
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

/* ------------------------------------------------------------------ pieces */

/**
 * The score as a ring built out of the dimensions that produced it: one wedge per
 * dimension, sized by its share of the maximum and coloured by its level. A plain
 * percentage ring would hide which parts are dragging the number down.
 */
function ring(scored) {
    const dims = scored.dimensions.filter((d) => !d.skipped);
    const slice = 100 / dims.length;
    const stops = [];
    let at = 0;
    for (const d of dims) {
        const filled = at + slice * (d.score / 5);
        const colour = d.score >= 5 ? "var(--green)" : d.score >= 3 ? "var(--amber)" : "var(--red)";
        stops.push(`${colour} ${at}% ${filled}%`, `var(--line-2) ${filled}% ${at + slice}%`);
        at += slice;
    }
    return `<div class="ring" role="img" aria-label="${scored.total} out of ${scored.max}" style="background:conic-gradient(from -90deg,${stops.join(",")})"><div class="ring-hole"></div></div>`;
}

function stat(kind, value, label, note) {
    return `<div class="panel stat ${kind}"><b>${esc(value)}</b><span>${esc(label)}</span><em>${esc(note)}</em></div>`;
}

function issueRow(d) {
    const colour = d.score >= 5 ? "var(--green)" : d.score >= 3 ? "var(--amber)" : "var(--red)";
    return `<div class="issue"><span class="dot" style="background:${colour}"></span><div><b>${esc(d.title)}</b><p>${esc(d.evidence[0] || "")}</p></div><span class="tag">${d.score}/5</span></div>`;
}

function barRow(d) {
    if (d.skipped) return `<div class="bar"><span style="color:var(--ink-3)">${esc(d.title)}</span><div class="track"></div><span class="v">skip</span></div>`;
    return `<div class="bar"><span>${esc(d.title)}</span><div class="track"><i class="s${d.score}" style="width:${(d.score / 5) * 100}%"></i></div><span class="v">${d.score}/5</span></div>`;
}

function dimensionCard(d) {
    if (d.skipped) {
        return `<details class="dim"><summary><span class="chev">›</span><span><b>${esc(d.title)}</b><span class="q">Skipped by configuration</span></span><div class="track"></div><span class="v">—</span></summary><div class="body"><p class="next">Skipped, so it lowers the maximum instead of the score.</p></div></details>`;
    }
    return `<details class="dim"${d.score < 5 ? " open" : ""}>
  <summary>
    <span class="chev">›</span>
    <span><b>${esc(d.title)}</b><span class="q">${esc(d.question)}</span></span>
    <div class="track"><i class="s${d.score}" style="width:${(d.score / 5) * 100}%"></i></div>
    <span class="v">${d.score}/5</span>
  </summary>
  <div class="body">
    <ul class="ev">${d.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
    ${
        d.next
            ? `<p class="next"><b>To reach ${d.score === 1 ? 3 : 5}:</b> ${esc(d.next)}${d.fixes.length ? ` <code>adsa fix ${esc(d.fixes[0])}</code>` : ""}</p>`
            : `<p class="next"><b>At 5.</b> ${esc(d.level)}</p>`
    }
  </div>
</details>`;
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
    return items.sort((a, b) => order[a.size] - order[b.size] || b.gain - a.gain);
}

function todoRows(items) {
    if (!items.length) {
        return `<li><div class="m"><b>Nothing outstanding.</b><p>Every dimension is at 5. Re-run after the next release to make sure it stays there.</p></div></li>`;
    }
    return items
        .map(
            (i) =>
                `<li data-fix="${esc(i.fix)}"><input type="checkbox" aria-label="${esc(i.label)} done"><div class="m"><b>${esc(i.label)}</b><p>${esc(i.dim)}, +${i.gain} available · <code>adsa fix ${esc(i.fix)}</code></p></div><span class="size">${i.size}</span></li>`,
        )
        .join("");
}

function trendBlock(trend, scored, delta) {
    if (trend.length < 2) {
        return `<p style="font-size:13.5px;color:var(--ink-2)">First recorded run. The next one compares against ${scored.total}/${scored.max} and shows which dimensions moved.</p>`;
    }
    const max = Math.max(...trend.map((h) => h.max || scored.max));
    const bars = trend.map((h) => `<i style="height:${Math.max((h.total / max) * 100, 4)}%"></i>`).join("");
    const word = delta > 0 ? "up" : delta < 0 ? "down" : "";
    return `<div class="trend" role="img" aria-label="Score history">${bars}</div><p class="delta ${word}">${trend.map((h) => h.total).join(" → ")}${delta ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}</p>`;
}

/* ------------------------------------------------------------------- utils */

const pct = (n) => `${Math.round(n * 100)}%`;

function scoreClass(band) {
    return band === "strong" ? "good" : band === "poor" ? "bad" : "warn";
}

function ratioClass(ratio) {
    return ratio >= 0.9 ? "good" : ratio >= 0.7 ? "warn" : "bad";
}

function badgeColor(band) {
    return { strong: "1d5b37", fair: "1d5b37", weak: "9c6a15", poor: "ac3823" }[band];
}

export function markdown(facts, scored) {
    const band = BAND(scored.total, scored.max);
    const lines = [
        `# ${facts.name} — agent readiness`,
        "",
        `**${scored.total} / ${scored.max}** · ${VERDICT[band][0]} · rubric ${RUBRIC.version} · ${new Date().toISOString().slice(0, 10)}`,
        "",
        VERDICT[band][1],
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
    const items = buildTodo(scored);
    if (!items.length) lines.push("- Nothing outstanding. Re-run after the next release.");
    for (const i of items) lines.push(`- [ ] **${i.label}** (${i.size}) — ${i.dim}, +${i.gain} available. \`adsa fix ${i.fix}\``);
    lines.push("", "---", "", "*From one designer to designers with love <3*", "");
    return lines.join("\n");
}

function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
