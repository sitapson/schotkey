/**
 * Gauge key faces for a 144×144 Stream Deck key, as SVG data URLs. Three styles:
 *
 *   v1  "Classic": a 270° segmented ring (open at the bottom), icon inside, value text below.
 *   v2  "Split": no text. The top half is an arc of pips (like the power hotkeys); the bottom half,
 *       a little smaller, is the fuel gauge, filling left to right. Icon in the middle.
 *   v3  "Double": the classic ring for fuel, with a second, inner 270° arc of pips; text below.
 *
 * The game doesn't report pip levels, so the caller passes how many pips to show and how many
 * are lit (66% when the system is on, none when off).
 */

export type GaugeIcon = "hydrogen" | "quantum" | "boost" | "oxygen" | "health" | "none";
export type GaugeStyle = "v1" | "v2" | "v3";

export interface GaugeFace {
	style?: GaugeStyle;
	/** 0..1, or undefined when there's no data (draws an empty "--" gauge). */
	fraction?: number;
	/** Text under the ring, e.g. "98%" or "1.2 kg/m³" (not shown in v2). */
	valueText: string;
	icon: GaugeIcon;
	segments: number;
	partial: boolean;
	level: "normal" | "warn" | "alert" | "offline";
	/** e.g. engines off: the ring keeps its level and colour but dims. */
	inactive?: boolean;
	/** v2 / v3: the pip arc. */
	pips?: { count: number; filled: number };
	/** User colour choices; anything missing uses the defaults below. */
	colors?: GaugeColors;
	/** Powering on: icon drawn in its normal colour at this opacity (0-1), animated as a pulse. */
	pulse?: number;
	/** Offline: icon and text drawn in their normal colours at this opacity (0-1, default 0.2). */
	offlineOpacity?: number;
}

export interface GaugeColors {
	background?: string;
	normal?: string;
	warn?: string;
	alert?: string;
	/** Fixed icon colour. Unset = the icon follows the gauge colour (normal / warn / alert). */
	icon?: string;
}

export const DEFAULT_GAUGE_COLORS = { background: "#13202a", normal: "#3fd0c9", warn: "#f2c230", alert: "#ff4f4f" };

const COLORS = {
	normal: "#3fd0c9",
	warn: "#f2c230",
	alert: "#ff4f4f",
	offline: "#4a5560",
	track: "#24313b",
	bg: "#0e161c",
	panel: "#13202a",
	text: "#e9f2f6",
	dim: "#7d8b96",
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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

/**
 * Segmented fuel arc from `start` over `sweep` degrees, square ends, 4° gaps, lit up to `f`.
 * `reverse` fills from the far end (used for v2's bottom half, so it fills left to right).
 */
function fuelArc(g: Ring, start: number, sweep: number, n: number, f: number, partial: boolean, color: string, dim: boolean, reverse = false): string {
	const GAP = 4;
	const per = sweep / n;
	let out = "";
	for (let i = 0; i < n; i++) {
		const a0 = start + i * per + GAP / 2;
		const a1 = start + (i + 1) * per - GAP / 2;
		out += `<path d="${arc(g, a0, a1)}" stroke="${COLORS.track}" stroke-width="${g.width}" fill="none"/>`;
		// How full this segment is, counted from the filling end.
		const k = reverse ? n - 1 - i : i;
		const fill = Math.max(0, Math.min(1, f * n - k));
		const shown = partial ? fill : fill >= 1 ? 1 : 0;
		if (shown <= 0.001) continue;
		const d = reverse ? arc(g, a1 - (a1 - a0) * shown, a1) : arc(g, a0, a0 + (a1 - a0) * shown);
		out += `<path d="${d}" stroke="${color}" stroke-width="${g.width}" fill="none"${dim ? ` opacity="0.3"` : ""}/>`;
	}
	return out;
}

/** Pip arc like the power hotkeys: rounded ends, clear gaps, the first `filled` lit. */
function pipArc(g: Ring, start: number, sweep: number, count: number, filled: number, color: string, gap: number): string {
	const n = Math.max(1, Math.min(12, Math.round(count)));
	const cap = ((g.width / 2) / g.r) * (180 / Math.PI);
	const per = sweep / n;
	let out = "";
	for (let i = 0; i < n; i++) {
		const a0 = start + i * per + (i === 0 ? cap : gap / 2 + cap);
		const a1 = start + (i + 1) * per - (i === n - 1 ? cap : gap / 2 + cap);
		if (a1 <= a0) continue;
		out += `<path d="${arc(g, a0, a1)}" fill="none" stroke="${color}" stroke-width="${g.width}" stroke-linecap="round"${i < filled ? "" : ` opacity="0.28"`}/>`;
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
	const style = face.style ?? "v1";
	const n = Math.max(1, Math.min(40, Math.round(face.segments)));
	const user = face.colors ?? {};
	const C = {
		...COLORS,
		normal: user.normal ?? COLORS.normal,
		warn: user.warn ?? COLORS.warn,
		alert: user.alert ?? COLORS.alert,
		// A chosen background fills the whole key (panel and outer frame) so it reads as one colour.
		panel: user.background ?? COLORS.panel,
		bg: user.background ?? COLORS.bg,
	};
	const color = C[face.level];
	const f = face.fraction === undefined ? 0 : Math.max(0, Math.min(1, face.fraction));
	const offline = face.level === "offline";
	const faint = offline ? ` opacity="${(face.offlineOpacity ?? 0.2).toFixed(2)}"` : "";
	const pips = face.pips ?? { count: 4, filled: 0 };

	let rings = "";
	let iconShift = 0; // move the icon down when there's no text (v2), so it sits in the middle
	if (style === "v2") {
		// Top half: pips, from 9 o'clock over the top to 3 o'clock. Bottom half, a little smaller:
		// fuel, filling from 9 o'clock along the bottom to 3 o'clock.
		const top: Ring = { cx: 72, cy: 72, r: 55, width: 9 };
		const bottom: Ring = { cx: 72, cy: 72, r: 46, width: 9 };
		rings += `<g${faint}>${pipArc(top, 274, 172, pips.count, pips.filled, C.normal, 9)}</g>`;
		rings += fuelArc(bottom, 94, 172, n, f, face.partial, color, !!face.inactive, true);
		iconShift = 6;
	} else {
		const outer: Ring = { cx: 72, cy: 66, r: 44, width: 9 };
		rings += fuelArc(outer, 225, 270, n, f, face.partial, color, !!face.inactive);
		if (style === "v3") {
			const inner: Ring = { cx: 72, cy: 66, r: 32, width: 6 };
			rings += `<g${faint}>${pipArc(inner, 225, 270, pips.count, pips.filled, C.normal, 10)}</g>`;
		}
	}

	// Warning levels change the ring and icon colour only; the frame is always the same neutral outline.
	const pulsing = face.pulse !== undefined && !offline;
	const iconColor = offline || pulsing ? (user.icon ?? C.normal) : face.inactive ? COLORS.offline : (user.icon ?? color);
	const textColor = !offline && face.inactive ? COLORS.dim : COLORS.text;
	const fontSize = face.valueText.length > 6 ? 21 : 26;
	// v3's inner arc leaves less room, so its icon is drawn a little smaller.
	const iconScale = style === "v3" ? 0.8 : 1;
	const iconTransform =
		iconScale !== 1 ? ` transform="translate(72 66) scale(${iconScale}) translate(-72 -66)"` : iconShift ? ` transform="translate(0 ${iconShift})"` : "";
	const text =
		style === "v2"
			? ""
			: `<g font-family="Segoe UI, Arial, sans-serif" font-weight="700" text-anchor="middle"${faint}>` +
				`<text x="72" y="130" font-size="${fontSize}" fill="${textColor}">${esc(face.valueText)}</text></g>`;

	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" fill="${C.bg}"/>` +
		`<rect x="4" y="4" width="136" height="136" rx="14" fill="${C.panel}" stroke="#2b3a45" stroke-width="2"/>` +
		rings +
		`<g${pulsing ? ` opacity="${face.pulse!.toFixed(2)}"` : faint}><g${iconTransform}>${icon(face.icon, iconColor)}</g></g>` +
		text +
		`</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
