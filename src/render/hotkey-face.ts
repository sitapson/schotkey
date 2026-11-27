/**
 * Key face for SC Hotkey: the icon alone on a background coloured by state. No text: the
 * state can be shown as the key's Stream Deck title instead (the "Show state as title" option).
 */
import { GaugeIcon, gaugeIconAt, gaugeIconInBoundary } from "./gauge";
import { cogSvg, HotkeyIcon, iconSvg } from "./icons";
import { animatedDoorsSvg, animatedGearSvg, animatedLampSvg, animatedLightsSvg, PipLayout, pipIconSvg, pipRing, pipRow } from "./user-icons";

export type HotkeyPhase = "on" | "off" | "busy" | "offline";

export interface HotkeyFace {
	phase: HotkeyPhase;
	icon: HotkeyIcon;
	/** An icon from the gauge list chosen instead: drawn still (no animation or pips), filling the icon boundary. */
	gaugeIcon?: GaugeIcon;
	/** Background for this phase. */
	color: string;
	/** Icon colour for this phase (default white). */
	iconColor?: string;
	/** Icon opacity, 0-1 (offline draws the icon faint). */
	iconOpacity?: number;
	/** Telemetry feed connected: small green dot, grey when not. */
	live: boolean;
	/** Cog rotation in degrees while busy. */
	cogAngle?: number;
	/** Landing gear only: strut angle (0 = down, about -85 = folded up). Drawn instead of the static icon or cog. */
	gearAngle?: number;
	/** Lights / doors: how far switched (0 = off / shut, 1 = on / open). Drawn instead of the static icon. */
	switchAmount?: number;
	/** Power icons: the pip ring around the symbol. */
	pips?: { count: number; filled: number; layout?: PipLayout; /** Pip colour (default: the icon colour). */ color?: string };
}

function gaugePipped(icon: GaugeIcon, fg: string, pips: NonNullable<HotkeyFace["pips"]>): string {
	const pc = pips.color ?? fg;
	const layout = pips.layout ?? "ring";
	if (layout === "ring") return pipRing(pc, pips.count, pips.filled) + gaugeIconAt(icon, fg);
	return (layout === "row" ? pipRow(pc, pips.count, pips.filled) : "") + gaugeIconInBoundary(icon, fg);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderHotkey(face: HotkeyFace): string {
	const fg = face.iconColor ?? (face.phase === "offline" ? "#8a96a3" : "#ffffff");
	const gear = face.phase !== "offline" && face.gearAngle !== undefined ? animatedGearSvg(fg, 72, 72, 80, face.gearAngle) : null;
	const a = face.switchAmount;
	const switched =
		face.phase === "offline" || a === undefined ? null
		: face.icon === "lights" ? animatedLightsSvg(fg, 72, 72, 80, a)
		: face.icon === "doors" ? animatedDoorsSvg(fg, 72, 72, 80, a)
		: face.icon === "lamp" ? animatedLampSvg(fg, 72, 72, 80, a)
		: null;
	const pipped = !face.pips ? null
		// A power button with an icon chosen from the gauge list: the same pips around that icon.
		: face.gaugeIcon ? gaugePipped(face.gaugeIcon, fg, face.pips)
		: pipIconSvg(face.icon, fg, face.pips.count, face.pips.filled, face.pips.layout, face.pips.color ?? fg);
	const art = gear ?? switched ?? pipped ?? (face.phase === "busy" ? cogSvg(fg, 72, 72, 76, face.cogAngle ?? 0, face.color) : face.gaugeIcon ? gaugeIconInBoundary(face.gaugeIcon, fg) : iconSvg(face.icon, fg, 72, 72, 80));
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" fill="#12171d"/>` +
		`<rect x="6" y="6" width="132" height="132" rx="14" fill="${esc(face.color)}"/>` +
		(face.iconOpacity !== undefined && face.iconOpacity < 1 ? `<g opacity="${face.iconOpacity.toFixed(2)}">${art}</g>` : art) +
		`</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
