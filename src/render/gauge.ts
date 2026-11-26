/** Segmented ring gauge for a 144×144 Stream Deck key, as an SVG data URL. */

export type GaugeIcon = "hydrogen" | "quantum" | "boost" | "oxygen" | "health" | "none";

export interface GaugeFace {
	/** 0..1, or undefined when there's no data (draws an empty "--" gauge). */
	fraction?: number;
	/** Text under the ring, e.g. "98%" or "1.2 kg/m³". */
	valueText: string;
	icon: GaugeIcon;
	segments: number;
	partial: boolean;
	level: "normal" | "warn" | "alert" | "offline";
	/** e.g. engines off: the ring keeps its level and colour but dims. */
	inactive?: boolean;
	/** User colour choices; anything missing uses the defaults below. */
	colors?: GaugeColors;
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

const CX = 72;
const CY = 66;
const R = 44;
const START = 225; // degrees, measured clockwise from 12 o'clock: bottom-left
const SWEEP = 270;
const GAP = 4; // degrees between segments
const WIDTH = 9;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function point(deg: number): [number, number] {
	const t = ((deg - 90) * Math.PI) / 180;
	return [CX + R * Math.cos(t), CY + R * Math.sin(t)];
}

function arc(a0: number, a1: number): string {
	const [x0, y0] = point(a0);
	const [x1, y1] = point(a1);
	const large = a1 - a0 > 180 ? 1 : 0;
	return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// Simple line icons, drawn around (72, 66) inside the ring.
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
	const per = SWEEP / n;
	const f = face.fraction === undefined ? 0 : Math.max(0, Math.min(1, face.fraction));

	let ring = "";
	for (let i = 0; i < n; i++) {
		const a0 = START + i * per + GAP / 2;
		const a1 = START + (i + 1) * per - GAP / 2;
		ring += `<path d="${arc(a0, a1)}" stroke="${COLORS.track}" stroke-width="${WIDTH}" fill="none"/>`;
		// How full this segment is: 0..1. Without partial fill, only whole segments light.
		const fill = Math.max(0, Math.min(1, f * n - i));
		const shown = face.partial ? fill : fill >= 1 ? 1 : 0;
		if (shown > 0.001) ring += `<path d="${arc(a0, a0 + (a1 - a0) * shown)}" stroke="${color}" stroke-width="${WIDTH}" fill="none"${face.inactive ? ` opacity="0.3"` : ""}/>`;
	}

	// Warning levels change the ring and icon colour only; the frame is always the same neutral outline.
	const border = "#2b3a45";
	const borderWidth = 2;
	const offline = face.level === "offline";
	const iconColor = offline ? (user.icon ?? C.normal) : face.inactive ? COLORS.offline : (user.icon ?? color);
	const textColor = !offline && face.inactive ? COLORS.dim : COLORS.text;
	const faint = offline ? ` opacity="${(face.offlineOpacity ?? 0.2).toFixed(2)}"` : "";
	const fontSize = face.valueText.length > 6 ? 21 : 26;

	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" fill="${C.bg}"/>` +
		`<rect x="4" y="4" width="136" height="136" rx="14" fill="${C.panel}" stroke="${border}" stroke-width="${borderWidth}"/>` +
		ring +
		`<g${faint}>${icon(face.icon, iconColor)}</g>` +
		`<g font-family="Segoe UI, Arial, sans-serif" font-weight="700" text-anchor="middle"${faint}>` +
		`<text x="72" y="130" font-size="${fontSize}" fill="${textColor}">${esc(face.valueText)}</text>` +
		`</g></svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
