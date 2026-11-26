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
 * Your headlights.svg split into lamp + four beams, so the beams can grow out of the lamp.
 * Coordinates are that file's own (inside its group transform), so `amount` 1 matches the
 * static icon exactly. `amount`: 0 = lights off (lamp only), 1 = all beams out. The beams grow
 * one after another, top to bottom, each from the lamp face outwards.
 */
const LIGHTS_FILE = "headlights.svg";
const LIGHTS_LAMP =
	"m 13446.367,7975.7758 v 20.4 c -4,-0.3 -11.4,-1.4 -19.2,-5.6 -3.2,-1.7 -5.8,-3.6 -8,-5.5 -5.9,-5.1 -5.9,-13.7 0,-18.8 2.2,-1.9 4.8,-3.8 8,-5.5 7.8,-4.1 15.1,-5.2 19.2,-5.6 v 20.6";
const LIGHTS_BEAMS = [
	"11354.42,6258.91 11354.42,6263.51 11330.62,6266.01 11330.62,6261.41",
	"11354.42,6269.51 11354.42,6274.21 11330.62,6276.71 11330.62,6272.11",
	"11354.42,6280.21 11354.42,6284.91 11330.62,6287.41 11330.62,6282.81",
	"11354.42,6290.91 11354.42,6295.61 11330.62,6298.11 11330.62,6293.51",
];
const BEAM_BASE_X = 11330.62; // the end of each beam nearest the lamp

export function animatedLightsSvg(color: string, cx: number, cy: number, size: number, amount: number): string | null {
	if (!load(LIGHTS_FILE)) return null;
	const b = boxOf(LIGHTS_FILE);
	const s = size / Math.max(b.w, b.h);
	const tx = cx - (b.x + b.w / 2) * s;
	const ty = cy - (b.y + b.h / 2) * s;
	let beams = "";
	LIGHTS_BEAMS.forEach((points, i) => {
		// Each beam has its own slice of the animation, overlapping the next for a smooth ripple.
		const start = i * 0.15;
		const k = Math.max(0, Math.min(1, (amount - start) / 0.55));
		if (k <= 0.001) return;
		beams +=
			`<g transform="matrix(0.39677592,0,0,1,8959.2497,1695.9658)">` +
			`<polygon points="${points}" fill="${color}" transform="translate(${BEAM_BASE_X} 0) scale(${k.toFixed(3)} 1) translate(${-BEAM_BASE_X} 0)"/>` +
			`</g>`;
	});
	return (
		`<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})">` +
		`<g transform="matrix(0.91530477,0,0,0.91530477,-12256.777,-7255.5055)">` +
		`<path d="${LIGHTS_LAMP}" fill="${color}"/>` +
		beams +
		`</g></g>`
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
