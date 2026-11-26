// Builds a shareable, searchable web page of the telemetry fields from docs/TELEMETRY_FIELDS.json
// (written by scripts/list-fields.mjs). Personal values are removed before anything is embedded:
// the aUEC balance, and the long entity IDs in ship / seat / weapon names.
//
//   node scripts/fields-page.mjs [in.json] [out.html]
import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] ?? "docs/TELEMETRY_FIELDS.json";
const output = process.argv[3] ?? "docs/telemetry-fields.html";
const data = JSON.parse(readFileSync(input, "utf8"));

const PRIVATE = /uec_balance/;
const redact = (path, example) => {
	if (!example) return "";
	if (PRIVATE.test(path)) return "";
	return example.replace(/_\d{9,}/g, "_…"); // entity IDs like _123456789012
};
const kind = (type) =>
	type.startsWith("list of ") && /^list of [A-Z]/.test(type) ? "group"
	: /enum/.test(type) ? "enum"
	: /bool/.test(type) ? "bool"
	: /float|double|int|fixed/.test(type) ? "number"
	: /string/.test(type) ? "text"
	: "other";

const rows = data.sections.flatMap((s) =>
	s.rows.map((r) => ({
		s: s.key,
		p: r.path,
		t: r.type.replace(/^enum /, "").replace(/^list of /, "list · "),
		k: kind(r.type),
		e: redact(r.path, r.example),
	})),
);
const sections = data.sections.map((s) => ({ key: s.key, title: s.title, n: s.rows.length }));
const leafCount = rows.filter((r) => r.k !== "group").length;
const seenCount = rows.filter((r) => r.e).length;

const page = `<title>SC Telemetry Fields</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* Layout: a cockpit reference card. Sticky search + section rail, then one table per system. */
:root {
  --bg: #f3f5f7; --panel: #ffffff; --fg: #17202a; --muted: #5b6875; --line: #dfe4ea;
  --accent: #b36b00; --accent-soft: #fff1db;
  --bool: #2f6f4f; --num: #2b5d9b; --enum: #8a4baf; --text: #6b5b2e; --group: #5b6875;
  --chip-bg: #eef1f4;
  --display: "Chakra Petch", "Segoe UI", system-ui, sans-serif;
  --body: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0f151b; --panel: #151d25; --fg: #e3e9ef; --muted: #93a1ae; --line: #25313c;
  --accent: #f0a63a; --accent-soft: #2b2112;
  --bool: #6fcf97; --num: #7fb2f0; --enum: #c99bea; --text: #d9c38a; --group: #93a1ae;
  --chip-bg: #1d2731; color-scheme: dark;
} }
:root[data-theme="dark"] {
  --bg: #0f151b; --panel: #151d25; --fg: #e3e9ef; --muted: #93a1ae; --line: #25313c;
  --accent: #f0a63a; --accent-soft: #2b2112;
  --bool: #6fcf97; --num: #7fb2f0; --enum: #c99bea; --text: #d9c38a; --group: #93a1ae;
  --chip-bg: #1d2731; color-scheme: dark;
}
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--fg); font: 15px/1.55 var(--body); }
.wrap { max-width: 1080px; margin: 0 auto; padding-block: 28px 64px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header h1 { font: 600 clamp(1.7rem, 4vw, 2.4rem)/1.1 var(--display); letter-spacing: .01em; margin: 0 0 8px; text-wrap: balance; }
header h1 .tag { color: var(--accent); }
.lede { color: var(--muted); max-width: 68ch; margin: 0 0 18px; }
.facts { display: flex; flex-wrap: wrap; gap: 8px 18px; font: 500 12px/1.4 var(--mono); color: var(--muted); margin-bottom: 22px; }
.facts b { color: var(--fg); font-weight: 500; }
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg);
  padding-block: 10px; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
.search { flex: 1 1 260px; min-width: 0; position: relative; }
.search input { width: 100%; font: 14px var(--mono); padding: 9px 12px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--panel); color: var(--fg); }
.search input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.rail { display: flex; flex-wrap: wrap; gap: 6px; }
.rail a { font: 600 12px/1 var(--display); text-transform: uppercase; letter-spacing: .06em; color: var(--muted); text-decoration: none;
  padding: 7px 9px; border-radius: 6px; background: var(--chip-bg); }
.rail a:hover, .rail a:focus-visible { color: var(--accent); outline: none; }
.count { font: 12px var(--mono); color: var(--muted); }
section { margin-top: 30px; scroll-margin-top: 80px; }
h2 { font: 600 1.15rem/1.2 var(--display); text-transform: uppercase; letter-spacing: .08em; margin: 0 0 10px; display: flex; gap: 10px; align-items: baseline; }
h2 small { font: 500 12px var(--mono); color: var(--muted); text-transform: none; letter-spacing: 0; }
.tablebox { overflow-x: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
table { width: 100%; border-collapse: collapse; min-width: 640px; }
th { text-align: left; font: 600 11px/1 var(--display); text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
  padding: 10px 12px; border-bottom: 1px solid var(--line); }
td { padding: 7px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
tr:last-child td { border-bottom: 0; }
tr.group td { background: var(--chip-bg); }
.path { font: 13px/1.45 var(--mono); word-break: break-all; }
.path .dim { color: var(--muted); }
.path .n { color: var(--accent); font-weight: 500; }
.copy { margin-left: 6px; font: 600 10px/1 var(--display); letter-spacing: .06em; text-transform: uppercase; color: var(--muted);
  background: none; border: 1px solid var(--line); border-radius: 5px; padding: 3px 6px; cursor: pointer; vertical-align: 1px; }
.copy:hover, .copy:focus-visible { color: var(--accent); border-color: var(--accent); outline: none; }
.type { font: 500 12px var(--mono); white-space: nowrap; }
.type::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 2px; margin-right: 7px; background: currentColor; vertical-align: 1px; }
.k-bool { color: var(--bool); } .k-number { color: var(--num); } .k-enum { color: var(--enum); } .k-text { color: var(--text); } .k-group, .k-other { color: var(--group); }
.ex { font: 12px/1.45 var(--mono); color: var(--fg); word-break: break-all; font-variant-numeric: tabular-nums; }
.ex.none { color: var(--muted); }
.empty { padding: 18px 12px; color: var(--muted); }
.enums td:nth-child(3) { font: 12px/1.7 var(--mono); }
.chip { display: inline-block; background: var(--chip-bg); border-radius: 4px; padding: 0 6px; margin: 2px 4px 2px 0; }
.note { margin-top: 34px; padding: 14px 16px; background: var(--accent-soft); border-radius: 10px; font-size: 14px; max-width: 80ch; }
.note b { font-family: var(--display); letter-spacing: .03em; }
mark { background: var(--accent-soft); color: inherit; border-radius: 2px; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
</style>

<div class="wrap">
  <header>
    <h1>SC Telemetry <span class="tag">Fields</span></h1>
    <p class="lede">Every field Star Citizen's local telemetry stream can send. The game streams a full snapshot about 18 times a second. Paths are dotted; in lists, replace <span class="path"><span class="n">N</span></span> with 0, 1, 2…</p>
    <div class="facts">
      <span>method <b>${data.method}</b></span>
      <span>endpoint <b>127.0.0.1:2942</b></span>
      <span>build <b>LIVE 4.10.201.48085</b></span>
      <span><b>${leafCount}</b> fields · <b>${data.enums.length}</b> enums</span>
      <span>examples <b>${seenCount}</b> seen in an Alpha Wolf</span>
    </div>
  </header>

  <div class="bar">
    <label class="search" for="q"><input id="q" type="search" placeholder="Filter, e.g. gear, shield, fuel, annunciator" autocomplete="off" aria-label="Filter fields"></label>
    <nav class="rail" aria-label="Sections">${sections.map((s) => `<a href="#${s.key.replace(/_/g, "-")}">${s.title}</a>`).join("")}<a href="#enums">Enums</a></nav>
    <span class="count" id="count" aria-live="polite"></span>
  </div>

  <div id="sections"></div>

  <section id="enums">
    <h2>Enum values <small>sent as prefix + value, e.g. VEHICLE_COMPONENT_DEPLOYMENT_STATE_DEPLOYED</small></h2>
    <div class="tablebox"><table class="enums">
      <thead><tr><th>Enum</th><th>Prefix</th><th>Values</th></tr></thead>
      <tbody>${data.enums
				.map((e) => `<tr><td class="path">${e.name}</td><td class="path dim">${e.prefix}</td><td>${e.values.map((v) => `<span class="chip">${v}</span>`).join("")}</td></tr>`)
				.join("")}</tbody>
    </table></div>
  </section>

  <p class="note"><b>Notes.</b> Read from the schema built into the game, so this lists everything the stream <em>can</em> send. Fields with no example weren't sent during the recording: doors (the Wolf has none), turret (not in a turret seat) and events (only sent when something happens). LIVE's feed has no shield percentage or hull health. Personal values (balance, entity IDs) are removed. Enable with <span class="path">server.game.telemetry.enabled = 1</span> and <span class="path">grpc.client.server.enabled = 1</span> in <span class="path">LIVE\\user.cfg</span>. Unofficial; CIG hasn't said whether fan tools may use this feed.</p>
</div>

<script>
const SECTIONS = ${JSON.stringify(sections)};
const ROWS = ${JSON.stringify(rows)};
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function fmtPath(p, q) {
  const parts = p.split(".");
  const last = parts.pop();
  let html = parts.map((x) => (x === "N" ? '<span class="n">N</span>' : esc(x))).join(".");
  html = (html ? '<span class="dim">' + html + ".</span>" : "") + (last === "N" ? '<span class="n">N</span>' : esc(last));
  if (q) {
    // Highlight matches in text nodes only.
    const re = new RegExp("(" + q.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&") + ")", "gi");
    html = html.replace(/>([^<]+)</g, (m, t) => ">" + t.replace(re, "<mark>$1</mark>") + "<").replace(/^([^<]+)/, (m, t) => t.replace(re, "<mark>$1</mark>"));
  }
  return html;
}
function render() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  let shown = 0;
  const out = SECTIONS.map((s) => {
    const rows = ROWS.filter((r) => r.s === s.key && (!q || (r.p + " " + r.t + " " + r.e).toLowerCase().includes(q)));
    shown += rows.filter((r) => r.k !== "group").length;
    if (q && !rows.length) return "";
    const body = rows.length
      ? rows.map((r) => '<tr class="' + (r.k === "group" ? "group" : "") + '"><td class="path">' + fmtPath(r.p, q) +
          (r.k === "group" ? "" : '<button class="copy" type="button" data-path="' + esc(r.p) + '">Copy</button>') +
          '</td><td><span class="type k-' + r.k + '">' + esc(r.t) + "</span></td><td class=\\"ex" + (r.e ? "" : " none") + '">' + (r.e ? esc(r.e) : r.k === "group" ? "" : "not seen") + "</td></tr>").join("")
      : '<tr><td colspan="3" class="empty">No fields.</td></tr>';
    return '<section id="' + s.key.replace(/_/g, "-") + '"><h2>' + esc(s.title) + " <small>" + s.n + " entries</small></h2>" +
      '<div class="tablebox"><table><thead><tr><th>Field</th><th>Type</th><th>Example</th></tr></thead><tbody>' + body + "</tbody></table></div></section>";
  }).join("");
  document.getElementById("sections").innerHTML = out || '<p class="empty">Nothing matches "' + esc(q) + '".</p>';
  document.getElementById("count").textContent = q ? shown + " match" + (shown === 1 ? "" : "es") : "";
}
document.getElementById("q").addEventListener("input", render);
document.addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".copy");
  if (!btn) return;
  const path = btn.dataset.path;
  try { await navigator.clipboard.writeText(path); btn.textContent = "Copied"; }
  catch {
    const r = document.createRange(); r.selectNodeContents(btn.parentElement);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); btn.textContent = "Selected";
  }
  setTimeout(() => (btn.textContent = "Copy"), 1400);
});
render();
</script>
`;

writeFileSync(output, page);
console.log(`Wrote ${output}: ${rows.length} rows (${leafCount} fields, ${seenCount} with examples), ${data.enums.length} enums`);
