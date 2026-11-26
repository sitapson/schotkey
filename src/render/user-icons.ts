/**
 * Icons supplied as SVG files (com.sctelemetry.deck.sdPlugin/imgs/icons/), drawn white on an
 * 89.0625×89.0625 page. They're read once, cleaned of editor metadata (Inkscape/Illustrator),
 * and inlined into key images, recoloured for the key's state.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Which supplied file replaces which built-in icon. */
export const USER_ICON_FILES: Record<string, string> = {
	gear: "landing-gear.svg",
	lights: "headlights.svg",
	shippower: "power.svg",
	coupled: "coupled.svg",
};

const PAGE = 89.0625;
let iconDir = "";
const cache = new Map<string, string | null>();

export function setUserIconDir(dir: string): void {
	iconDir = dir;
	cache.clear();
	bounds = null;
}

/** The icon's drawable content with white replaced by a placeholder, or null if unavailable. */
function load(file: string): string | null {
	if (cache.has(file)) return cache.get(file)!;
	let body: string | null = null;
	const path = join(iconDir, file);
	if (iconDir && existsSync(path)) {
		let svg = readFileSync(path, "utf8");
		svg = svg
			.replace(/<\?xml[\s\S]*?\?>/g, "")
			.replace(/<!--[\s\S]*?-->/g, "")
			// Inkscape's settings block can contain child tags (<inkscape:page/>), so remove the
			// whole paired block first, then any self-closing or stray editor tags left over.
			.replace(/<sodipodi:namedview\b[\s\S]*?<\/sodipodi:namedview>/g, "")
			.replace(/<\/?(sodipodi|inkscape):[^>]*>/g, "")
			.replace(/<style[\s\S]*?<\/style>/g, "")
			.replace(/<defs[\s\S]*?(<\/defs>|\/>)/g, "")
			// Editor attributes use namespaces we drop, so they'd make the inlined XML invalid.
			.replace(/\s(inkscape|sodipodi|xml):[\w-]+="[^"]*"/g, "")
			.replace(/\sclass="[^"]*"/g, "");
		const start = svg.indexOf(">", svg.indexOf("<svg")) + 1;
		const end = svg.lastIndexOf("</svg>");
		if (start > 0 && end > start) body = svg.slice(start, end).replace(/#ffffff|#fff\b/gi, "__ICON_COLOR__");
	}
	cache.set(file, body);
	return body;
}

interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}
let bounds: Record<string, Box> | null = null;

/** The artwork's drawn area on its page (from bounds.json, written by scripts/measure-icons.mjs). */
function boxOf(file: string): Box {
	if (!bounds) {
		const path = join(iconDir, "bounds.json");
		try {
			bounds = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
		} catch {
			bounds = {};
		}
	}
	return bounds![file] ?? { x: 0, y: 0, w: PAGE, h: PAGE };
}

/**
 * Your landing-gear.svg split into moving parts so the gear can swing up and down.
 *
 * The coordinates are taken from that file's path data (its own coordinate space, inside the
 * same two transforms the file uses), so frame 0 lines up with the static icon:
 *   - body bar across the top, fixed
 *   - strut + wheel, rotating about the hinge where the strut meets the bar
 * The up/down arrows are left out while it moves; the motion shows the direction.
 * `angle` is degrees: 0 = gear down (as drawn), about -85 = folded up under the bar.
 */
const GEAR_FILE = "landing-gear.svg";
const GEAR_HINGE = { x: 9411.3, y: 7100.2 };
const GEAR_BAR = "9398.81,7093.33 9436.04,7093.33 9435.10,7097.17 9416.35,7100.36 9406.21,7099.98 9397.87,7097.17";
const GEAR_STRUT = "9406.21,7099.98 9416.35,7100.36 9414.01,7107.95 9411.85,7107.95 9408.47,7118.54 9403.77,7116.48 9406.49,7107.95 9403.68,7107.95";
const GEAR_WHEEL = { x: 9399.93, y: 7131.68, r: 12.645, w: 5.97 }; // ring: outer 15.63, inner 9.66

export function animatedGearSvg(color: string, cx: number, cy: number, size: number, angle: number): string | null {
	if (!load(GEAR_FILE)) return null; // only when the supplied icon is present, so the look matches
	const b = boxOf(GEAR_FILE);
	const s = size / Math.max(b.w, b.h);
	const tx = cx - (b.x + b.w / 2) * s;
	const ty = cy - (b.y + b.h / 2) * s;
	const h = GEAR_HINGE;
	return (
		`<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})">` +
		`<g transform="translate(-12321.637,-7954.9749)"><g transform="matrix(0.7001308,0,0,0.7001308,5774.9438,3014.3439)">` +
		`<g transform="rotate(${angle.toFixed(1)} ${h.x} ${h.y})">` +
		`<polygon points="${GEAR_STRUT}" fill="${color}"/>` +
		`<circle cx="${GEAR_WHEEL.x}" cy="${GEAR_WHEEL.y}" r="${GEAR_WHEEL.r}" fill="none" stroke="${color}" stroke-width="${GEAR_WHEEL.w}"/>` +
		`</g>` +
		`<polygon points="${GEAR_BAR}" fill="${color}"/>` +
		`<circle cx="${h.x}" cy="${h.y}" r="2.6" fill="${color}"/>` +
		`</g></g></g>`
	);
}

/**
 * A supplied icon whose artwork is centred at (cx, cy) and scaled to fit a `size`×`size` box,
 * in `color`; null if there isn't one.
 */
export function userIconSvg(icon: string, color: string, cx: number, cy: number, size: number): string | null {
	const file = USER_ICON_FILES[icon];
	const body = file ? load(file) : null;
	if (!body) return null;
	const b = boxOf(file);
	const s = size / Math.max(b.w, b.h);
	const tx = cx - (b.x + b.w / 2) * s;
	const ty = cy - (b.y + b.h / 2) * s;
	return `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})">${body.replaceAll("__ICON_COLOR__", color)}</g>`;
}
