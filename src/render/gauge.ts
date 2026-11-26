/**
 * Gauge key faces for a 144×144 Stream Deck key, as SVG data URLs. Six styles:
 *
 *   v1  Classic: 270° fuel ring (open at the bottom), icon inside, value text below.
 *   v2  Split: no text. Top half an arc of pips; bottom half, a little smaller, the fuel gauge
 *       filling left to right. Icon in the middle.
 *   v3  Double: fuel ring outside, pip arc inside; text below.
 *   v4  Double, swapped: pip arc outside, fuel ring inside; text below.
 *   v5  Ring + line: fuel ring as v1, no text, a straight row of pips across the bottom.
 *   v6  Ring + line, swapped: pip arc as the ring, a straight fuel bar across the bottom.
 *
 * Colours: background, gauge (normal / low / critical), pips and icon are each set separately.
 * One "fade" strength (0-1) is used for everything dim: unlit pips, empty fuel segments, the
 * icon and text while the system is off, and, when offline, every part of the key.
 *
 * The game doesn't report pip levels, so the caller passes how many pips to show and how many
 * are lit (66% when the system is on, none when off).
 */

export type GaugeIcon = "hydrogen" | "quantum" | "boost" | "oxygen" | "health" | "none";
export type GaugeStyle = "v1" | "v2" | "v3" | "v4" | "v5" | "v6";
export const GAUGE_STYLES: GaugeStyle[] = ["v1", "v2", "v3", "v4", "v5", "v6"];

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
	pips?: { count: number; filled: number };
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
	/** Pip colour. Unset = the gauge's normal colour. */
	pips?: string;
	/** Fixed icon colour. Unset = the icon follows the gauge colour (normal / low / critical). */
	icon?: string;
}

export const DEFAULT_GAUGE_COLORS = { background: "#13202a", normal: "#3fd0c9", warn: "#f2c230", alert: "#ff4f4f" };

const COLORS = {
	normal: "#3fd0c9",
	warn: "#f2c230",
	alert: "#ff4f4f",
	bg: "#0e161c",
	panel: "#13202a",
	text: "#e9f2f6",
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
 * `reverse` fills from the far end (v2's bottom half, so it fills left to right).
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

/** Pip arc like the power hotkeys: rounded ends, clear gaps, the first `filled` lit. */
function pipArc(g: Ring, start: number, sweep: number, count: number, filled: number, gap: number, p: Paint): string {
	const n = Math.max(1, Math.min(12, Math.round(count)));
	const cap = ((g.width / 2) / g.r) * (180 / Math.PI);
	const per = sweep / n;
	let out = "";
	for (let i = 0; i < n; i++) {
		const a0 = start + i * per + (i === 0 ? cap : gap / 2 + cap);
		const a1 = start + (i + 1) * per - (i === n - 1 ? cap : gap / 2 + cap);
		if (a1 <= a0) continue;
		out += `<path d="${arc(g, a0, a1)}" fill="none" stroke="${p.color}" stroke-width="${g.width}" stroke-linecap="round"${op(i < filled ? p.lit : p.fade)}/>`;
	}
	return out;
}

/** Straight row of rounded pips from x0 to x1, the first `filled` lit, left to right. */
function pipLine(x0: number, x1: number, y: number, width: number, count: number, filled: number, p: Paint): string {
	const n = Math.max(1, Math.min(12, Math.round(count)));
	const GAP = 8;
	const per = (x1 - x0 + GAP) / n;
	let out = "";
	for (let i = 0; i < n; i++) {
		// Round caps reach width/2 past each end, so draw the line that much shorter.
		const a = x0 + i * per + width / 2;
		const b = x0 + (i + 1) * per - GAP - width / 2;
		const line = b > a ? `<path d="M${a.toFixed(2)} ${y}H${b.toFixed(2)}"` : `<path d="M${a.toFixed(2)} ${y}h0.01"`;
		out += `${line} stroke="${p.color}" stroke-width="${width}" stroke-linecap="round"${op(i < filled ? p.lit : p.fade)}/>`;
	}
	return out;
}

// Simple line icons, drawn around (72, 66).
function icon(kind: GaugeIcon, color: string): string {
	const s = `fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"`;
	switch (kind) {
		case "hydrogen": {
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
			return `<circle cx="68" cy="65" r="12" ${s}/><path d="M80 74h8l-7.5 8h7.5" ${s} stroke-width="2.6"/>`;
		case "health":
			return `<path d="M72 82s-17-9.5-17-21a9 9 0 0 1 17-4.5A9 9 0 0 1 89 61c0 11.5-17 21-17 21z" ${s}/><path d="M64 66h5l2.5-5 4 9 2.5-4H81" ${s} stroke-width="2.4"/>`;
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
	const pipPaint: Paint = { color: user.pips ?? normal, fade: offline ? 1 : fade, lit: 1 };

	let parts = "";
	let showText = true;
	let iconScale = 1;
	let iconShift = 0;
	const ring: Ring = { cx: 72, cy: 66, r: 44, width: 9 };
	const inner: Ring = { cx: 72, cy: 66, r: 32, width: 6 };
	const lineY = 124;
	switch (style) {
		case "v1":
			parts = fuelArc(ring, 225, 270, n, f, face.partial, fuelPaint);
			break;
		case "v2": {
			const top: Ring = { cx: 72, cy: 72, r: 55, width: 9 };
			const bottom: Ring = { cx: 72, cy: 72, r: 46, width: 9 };
			parts = pipArc(top, 274, 172, pips.count, pips.filled, 9, pipPaint) + fuelArc(bottom, 94, 172, n, f, face.partial, fuelPaint, true);
			showText = false;
			iconShift = 6;
			break;
		}
		case "v3":
			parts = fuelArc(ring, 225, 270, n, f, face.partial, fuelPaint) + pipArc(inner, 225, 270, pips.count, pips.filled, 10, pipPaint);
			iconScale = 0.8;
			break;
		case "v4":
			parts = pipArc(ring, 225, 270, pips.count, pips.filled, 9, pipPaint) + fuelArc(inner, 225, 270, n, f, face.partial, fuelPaint);
			iconScale = 0.8;
			break;
		case "v5":
			parts = fuelArc(ring, 225, 270, n, f, face.partial, fuelPaint) + pipLine(30, 114, lineY, 8, pips.count, pips.filled, pipPaint);
			showText = false;
			break;
		case "v6":
			parts = pipArc(ring, 225, 270, pips.count, pips.filled, 9, pipPaint) + fuelLine(30, 114, lineY, 9, n, f, face.partial, fuelPaint);
			showText = false;
			break;
	}

	const pulsing = face.pulse !== undefined && !offline;
	const iconColor = user.icon ?? (offline || pulsing || face.inactive ? normal : levelColor);
	// Icon and text: full strength normally, faded while the system is off, pulsing while it powers on.
	const iconOpacity = offline ? 1 : pulsing ? face.pulse! : face.inactive ? fade : 1;
	const textOpacity = offline ? 1 : face.inactive ? fade : 1;
	const fontSize = face.valueText.length > 6 ? 21 : 26;
	const iconTransform =
		iconScale !== 1 ? ` transform="translate(72 66) scale(${iconScale}) translate(-72 -66)"` : iconShift ? ` transform="translate(0 ${iconShift})"` : "";
	const text = showText
		? `<text x="72" y="130" font-family="Segoe UI, Arial, sans-serif" font-weight="700" text-anchor="middle" font-size="${fontSize}" fill="${COLORS.text}"${op(textOpacity)}>${esc(face.valueText)}</text>`
		: "";

	// A chosen background fills the whole key (outer frame and panel) so it reads as one colour.
	const bg = user.background ?? COLORS.bg;
	const panel = user.background ?? COLORS.panel;
	const background =
		`<rect width="144" height="144" fill="${bg}"/>` +
		`<rect x="4" y="4" width="136" height="136" rx="14" fill="${panel}" stroke="#2b3a45" stroke-width="2"/>`;
	const content = parts + `<g${op(iconOpacity)}><g${iconTransform}>${icon(face.icon, iconColor)}</g></g>` + text;

	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		(offline ? `<rect width="144" height="144" fill="#000"/><g${op(fade)}>${background}${content}</g>` : background + content) +
		`</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
