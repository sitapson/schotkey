/** Key face for SC Hotkey: icon on top, state label underneath, background colour by state. */
import { cogSvg, HotkeyIcon, iconSvg } from "./icons";

export type HotkeyPhase = "on" | "off" | "busy" | "offline";

export interface HotkeyFace {
	phase: HotkeyPhase;
	icon: HotkeyIcon;
	label: string;
	/** Background for this phase. */
	color: string;
	/** Optional small line under the label (the "show value" option). */
	value?: string;
	/** Telemetry feed connected: small green dot, grey when not. */
	live: boolean;
	/** Cog rotation in degrees while busy. */
	cogAngle?: number;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderHotkey(face: HotkeyFace): string {
	const dim = face.phase === "offline";
	const fg = dim ? "#8a96a3" : "#ffffff";
	const cy = face.value ? 52 : 56;
	const art = face.phase === "busy" ? cogSvg(fg, 72, cy, 62, face.cogAngle ?? 0) : iconSvg(face.icon, fg, 72, cy, 62);
	const label = face.label.toUpperCase();
	const labelSize = label.length > 11 ? 15 : label.length > 8 ? 18 : 21;
	const labelY = face.value ? 108 : 118;
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" fill="#12171d"/>` +
		`<rect x="6" y="6" width="132" height="132" rx="14" fill="${esc(face.color)}"/>` +
		art +
		`<g font-family="Segoe UI, Arial, sans-serif" font-weight="700" text-anchor="middle" fill="${fg}">` +
		`<text x="72" y="${labelY}" font-size="${labelSize}">${esc(label)}</text>` +
		(face.value ? `<text x="72" y="130" font-size="17" opacity="0.85">${esc(face.value)}</text>` : "") +
		`</g>` +
		`<circle cx="122" cy="22" r="6" fill="${face.live ? "#4cd964" : "#5b6570"}" stroke="#12171d" stroke-width="2"/>` +
		`</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
