/**
 * Line icons for SC Hotkey keys. Each is drawn in a 48×48 box (centre 24,24) with strokes,
 * so iconSvg() can place and scale it anywhere on a key.
 */
import { userIconSvg } from "./user-icons";

export type HotkeyIcon =
	| "gear"
	| "lights"
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
	| "power";

export const HOTKEY_ICONS: HotkeyIcon[] = ["gear", "lights", "vtol", "boost", "engines", "shields", "weapons", "coolers", "quantum", "coupled", "cruise", "limiter", "gsafe", "gimbals", "power"];

// Path data in the 48×48 box. Kept to strokes so one colour styles everything.
const PATHS: Record<HotkeyIcon, string> = {
	// Landing gear: strut, brace, wheel with hub.
	gear: `<path d="M24 3v22M24 12l10 8"/><circle cx="24" cy="34" r="9"/><circle cx="24" cy="34" r="2.5"/>`,
	// Headlight with beams.
	lights: `<path d="M6 14h8c8 0 12 4 12 10s-4 10-12 10H6z"/><path d="M31 15l11-4M31 24h12M31 33l11 4"/>`,
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
	// Power symbol.
	power: `<path d="M24 4v18"/><path d="M14 10a16 16 0 1 0 20 0"/>`,
};

/** An icon centred at (cx, cy), `size` px across, in `color`. A supplied SVG icon wins over the built-in one. */
export function iconSvg(icon: HotkeyIcon, color: string, cx: number, cy: number, size: number): string {
	const supplied = userIconSvg(icon, color, cx, cy, size);
	if (supplied) return supplied;
	const s = size / 48;
	return (
		`<g transform="translate(${cx - 24 * s} ${cy - 24 * s}) scale(${s})" fill="none" stroke="${color}" color="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">` +
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
