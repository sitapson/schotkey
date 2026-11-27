/**
 * Key face for SC Hotkey: the icon alone on a background coloured by state. No text: the
 * state can be shown as the key's Stream Deck title instead (the "Show state as title" option).
 */
import { fitToBoundary, ICON_BOUNDARY } from "./boundary";
import { GaugeIcon, gaugeIconAt, gaugeIconInBoundary } from "./gauge";
import { cogSvg, HotkeyIcon, iconSvg } from "./icons";
import { animatedCoupledSvg, animatedDoorsSvg, animatedGearSvg, animatedLampSvg, animatedLightsSvg, PipLayout, pipIconSvg, pipRing, pipRow } from "./user-icons";

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
	pips?: { count: number; filled: number; layout?: PipLayout; /** Pip colour (default: the icon colour). */ color?: string; /** While animating: each pip's brightness, 0-1. */ levels?: number[] };
}

function gaugePipped(icon: GaugeIcon, fg: string, pips: NonNullable<HotkeyFace["pips"]>): string {
	const pc = pips.color ?? fg;
	const layout = pips.layout ?? "ring";
	if (layout === "ring") return pipRing(pc, pips.count, pips.filled, pips.levels) + gaugeIconAt(icon, fg);
	return (layout === "row" ? pipRow(pc, pips.count, pips.filled, pips.levels) : "") + gaugeIconInBoundary(icon, fg);
}

/**
 * Gear and doors move outside their resting outline (the strut folds out to the side, the door
 * halves slide apart). These are the areas their full movement covers when drawn at the icon
 * boundary's size (measured in a browser at every step); the art is shrunk and re-centred so the
 * whole movement stays inside the boundary. Re-measure if landing-gear.svg or doors.svg change.
 */
const MOTION_BOX = {
	gear: { x: 44.1, y: 44.1, w: 70.3, h: 59 },
	doors: { x: 29.9, y: 42.8, w: 84.1, h: 58.3 },
};
function withinBoundary(art: string | null, motion: { x: number; y: number; w: number; h: number }): string | null {
	return art === null ? null : `<g transform="${fitToBoundary(motion)}">${art}</g>`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderHotkey(face: HotkeyFace): string {
	// Every icon (still, animated, or the busy cog) fills the icon boundary: centred on the key, 62 px.
	const { cx: X, cy: Y, size: S } = ICON_BOUNDARY;
	const fg = face.iconColor ?? (face.phase === "offline" ? "#8a96a3" : "#ffffff");
	const gear = face.phase !== "offline" && face.gearAngle !== undefined ? withinBoundary(animatedGearSvg(fg, X, Y, S, face.gearAngle), MOTION_BOX.gear) : null;
	const a = face.switchAmount;
	const switched =
		face.phase === "offline" || a === undefined ? null
		: face.icon === "lights" ? animatedLightsSvg(fg, X, Y, S, a)
		: face.icon === "doors" ? withinBoundary(animatedDoorsSvg(fg, X, Y, S, a), MOTION_BOX.doors)
		: face.icon === "lamp" ? animatedLampSvg(fg, X, Y, S, a)
		// Coupled is ON: the arrow (decoupled) shows when OFF, so it comes out as the key switches off.
		: face.icon === "coupled" ? animatedCoupledSvg(fg, X, Y, S, 1 - a)
		: null;
	const pipped = !face.pips ? null
		// A power button with an icon chosen from the gauge list: the same pips around that icon.
		: face.gaugeIcon ? gaugePipped(face.gaugeIcon, fg, face.pips)
		: pipIconSvg(face.icon, fg, face.pips.count, face.pips.filled, face.pips.layout, face.pips.color ?? fg, face.pips.levels);
	const art = gear ?? switched ?? pipped ?? (face.phase === "busy" ? cogSvg(fg, X, Y, S, face.cogAngle ?? 0, face.color) : face.gaugeIcon ? gaugeIconInBoundary(face.gaugeIcon, fg) : iconSvg(face.icon, fg, X, Y, S));
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		// The state colour fills the whole key: no frame around it.
		`<rect width="144" height="144" fill="${esc(face.color)}"/>` +
		(face.iconOpacity !== undefined && face.iconOpacity < 1 ? `<g opacity="${face.iconOpacity.toFixed(2)}">${art}</g>` : art) +
		`</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
