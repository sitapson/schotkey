/**
 * Key face for SC Hotkey: the icon alone on a background coloured by state. No text: the
 * state can be shown as the key's Stream Deck title instead (the "Show state as title" option).
 */
import { cogSvg, HotkeyIcon, iconSvg } from "./icons";

export type HotkeyPhase = "on" | "off" | "busy" | "offline";

export interface HotkeyFace {
	phase: HotkeyPhase;
	icon: HotkeyIcon;
	/** Background for this phase. */
	color: string;
	/** Telemetry feed connected: small green dot, grey when not. */
	live: boolean;
	/** Cog rotation in degrees while busy. */
	cogAngle?: number;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderHotkey(face: HotkeyFace): string {
	const fg = face.phase === "offline" ? "#8a96a3" : "#ffffff";
	const art = face.phase === "busy" ? cogSvg(fg, 72, 72, 76, face.cogAngle ?? 0, face.color) : iconSvg(face.icon, fg, 72, 72, 80);
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" fill="#12171d"/>` +
		`<rect x="6" y="6" width="132" height="132" rx="14" fill="${esc(face.color)}"/>` +
		art +
		`<circle cx="122" cy="22" r="6" fill="${face.live ? "#4cd964" : "#5b6570"}" stroke="#12171d" stroke-width="2"/>` +
		`</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
