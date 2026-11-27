// Measures the drawn area of each supplied icon (imgs/icons/*.svg) so keys can centre and
// scale the artwork itself rather than its page. Uses headless Edge/Chrome to lay out the
// SVGs, then writes imgs/icons/bounds.json. Re-run after adding or editing icons:
//   node scripts/measure-icons.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const dir = "com.sctelemetry.deck.sdPlugin/imgs/icons";
const files = readdirSync(dir).filter((f) => f.endsWith(".svg"));
// Power icons (power.svg, power-*.svg): their first four paths are corner bars the plugin can replace.
const SYMBOL_FILES = readdirSync(dir).filter((f) => /^power(-[\w-]+)?\.svg$/.test(f));
const browser = [
	"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
	"C:/Program Files/Microsoft/Edge/Application/msedge.exe",
	"C:/Program Files/Google/Chrome/Application/chrome.exe",
].find(existsSync);
if (!browser) throw new Error("Needs Microsoft Edge or Chrome installed to measure icons.");

const items = files.map((f) => `<div data-f="${f}">${readFileSync(join(dir, f), "utf8").replace(/<\?xml[\s\S]*?\?>/, "")}</div>`).join("");
const html = `<html><body>${items}<pre id="out"></pre><script>
const out = {};
for (const d of document.querySelectorAll("div[data-f]")) {
  const svg = d.querySelector("svg");
  // Ignore invisible frame rectangles (fill:none) so only artwork counts.
  for (const r of svg.querySelectorAll("rect")) if ((r.getAttribute("style") || "").includes("fill:none")) r.remove();
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  while (svg.firstChild) g.appendChild(svg.firstChild);
  svg.appendChild(g);
  const b = g.getBBox();
  out[d.dataset.f] = { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) };
  // Power icons: four corner bars around a symbol. The plugin replaces the bars with pips (or
  // drops them), so record which shapes they are and the symbol's own area ("file#symbol").
  // The bars are the four shapes whose centres sit farthest from the icon's centre.
  if (${JSON.stringify(SYMBOL_FILES)}.includes(d.dataset.f)) {
    const all = g.getBoundingClientRect();
    const mid = [all.x + all.width / 2, all.y + all.height / 2];
    const shapes = [...g.querySelectorAll("path,polygon,circle,ellipse,rect")].map((el) => {
      const r = el.getBoundingClientRect();
      return { el, d: Math.hypot(r.x + r.width / 2 - mid[0], r.y + r.height / 2 - mid[1]) };
    }).sort((a, b) => b.d - a.d);
    const bars = shapes.slice(0, 4).map((s) => s.el);
    const ids = bars.map((el) => el.id);
    bars.forEach((el) => el.remove());
    const s = g.getBBox();
    out[d.dataset.f + "#symbol"] = { x: +s.x.toFixed(2), y: +s.y.toFixed(2), w: +s.width.toFixed(2), h: +s.height.toFixed(2), bars: ids };
  }
}
document.getElementById("out").textContent = "BOUNDS" + JSON.stringify(out) + "END";
</script></body></html>`;
const tmp = mkdtempSync(join(tmpdir(), "icons-"));
const page = join(tmp, "measure.html");
writeFileSync(page, html);
const dom = execFileSync(browser, ["--headless=new", "--disable-gpu", "--dump-dom", "file:///" + page.replace(/\\/g, "/")], { encoding: "utf8" });
const m = /BOUNDS([\s\S]*?)END/.exec(dom);
if (!m) throw new Error("Could not read measurements from the browser.");
const bounds = JSON.parse(m[1]);
writeFileSync(join(dir, "bounds.json"), JSON.stringify(bounds, null, 2) + "\n");
for (const [f, b] of Object.entries(bounds)) console.log(`${f.padEnd(24)} x=${b.x} y=${b.y} w=${b.w} h=${b.h}`);
