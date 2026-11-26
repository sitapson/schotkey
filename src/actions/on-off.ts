import type { Leaf } from "../telemetry/flatten";

/** With no "ON when value is" set, text values ending in one of these count as OFF. */
export const OFF_WORDS = /(^|_)(false|off|0|none|unspecified|unknown|retracted|retracting|disabled|inactive|closed|closing|nominal|unpowered|stowed)$/i;

/**
 * In-between states: the game sends these while something moves (gear, VTOL, doors,
 * transforming ships). Shown as a spinning cog.
 */
const TRANSITION = /(^|_)(deploying|retracting|opening|closing|moving|transitioning)$/i;
/** Which end state a transition is heading to. */
const HEADING_ON = /(^|_)(deploying|opening)$/i;

export function isTransition(v: Leaf | undefined): boolean {
	return typeof v === "string" && TRANSITION.test(v);
}

/** For "only press if": DEPLOYING counts as already going ON, RETRACTING as going OFF. */
export function headingOn(v: Leaf): boolean {
	return typeof v === "string" && HEADING_ON.test(v);
}

/** The state word at the end of an enum: VEHICLE_..._DEPLOYING -> DEPLOYING. */
export function stateWord(v: Leaf | undefined): string {
	const s = String(v ?? "");
	const m = /([A-Z]+)$/i.exec(s);
	return (m ? m[1] : s).toUpperCase();
}

/**
 * Whether a telemetry value means ON.
 * - `onValues` (comma-separated): exact match, or the end of a long enum name
 *   ("DEPLOYED" matches "VEHICLE_COMPONENT_DEPLOYMENT_STATE_DEPLOYED").
 * - Otherwise: true, non-zero, or text not ending in an OFF word.
 */
export function isOn(v: Leaf, onValues?: string): boolean {
	if (onValues && onValues.trim()) {
		const actual = String(v).toLowerCase();
		const wanted = onValues.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
		return wanted.some((w) => actual === w || actual.endsWith(`_${w}`));
	}
	if (typeof v === "string") return v !== "" && !OFF_WORDS.test(v);
	return v === true || (typeof v === "number" && v !== 0);
}
