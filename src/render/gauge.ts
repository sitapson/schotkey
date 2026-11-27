/**
 * Gauge key faces for a 144×144 Stream Deck key, as SVG data URLs. Six styles:
 *
 *   v1  Classic: 270° fuel ring (open at the bottom), icon inside, value text below.
 *   v3  Double: fuel ring outside, pip arc inside; text below.
 *   v4  Double, swapped: pip arc outside, fuel ring inside; text below.
 *   v5  Ring + line: fuel ring as v1, no text, a straight row of pips across the bottom.
 *   v6  Ring + line, swapped: pip arc as the ring, a straight fuel bar across the bottom.
 *   v7  v5 flipped: fuel ring open at the top, under the icon; pip row across the top.
 *   v8  Like v7 but the fuel is a shallow 150° arc under the icon.
 *   v9  All-in-one: pip row on top, smaller fuel ring with the icon inside, % in the ring's gap.
 *   v10 All-in-one, side by side: pip row on top, icon left, large % right, fuel bar below.
 *   v11 All-in-one, dome: 180° fuel arc over the icon, % under the icon, pip row at the bottom.
 *   v12 Like v9, stacked: pip row on top, icon centred, straight fuel bar, % below.
 *   v13 Icon boundary: the icon alone, filling the icon boundary (ICON_BOUNDARY).
 *   v14 Icon boundary + pip row on top.
 *   v15 Icon boundary + straight fuel bar and % below.
 *   v16 Icon boundary + pip row on top + fuel bar and % below.
 *   v17 Like v9 with the fuel ring flipped (open at the top, under the pip row) and no %.
 *   v18 v17 with the icon filling the icon boundary and the ring scaled up around it to match.
 *   v19 v18 with the arc 20% shorter (216° instead of 270°), still centred on the bottom.
 *
 * Colours: background, gauge (normal / low / critical), pips and icon are each set separately.
 * One "fade" strength (0-1) is used for everything dim: unlit pips, empty fuel segments, the
 * text while the system is off, and, when offline, every part of the key (the icon stays lit
 * while the game is reporting, even with the system off).
 *
 * The game doesn't report pip levels, so the caller passes how many pips to show and how many
 * are lit (66% when the system is on, none when off).
 */

import { Box, fitToBoundary } from "./boundary";
import { fileIconBox, fileIconSvg } from "./user-icons";

/**
 * Icons a gauge can show, with the names the settings panel uses. Drawn ones are line icons
 * built in here; supplied ones are SVGs in imgs/icons ("symbol": power icons drawn without
 * their four corner bars, which would clash with the gauge).
 */
export const GAUGE_ICONS = {
	// Drawn
	hexagon: { name: "Hydrogen (hexagon)" },
	quantum: { name: "Quantum (atom)" },
	boost: { name: "Boost" },
	oxygen: { name: "Oxygen" },
	health: { name: "Health" },
	// Supplied
	hydrogen: { name: "Hydrogen", file: "hydrogen.svg" },
	shippower: { name: "Ship power", file: "power.svg", symbol: true },
	"power-plant-01": { name: "Power plant", file: "power-plant-01.svg" },
	"power-plant-02": { name: "Power plant 2", file: "power-plant-02.svg" },
	engines: { name: "Engines (thrust)", file: "engines.svg" },
	"power-engines": { name: "Engines", file: "power-engines.svg", symbol: true },
	"power-shields": { name: "Shields", file: "power-shields.svg", symbol: true },
	"power-weapons": { name: "Weapons", file: "power-weapons.svg", symbol: true },
	"power-coolers": { name: "Coolers", file: "power-coolers.svg", symbol: true },
	"power-quantum": { name: "Quantum drive", file: "power-quantum.svg", symbol: true },
	"power-life-support": { name: "Life support", file: "power-life-support.svg", symbol: true },
	"power-gravity": { name: "Gravity", file: "power-gravity.svg", symbol: true },
	"landing-gear": { name: "Landing gear", file: "landing-gear.svg" },
	headlights: { name: "Headlights", file: "headlights.svg" },
	doors: { name: "Doors", file: "doors.svg" },
	vtol: { name: "VTOL", file: "vtol.svg" },
	coupled: { name: "Coupled", file: "coupled.svg" },
	config: { name: "Cycle configuration", file: "config.svg" },
	lamp: { name: "LAMP", file: "lamp.svg" },
	comms: { name: "Comms", file: "comms.svg" },
	pip: { name: "Ship marker", file: "pip.svg" },
	tobii: { name: "Head tracking", file: "tobii.svg" },
	mirai: { name: "Mirai logo", file: "mirai.svg" },
} as const satisfies Record<string, { name: string; file?: string; symbol?: boolean }>;

export type GaugeIcon = keyof typeof GAUGE_ICONS | "none";
/** Icons that were removed, and what keys still set to them show instead. */
const RETIRED_ICONS: Record<string, GaugeIcon> = {
	// The same artwork as tobii.svg, smaller on its page: identical once fitted to the icon boundary.
	tobii2: "tobii",
};
/** A saved icon choice as a current icon id (retired ones mapped to their replacement). */
export const currentIcon = (v: unknown): unknown => (typeof v === "string" && Object.hasOwn(RETIRED_ICONS, v) ? RETIRED_ICONS[v] : v);
export const isGaugeIcon = (v: unknown): v is GaugeIcon => v === "none" || (typeof v === "string" && Object.hasOwn(GAUGE_ICONS, v));
// "v2" (pips on top, curved fuel bar below) was removed; keys still set to it fall back to v1.
export type GaugeStyle = "v1" | "v3" | "v4" | "v5" | "v6" | "v7" | "v8" | "v9" | "v10" | "v11" | "v12" | "v13" | "v14" | "v15" | "v16" | "v17" | "v18" | "v19";
export const GAUGE_STYLES: GaugeStyle[] = ["v1", "v3", "v4", "v5", "v6", "v7", "v8", "v9", "v10", "v11", "v12", "v13", "v14", "v15", "v16", "v17", "v18", "v19"];


/**
 * Drawn extent of each built-in gauge icon (outline stroke included), in the 144 px key space.
 * Measured in a browser; quantum's height worked out from its rotated ellipses.
 */
const GAUGE_ICON_BOX: Partial<Record<GaugeIcon, Box>> = {
	hexagon: { x: 52.2, y: 43.4, w: 39.6, h: 45.2 },
	quantum: { x: 48.4, y: 44.9, w: 47.2, h: 42.2 },
	boost: { x: 56.4, y: 52.4, w: 37.2, h: 27.2 },
	oxygen: { x: 54.4, y: 51.4, w: 35.2, h: 32.2 },
	health: { x: 53.4, y: 50, w: 37.2, h: 33.6 },
};

export interface GaugeFace {
	style?: GaugeStyle;
	/** 0..1, or undefined when there's no data. */
	fraction?: number;
	/** Text under the ring, e.g. "98%" (shown by v1, v3, v4). */
	valueText: string;
	icon: GaugeIcon;
	segments: number;
	partial: boolean;
	level: "normal" | "warn" | "alert" | "offline";
	/** System switched off (e.g. engines off): icon and text drawn faded. */
	inactive?: boolean;
	/** `levels` (0-1 per pip) overrides `filled` while pips are animating on or off. */
	pips?: { count: number; filled: number; levels?: number[] };
	colors?: GaugeColors;
	/** Powering on: icon opacity (0-1), animated as a pulse. */
	pulse?: number;
	/** Strength of faded parts, 0-1 (default 0.2). */
	fade?: number;
}

export interface GaugeColors {
	background?: string;
	normal?: string;
	warn?: string;
	alert?: string;
	/** Pip colour. Unset = white. */
	pips?: string;
	/** Icon colour. Unset = the icon follows the gauge colour (normal / warning / critical). */
	icon?: string;
	/** Value text (the %). Unset = the gauge's normal colour. */
	text?: string;
	/** Message text (ENG OFF, QT OFF, --%). Unset = white. */
	message?: string;
}

// Defaults: black background, cyan gauge, yellow warning, red critical, white pips / icon / messages.
export const DEFAULT_GAUGE_COLORS = { background: "#000000", normal: "#3fd0c9", warn: "#f2c230", alert: "#ff4f4f" };

const COLORS = {
	normal: "#3fd0c9",
	warn: "#f2c230",
	alert: "#ff4f4f",
	panel: "#000000",
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const op = (o: number) => (o >= 0.999 ? "" : ` opacity="${o.toFixed(2)}"`);

interface Ring {
	cx: number;
	cy: number;
	r: number;
	width: number;
}

function point(g: Ring, deg: number): string {
	const t = ((deg - 90) * Math.PI) / 180;
	return `${(g.cx + g.r * Math.cos(t)).toFixed(2)} ${(g.cy + g.r * Math.sin(t)).toFixed(2)}`;
}

/** Arc path from a0 to a1 degrees (clockwise from 12 o'clock), a0 < a1. */
function arc(g: Ring, a0: number, a1: number): string {
	return `M${point(g, a0)}A${g.r} ${g.r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${point(g, a1)}`;
}

/** What a fuel or pip shape needs to draw itself. */
interface Paint {
	color: string;
	/** Opacity of unlit parts (empty segments, unlit pips). */
	fade: number;
	/** Opacity of lit parts. */
	lit: number;
}

/** Fill amount of segment k of n for fraction f. */
function segFill(f: number, n: number, k: number, partial: boolean): number {
	const fill = Math.max(0, Math.min(1, f * n - k));
	return partial ? fill : fill >= 1 ? 1 : 0;
}

/**
 * Segmented fuel arc from `start` over `sweep` degrees, square ends, 4° gaps.
 * `reverse` fills from the far end instead.
 */
function fuelArc(g: Ring, start: number, sweep: number, n: number, f: number, partial: boolean, p: Paint, reverse = false): string {
	const GAP = 4;
	const per = sweep / n;
	let out = "";
	for (let i = 0; i < n; i++) {
		const a0 = start + i * per + GAP / 2;
		const a1 = start + (i + 1) * per - GAP / 2;
		out += `<path d="${arc(g, a0, a1)}" stroke="${p.color}" stroke-width="${g.width}" fill="none"${op(p.fade)}/>`;
		const shown = segFill(f, n, reverse ? n - 1 - i : i, partial);
		if (shown <= 0.001) continue;
		const d = reverse ? arc(g, a1 - (a1 - a0) * shown, a1) : arc(g, a0, a0 + (a1 - a0) * shown);
		out += `<path d="${d}" stroke="${p.color}" stroke-width="${g.width}" fill="none"${op(p.lit)}/>`;
	}
	return out;
}

/** Straight segmented fuel bar from x0 to x1, filling left to right. */
function fuelLine(x0: number, x1: number, y: number, h: number, n: number, f: number, partial: boolean, p: Paint): string {
	const GAP = 3;
	const per = (x1 - x0) / n;
	let out = "";
	for (let i = 0; i < n; i++) {
		const sx = x0 + i * per + GAP / 2;
		const w = per - GAP;
		out += `<rect x="${sx.toFixed(2)}" y="${y - h / 2}" width="${w.toFixed(2)}" height="${h}" fill="${p.color}"${op(p.fade)}/>`;
		const shown = segFill(f, n, i, partial);
		if (shown > 0.001) out += `<rect x="${sx.toFixed(2)}" y="${y - h / 2}" width="${(w * shown).toFixed(2)}" height="${h}" fill="${p.color}"${op(p.lit)}/>`;
	}
	return out;
}

/** Opacity of pip i: lit / unlit, or part way while animating. */
function pipOpacity(i: number, filled: number, levels: number[] | undefined, p: Paint): number {
	const level = levels ? (levels[i] ?? 0) : i < filled ? 1 : 0;
	return p.fade + (p.lit - p.fade) * level;
}

/** Pip arc like the power hotkeys: rounded ends, clear gaps, the first `filled` lit. */
function pipArc(g: Ring, start: number, sweep: number, count: number, filled: number, gap: number, p: Paint, levels?: number[]): string {
	const n = Math.max(1, Math.min(12, Math.round(count)));
	const cap = ((g.width / 2) / g.r) * (180 / Math.PI);
	const per = sweep / n;
	let out = "";
	for (let i = 0; i < n; i++) {
		const a0 = start + i * per + (i === 0 ? cap : gap / 2 + cap);
		const a1 = start + (i + 1) * per - (i === n - 1 ? cap : gap / 2 + cap);
		if (a1 <= a0) continue;
		out += `<path d="${arc(g, a0, a1)}" fill="none" stroke="${p.color}" stroke-width="${g.width}" stroke-linecap="round"${op(pipOpacity(i, filled, levels, p))}/>`;
	}
	return out;
}

/** Straight row of rounded pips from x0 to x1, the first `filled` lit, left to right. */
function pipLine(x0: number, x1: number, y: number, width: number, count: number, filled: number, p: Paint, levels?: number[]): string {
	const n = Math.max(1, Math.min(12, Math.round(count)));
	const GAP = 8;
	const per = (x1 - x0 + GAP) / n;
	let out = "";
	for (let i = 0; i < n; i++) {
		// Round caps reach width/2 past each end, so draw the line that much shorter.
		const a = x0 + i * per + width / 2;
		const b = x0 + (i + 1) * per - GAP - width / 2;
		const line = b > a ? `<path d="M${a.toFixed(2)} ${y}H${b.toFixed(2)}"` : `<path d="M${a.toFixed(2)} ${y}h0.01"`;
		out += `${line} stroke="${p.color}" stroke-width="${width}" stroke-linecap="round"${op(pipOpacity(i, filled, levels, p))}/>`;
	}
	return out;
}

/** Supplied icons are drawn where the line icons are: centred at (72, 66), 45.2 px at most. */
const SUPPLIED_AT = { cx: 72, cy: 66, size: 45.2 };

const suppliedOf = (kind: GaugeIcon) => {
	const def = kind === "none" ? undefined : (GAUGE_ICONS[kind] as { file?: string; symbol?: boolean });
	return def?.file ? { file: def.file, symbol: !!def.symbol } : undefined;
};

/** Drawn extent of a gauge icon, for fitting it into the icon boundary. */
function iconBox(kind: GaugeIcon): Box | undefined {
	const sup = suppliedOf(kind);
	if (sup) {
		const b = fileIconBox(sup.file, SUPPLIED_AT.cx, SUPPLIED_AT.cy, SUPPLIED_AT.size, sup.symbol);
		if (b) return b;
		if (kind === "hydrogen") return GAUGE_ICON_BOX.hexagon;
	}
	return GAUGE_ICON_BOX[kind];
}

/** A gauge icon where gauges draw it: centred at (72, 66), about 45 px (SC Hotkey's pip ring layout). */
export function gaugeIconAt(kind: GaugeIcon, color: string): string {
	return icon(kind, color);
}

/** A gauge icon on its own, filling the icon boundary (used by SC Hotkey keys). */
export function gaugeIconInBoundary(kind: GaugeIcon, color: string): string {
	const box = iconBox(kind);
	return box ? `<g transform="${fitToBoundary(box)}">${icon(kind, color)}</g>` : icon(kind, color);
}

// Line icons drawn around (72, 66); supplied icons from imgs/icons in the same place.
function icon(kind: GaugeIcon, color: string): string {
	// One stroke-width per element: a repeated attribute makes the SVG invalid and the key blank.
	const line = (w: number) => `fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
	const s = line(3.2);
	const sup = suppliedOf(kind);
	if (sup) {
		const svg = fileIconSvg(sup.file, color, SUPPLIED_AT.cx, SUPPLIED_AT.cy, SUPPLIED_AT.size, sup.symbol);
		if (svg) return svg;
		// Hydrogen falls back to the drawn hexagon if its file is missing; others show nothing.
		if (kind !== "hydrogen") return "";
		kind = "hexagon";
	}
	switch (kind) {
		case "hexagon": {
			const hex = [0, 60, 120, 180, 240, 300]
				.map((a) => {
					const t = ((a - 90) * Math.PI) / 180;
					return `${(72 + 21 * Math.cos(t)).toFixed(1)},${(66 + 21 * Math.sin(t)).toFixed(1)}`;
				})
				.join(" ");
			return `<polygon points="${hex}" ${s}/><path d="M64 56v20M80 56v20M64 66h16" ${s}/>`;
		}
		case "quantum":
			return `<ellipse cx="72" cy="66" rx="22" ry="8.5" ${s}/><ellipse cx="72" cy="66" rx="22" ry="8.5" transform="rotate(60 72 66)" ${s}/><ellipse cx="72" cy="66" rx="22" ry="8.5" transform="rotate(-60 72 66)" ${s}/><circle cx="72" cy="66" r="3" fill="${color}"/>`;
		case "boost":
			return `<path d="M58 54l10 12-10 12M70 54l10 12-10 12M82 54l10 12-10 12" ${s}/>`;
		case "oxygen":
			return `<circle cx="68" cy="65" r="12" ${s}/><path d="M80 74h8l-7.5 8h7.5" ${line(2.6)}/>`;
		case "health":
			return `<path d="M72 82s-17-9.5-17-21a9 9 0 0 1 17-4.5A9 9 0 0 1 89 61c0 11.5-17 21-17 21z" ${s}/><path d="M64 66h5l2.5-5 4 9 2.5-4H81" ${line(2.4)}/>`;
		default:
			return "";
	}
}

export function renderGauge(face: GaugeFace): string {
	const style: GaugeStyle = GAUGE_STYLES.includes(face.style as GaugeStyle) ? (face.style as GaugeStyle) : "v1";
	const n = Math.max(1, Math.min(40, Math.round(face.segments)));
	const user = face.colors ?? {};
	const normal = user.normal ?? COLORS.normal;
	const offline = face.level === "offline";
	const fade = Math.max(0, Math.min(1, face.fade ?? 0.2));
	const levelColor = face.level === "warn" ? (user.warn ?? COLORS.warn) : face.level === "alert" ? (user.alert ?? COLORS.alert) : normal;
	const f = offline || face.fraction === undefined ? 0 : Math.max(0, Math.min(1, face.fraction));
	const pips = face.pips ?? { count: 4, filled: 0 };

	// Offline: every part in its own colour at full strength, then the whole key faded together.
	// Otherwise: unlit / empty parts at the fade strength.
	// With the system off the game reports 0 (e.g. hydrogen with engines off), which isn't "critical",
	// so a switched-off gauge keeps its normal colour.
	const fuelPaint: Paint = { color: face.inactive ? normal : levelColor, fade: offline ? 1 : fade, lit: 1 };
	const pipPaint: Paint = { color: user.pips ?? "#ffffff", fade: offline ? 1 : fade, lit: 1 };

	let parts = "";
	let showText = true;
	let iconScale = 1;
	let iconDy = 0; // move the icon down, for layouts with the pips on top
	let iconDx = 0;
	let fitIcon = false; // scale and centre the icon into the icon boundary
	// Value text placement; the all-in-one layouts move and resize it.
	let textX = 72;
	let textY = 130;
	let textSize: number | undefined;
	let textAnchor = "middle";
	const ring: Ring = { cx: 72, cy: 66, r: 44, width: 9 };
	const inner: Ring = { cx: 72, cy: 66, r: 32, width: 6 };
	const lineY = 124;
	switch (style) {
		case "v1":
			parts = fuelArc(ring, 225, 270, n, f, face.partial, fuelPaint);
			break;
		case "v3":
			parts = fuelArc(ring, 225, 270, n, f, face.partial, fuelPaint) + pipArc(inner, 225, 270, pips.count, pips.filled, 10, pipPaint, pips.levels);
			iconScale = 0.8;
			break;
		case "v4":
			parts = pipArc(ring, 225, 270, pips.count, pips.filled, 9, pipPaint, pips.levels) + fuelArc(inner, 225, 270, n, f, face.partial, fuelPaint);
			iconScale = 0.8;
			break;
		case "v5":
			parts = fuelArc(ring, 225, 270, n, f, face.partial, fuelPaint) + pipLine(30, 114, lineY, 8, pips.count, pips.filled, pipPaint, pips.levels);
			showText = false;
			break;
		case "v6":
			parts = pipArc(ring, 225, 270, pips.count, pips.filled, 9, pipPaint, pips.levels) + fuelLine(30, 114, lineY, 9, n, f, face.partial, fuelPaint);
			showText = false;
			break;
		case "v7": {
			// Open at the top (45°..315° through the bottom), filling from top-left round to top-right.
			const low: Ring = { cx: 72, cy: 80, r: 44, width: 9 };
			parts = fuelArc(low, 45, 270, n, f, face.partial, fuelPaint, true) + pipLine(30, 114, 22, 8, pips.count, pips.filled, pipPaint, pips.levels);
			iconDy = 14;
			showText = false;
			break;
		}
		case "v8": {
			// A shallow 150° arc centred on the bottom (105°..255°), filling left to right.
			const wide: Ring = { cx: 72, cy: 72, r: 50, width: 9 };
			parts = fuelArc(wide, 105, 150, n, f, face.partial, fuelPaint, true) + pipLine(30, 114, 22, 8, pips.count, pips.filled, pipPaint, pips.levels);
			iconDy = 8;
			showText = false;
			break;
		}
		case "v9": {
			// Pips across the top; a smaller fuel ring below with the icon inside and the % in its gap.
			// Ring, icon and % move together so the icon sits at the key's centre (72, 72).
			const mid: Ring = { cx: 72, cy: 72, r: 38, width: 8 };
			parts = fuelArc(mid, 225, 270, n, f, face.partial, fuelPaint) + pipLine(30, 114, 20, 7, pips.count, pips.filled, pipPaint, pips.levels);
			// Full-size icon, as in style 1, centred in the ring.
			iconDy = 6;
			textY = 119;
			textSize = face.valueText.length > 4 ? 15 : 19;
			break;
		}
		case "v17": {
			// v9's ring and icon, but the ring opens at the top (45°..315° through the bottom),
			// filling from top-left round to top-right; no value text.
			const mid: Ring = { cx: 72, cy: 72, r: 38, width: 8 };
			parts = fuelArc(mid, 45, 270, n, f, face.partial, fuelPaint, true) + pipLine(30, 114, 20, 7, pips.count, pips.filled, pipPaint, pips.levels);
			iconDy = 6;
			showText = false;
			break;
		}
		case "v18": {
			// v17 scaled about the key's centre so the icon fills the icon boundary (62 / 45.2,
			// about 1.37x): the ring keeps the same spacing from the icon. Width 10, not a full
			// 1.37x, so the ring's top ends stay clear of the pip row.
			const big: Ring = { cx: 72, cy: 72, r: 52, width: 10 };
			parts = fuelArc(big, 45, 270, n, f, face.partial, fuelPaint, true) + pipLine(30, 114, 20, 7, pips.count, pips.filled, pipPaint, pips.levels);
			fitIcon = true;
			showText = false;
			break;
		}
		case "v19": {
			// v18 with the arc 20% shorter: 216° centred on the bottom (72°..288°).
			const big: Ring = { cx: 72, cy: 72, r: 52, width: 10 };
			parts = fuelArc(big, 72, 216, n, f, face.partial, fuelPaint, true) + pipLine(30, 114, 20, 7, pips.count, pips.filled, pipPaint, pips.levels);
			fitIcon = true;
			showText = false;
			break;
		}
		case "v10": {
			// Pips on top, icon on the left, big % on the right, fuel bar across the bottom.
			parts = pipLine(26, 118, 22, 7, pips.count, pips.filled, pipPaint, pips.levels) + fuelLine(22, 122, 118, 12, n, f, face.partial, fuelPaint);
			iconScale = 0.66;
			iconDx = -36;
			iconDy = 2;
			textX = 124;
			textY = 78;
			textAnchor = "end";
			textSize = face.valueText.length > 4 ? 16 : face.valueText.length > 3 ? 25 : 30;
			break;
		}
		case "v11": {
			// A 180° dome of fuel over the icon, the % under the icon, pips across the bottom.
			const dome: Ring = { cx: 72, cy: 84, r: 52, width: 9 };
			parts = fuelArc(dome, 270, 180, n, f, face.partial, fuelPaint) + pipLine(30, 114, 126, 7, pips.count, pips.filled, pipPaint, pips.levels);
			iconScale = 0.7;
			iconDy = 0;
			textY = 106;
			textSize = face.valueText.length > 4 ? 15 : 20;
			break;
		}
		case "v12":
			// Style 8's parts, stacked: pip row on top, full-size icon centred, straight fuel bar, % below.
			parts = pipLine(30, 114, 20, 7, pips.count, pips.filled, pipPaint, pips.levels) + fuelLine(24, 120, 101, 10, n, f, face.partial, fuelPaint);
			iconDy = -4;
			textY = 129;
			textSize = face.valueText.length > 4 ? 15 : 19;
			break;
		// Icon-boundary styles: the icon fills the fixed icon boundary; parts go around it.
		case "v13":
			fitIcon = true;
			showText = false;
			break;
		case "v14":
			parts = pipLine(30, 114, 20, 7, pips.count, pips.filled, pipPaint, pips.levels);
			fitIcon = true;
			showText = false;
			break;
		case "v15":
			parts = fuelLine(24, 120, 115, 8, n, f, face.partial, fuelPaint);
			fitIcon = true;
			textY = 135;
			textSize = face.valueText.length > 4 ? 14 : 16;
			break;
		case "v16":
			parts = pipLine(30, 114, 20, 7, pips.count, pips.filled, pipPaint, pips.levels) + fuelLine(24, 120, 115, 8, n, f, face.partial, fuelPaint);
			fitIcon = true;
			textY = 135;
			textSize = face.valueText.length > 4 ? 14 : 16;
			break;
	}

	const pulsing = face.pulse !== undefined && !offline;
	const iconColor = user.icon ?? (offline || pulsing || face.inactive ? normal : levelColor);
	// Icon: lit whenever the game is reporting (system on or off), pulsing while it powers on;
	// only offline fades it (with the rest of the key). Text still fades while the system is off.
	const iconOpacity = offline ? 1 : pulsing ? face.pulse! : 1;
	const textOpacity = offline ? 1 : face.inactive ? fade : 1;
	const fontSize = textSize ?? (face.valueText.length > 6 ? 21 : 26);
	const box = iconBox(face.icon);
	const iconTransform =
		fitIcon && box
			? ` transform="${fitToBoundary(box)}"`
			: iconScale !== 1 || iconDy || iconDx ? ` transform="translate(${72 + iconDx} ${66 + iconDy}) scale(${iconScale}) translate(-72 -66)"` : "";
	// The value (a number or %) in the gauge colour; messages like ENG OFF or --% in white.
	const isValue = /[0-9]/.test(face.valueText);
	const textColor = isValue ? (user.text ?? normal) : (user.message ?? "#ffffff");
	const text = showText
		? `<text x="${textX}" y="${textY}" font-family="Segoe UI, Arial, sans-serif" font-weight="700" text-anchor="${textAnchor}" font-size="${fontSize}" fill="${textColor}"${op(textOpacity)}>${esc(face.valueText)}</text>`
		: "";

	// The background fills the whole key: no frame, outline or inset panel.
	const background = `<rect width="144" height="144" fill="${user.background ?? COLORS.panel}"/>`;
	const content = parts + `<g${op(iconOpacity)}><g${iconTransform}>${icon(face.icon, iconColor)}</g></g>` + text;

	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		(offline ? `<rect width="144" height="144" fill="#000"/><g${op(fade)}>${background}${content}</g>` : background + content) +
		`</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
