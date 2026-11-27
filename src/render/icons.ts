/**
 * Line icons for SC Hotkey keys. Each is drawn in a 48×48 box (centre 24,24) with strokes,
 * so iconSvg() can place and scale it anywhere on a key.
 */
import { userIconSvg } from "./user-icons";

export type HotkeyIcon =
	| "gear"
	| "lights"
	| "doors"
	| "vtol"
	| "boost"
	| "engines"
	| "shields"
	| "weapons"
	| "coolers"
	| "quantum"
	| "coupled"
	| "cruise"
	| "limiter"
	| "gsafe"
	| "gimbals"
	| "lamp"
	| "shippower"
	| "power";

export const HOTKEY_ICONS: HotkeyIcon[] = ["gear", "lights", "doors", "vtol", "boost", "engines", "shields", "weapons", "coolers", "quantum", "coupled", "cruise", "limiter", "gsafe", "gimbals", "lamp", "shippower", "power"];

// Path data in the 48×48 box. Kept to strokes so one colour styles everything.
const PATHS: Record<HotkeyIcon, string> = {
	// Landing gear: strut, brace, wheel with hub.
	gear: `<path d="M24 3v22M24 12l10 8"/><circle cx="24" cy="34" r="9"/><circle cx="24" cy="34" r="2.5"/>`,
	// Headlight with beams.
	lights: `<path d="M6 14h8c8 0 12 4 12 10s-4 10-12 10H6z"/><path d="M31 15l11-4M31 24h12M31 33l11 4"/>`,
	// Two door halves (normally replaced by the supplied doors.svg).
	doors: `<rect x="6" y="6" width="16" height="36" rx="3"/><rect x="26" y="6" width="16" height="36" rx="3"/><path d="M18 20v8M30 20v8"/>`,
	// Downward thruster nozzle with thrust arrows.
	vtol: `<path d="M12 6h24l-5 15H17z"/><path d="M18 27v13M30 27v13M14 36l4 5 4-5M26 36l4 5 4-5"/>`,
	// Three chevrons.
	boost: `<path d="M7 12l10 12-10 12M19 12l10 12-10 12M31 12l10 12-10 12"/>`,
	// Jet engine from the side with exhaust flame.
	engines: `<path d="M4 17h17l9-5v24l-9-5H4z"/><path d="M34 18c7 2 9 4 9 6s-2 4-9 6"/>`,
	// Shield.
	shields: `<path d="M24 4l16 6v12c0 11-7 19-16 22C15 41 8 33 8 22V10z"/><path d="M17 24l5 5 9-10"/>`,
	// Crosshair.
	weapons: `<circle cx="24" cy="24" r="13"/><path d="M24 3v11M24 34v11M3 24h11M34 24h11"/><circle cx="24" cy="24" r="2"/>`,
	// Snowflake.
	coolers: `<path d="M24 4v40M6.7 14l34.6 20M6.7 34l34.6-20"/><path d="M19 8l5 5 5-5M19 40l5-5 5 5M7 21l7-1-3-6M41 27l-7 1 3 6M7 27l7 1-3 6M41 21l-7-1 3-6"/>`,
	// Atom.
	quantum: `<ellipse cx="24" cy="24" rx="20" ry="7.5"/><ellipse cx="24" cy="24" rx="20" ry="7.5" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="20" ry="7.5" transform="rotate(-60 24 24)"/><circle cx="24" cy="24" r="2.5" fill="currentColor"/>`,
	// Two linked chain links.
	coupled: `<rect x="3" y="15" width="24" height="18" rx="9"/><rect x="21" y="15" width="24" height="18" rx="9"/>`,
	// Speedometer with needle.
	cruise: `<path d="M7 34a17 17 0 1 1 34 0"/><path d="M24 34l9-13"/><circle cx="24" cy="34" r="2.5"/><path d="M11 40h26"/>`,
	// Speedometer with a stop bar across the top of the scale.
	limiter: `<path d="M7 34a17 17 0 1 1 34 0"/><path d="M24 34V21"/><circle cx="24" cy="34" r="2.5"/><path d="M30 12l6 6"/>`,
	// Circle with a G.
	gsafe: `<circle cx="24" cy="24" r="20"/><path d="M31 17a10 10 0 1 0 2 10h-9"/>`,
	// Target brackets with a locked centre.
	gimbals: `<path d="M6 15V6h9M33 6h9v9M42 33v9h-9M15 42H6v-9"/><circle cx="24" cy="24" r="6"/><path d="M24 14v4M24 30v4M14 24h4M30 24h4"/>`,
	// Night vision eye (normally replaced by the supplied lamp.svg).
	lamp: `<path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z"/><circle cx="24" cy="24" r="6"/>`,
	// Power symbol.
	power: `<path d="M24 4v18"/><path d="M14 10a16 16 0 1 0 20 0"/>`,
	// Ship power (normally replaced by the supplied power.svg): lightning bolt in a ring.
	shippower: `<circle cx="24" cy="24" r="20"/><path d="M27 8L16 26h8l-3 14 11-18h-8z"/>`,
};

/**
 * Drawn extent of each line icon in its 48-unit grid (stroke included), so it can be fitted by
 * what it draws rather than by the grid. Measured in a browser; quantum's height worked out
 * from its rotated ellipses.
 */
const LINE_BOX: Record<HotkeyIcon, { x: number; y: number; w: number; h: number }> = {
	gear: { x: 13.4, y: 1.4, w: 22.2, h: 43.2 },
	lights: { x: 4.4, y: 9.4, w: 40.2, h: 29.2 },
	doors: { x: 4.4, y: 4.4, w: 39.2, h: 39.2 },
	vtol: { x: 10.4, y: 4.4, w: 27.2, h: 38.2 },
	boost: { x: 5.4, y: 10.4, w: 37.2, h: 27.2 },
	engines: { x: 2.4, y: 10.4, w: 42.2, h: 27.2 },
	shields: { x: 6.4, y: 2.4, w: 35.2, h: 43.2 },
	weapons: { x: 1.4, y: 1.4, w: 45.2, h: 45.2 },
	coolers: { x: 5.1, y: 2.4, w: 37.8, h: 43.2 },
	quantum: { x: 2.4, y: 4.7, w: 43.2, h: 38.6 },
	coupled: { x: 1.4, y: 13.4, w: 45.2, h: 21.2 },
	cruise: { x: 5.4, y: 15.4, w: 37.2, h: 26.2 },
	limiter: { x: 5.4, y: 10.4, w: 37.2, h: 27.7 },
	gsafe: { x: 2.4, y: 2.4, w: 43.2, h: 43.2 },
	gimbals: { x: 4.4, y: 4.4, w: 39.2, h: 39.2 },
	lamp: { x: 2.4, y: 10.4, w: 43.2, h: 27.2 },
	shippower: { x: 2.4, y: 2.4, w: 43.2, h: 43.2 },
	power: { x: 6.4, y: 2.4, w: 35.2, h: 37.7 },
};

/**
 * An icon in `color`, its drawn area centred at (cx, cy) and fitted to a `size`×`size` box without
 * distortion. A supplied SVG icon wins over the built-in one.
 */
export function iconSvg(icon: HotkeyIcon, color: string, cx: number, cy: number, size: number): string {
	const supplied = userIconSvg(icon, color, cx, cy, size);
	if (supplied) return supplied;
	const b = LINE_BOX[icon] ?? { x: 0, y: 0, w: 48, h: 48 };
	const s = size / Math.max(b.w, b.h);
	const tx = cx - (b.x + b.w / 2) * s;
	const ty = cy - (b.y + b.h / 2) * s;
	return (
		`<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})" fill="none" stroke="${color}" color="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">` +
		(PATHS[icon] ?? PATHS.power) +
		`</g>`
	);
}

/**
 * A solid six-tooth cog with a round hole, rotated by `angle` degrees: drawn frame by frame to
 * spin while a system is moving. The hole is filled with `holeColor` (the key's background) so
 * it reads as a cut-out on any background.
 */
export function cogSvg(color: string, cx: number, cy: number, size: number, angle: number, holeColor: string): string {
	const s = size / 48;
	const TIP = 22; // tooth tips
	const ROOT = 16; // between teeth
	const TIP_HALF = 14; // half-width of a tooth at the tip, degrees
	const ROOT_HALF = 22; // half-width of a tooth at the root, degrees
	const at = (deg: number, r: number) => {
		const t = ((deg - 90) * Math.PI) / 180;
		return `${(24 + r * Math.cos(t)).toFixed(2)} ${(24 + r * Math.sin(t)).toFixed(2)}`;
	};
	let d = "";
	for (let i = 0; i < 6; i++) {
		const a = i * 60;
		d += `${i ? "L" : "M"}${at(a - ROOT_HALF, ROOT)}L${at(a - TIP_HALF, TIP)}L${at(a + TIP_HALF, TIP)}L${at(a + ROOT_HALF, ROOT)}`;
		d += `A${ROOT} ${ROOT} 0 0 1 ${at(a + 60 - ROOT_HALF, ROOT)}`;
	}
	return (
		`<g transform="translate(${cx - 24 * s} ${cy - 24 * s}) scale(${s}) rotate(${angle} 24 24)">` +
		// A thick round-joined stroke in the same colour softens the tooth corners, like the reference.
		`<path d="${d}Z" fill="${color}" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>` +
		`<circle cx="24" cy="24" r="10" fill="${holeColor}"/>` +
		`</g>`
	);
}
