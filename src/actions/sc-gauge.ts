/**
 * SC Gauge: a segmented ring that fills with a telemetry value, e.g. hydrogen fuel.
 *
 * - Value is scaled from min..max (default 0..1, which is how the game sends fuel) to 0..100%.
 * - Segments light up to the level; the last one partly fills.
 * - Yellow at or below the warning %, red at or below the alert % (ring and icon colour only).
 * - Optional state field (e.g. vehicle.state.power.engines): when it's OFF the ring dims
 *   and the text reads e.g. "ENG OFF".
 * - Optional: pressing the key sends a key combo, and (with a state field) shows ⚠ if the
 *   state didn't change, like SC Hotkey.
 */
import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { Keyboard, parseKeys, Step } from "../input/keyboard";
import { TelemetryClient } from "../telemetry/client";
import type { Leaf } from "../telemetry/flatten";
import { GAUGE_STYLES, GaugeColors, GaugeIcon, GaugeStyle, renderGauge } from "../render/gauge";
import { isOn } from "./on-off";
import { offlineOpacityOf, PENDING_MS, pulseAt } from "./sc-hotkey";
import { GAUGE_PRESETS } from "../presets";

type GaugeSettings = {
	/** Plain-English choice: "hydrogen", "quantum"… (see presets.ts) or "custom". */
	preset?: string;
	field?: string;
	icon?: GaugeIcon;
	min?: number | string;
	max?: number | string;
	/** "percent" shows 0–100%; "value" shows the raw value with `unit`. */
	display?: "percent" | "value";
	unit?: string;
	decimals?: number | string;
	segments?: number | string;
	partial?: boolean;
	warnAt?: number | string;
	alertAt?: number | string;
	keys?: string;
	/** Optional on/off field shown on the gauge, e.g. vehicle.state.power.engines. */
	stateField?: string;
	stateOnValues?: string;
	offLabel?: string;
	verify?: boolean;
	bgColor?: string;
	gaugeColor?: string;
	warnColor?: string;
	alertColor?: string;
	/** true (default): the icon takes the gauge's current colour. false: it uses iconColor. */
	iconFollows?: boolean;
	iconColor?: string;
	/** Pip colour (unset = the gauge's normal colour). */
	pipColor?: string;
	/** Strength of faded parts, percent (default 20): offline, unlit pips, empty fuel, system off. */
	offlineOpacity?: number | string;
	/** Look: v1 classic ring, v2 split pips/fuel, v3 fuel ring with inner pips. */
	style?: GaugeStyle;
	/** v2 / v3: how many pips in the pip arc (1-12). */
	pips?: number | string;
};

const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(v.trim()) ? v.trim() : undefined);

function colorsOf(s: GaugeSettings): GaugeColors {
	return {
		background: hex(s.bgColor),
		normal: hex(s.gaugeColor),
		warn: hex(s.warnColor),
		alert: hex(s.alertColor),
		pips: hex(s.pipColor),
		icon: s.iconFollows === false ? hex(s.iconColor) : undefined,
	};
}

/**
 * Lit <-> unlit transitions animate quickly: the fuel ring sweeps (filling from the bottom up,
 * draining from the top down) and pips light or go out one after another. Small changes, like
 * fuel slowly burning, are drawn directly.
 */
const ANIM_MS = 250;
const FUEL_JUMP = 0.02;
const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)));

const DEFAULTS = { min: 0, max: 1, segments: 10, partial: true, warnAt: 50, alertAt: 15, decimals: 0, offLabel: "OFF" };

interface Resolved {
	field?: string;
	maxField?: string;
	min: number;
	max: number;
	icon: GaugeIcon;
	stateField?: string;
	stateOnValues?: string;
	offLabel: string;
	zeroMeansUnknown: boolean;
}

/**
 * What a gauge actually reads: from its preset, or (Custom, or keys set up before presets
 * existed) from the fields chosen under Advanced.
 */
function resolve(s: GaugeSettings): Resolved {
	const preset = s.preset && s.preset !== "custom" ? GAUGE_PRESETS[s.preset] : undefined;
	if (preset) {
		return {
			field: preset.field,
			maxField: preset.maxField,
			min: preset.min ?? 0,
			max: preset.max ?? 1,
			icon: preset.icon,
			stateField: preset.stateField,
			stateOnValues: preset.stateOnValues,
			offLabel: s.offLabel || preset.offLabel || DEFAULTS.offLabel,
			zeroMeansUnknown: !!preset.zeroMeansUnknown,
		};
	}
	// Custom. A preset-matching field with no state field chosen still gets the preset's
	// state field (so an older hydrogen gauge keeps following engine power).
	const match = Object.values(GAUGE_PRESETS).find((p) => p.field === s.field);
	return {
		field: s.field || undefined,
		maxField: match?.maxField,
		min: num(s.min, match?.min ?? DEFAULTS.min),
		max: num(s.max, match?.max ?? DEFAULTS.max),
		icon: s.icon ?? match?.icon ?? "none",
		stateField: (s.stateField === undefined ? match?.stateField : s.stateField) || undefined,
		stateOnValues: s.stateField === undefined ? match?.stateOnValues : s.stateOnValues,
		offLabel: s.offLabel || match?.offLabel || DEFAULTS.offLabel,
		zeroMeansUnknown: !!match?.zeroMeansUnknown,
	};
}

interface Instance {
	action: { setImage(image?: string): Promise<void>; showAlert(): Promise<void> };
	settings: GaugeSettings;
	steps: Step[];
	value?: Leaf;
	/** Whether the field has ever been non-zero (see zeroMeansUnknown). */
	seenNonZero: boolean;
	state?: Leaf;
	unsubscribe: Array<() => void>;
	lastKey?: string;
	pressSeq: number;
	stateChangedSincePress: boolean;
	/** Pressed while the state field was OFF: pulsing until the game reports ON. */
	pendingSince?: number;
	pulseTimer?: NodeJS.Timeout;
	/** Fuel sweep: from / to fraction and when it started. */
	fFrom?: number;
	fTo?: number;
	fStart?: number;
	/** Pips lighting / dimming in turn: from / to lit count and when it started. */
	pFrom?: number;
	pTo?: number;
	pStart?: number;
	animTimer?: NodeJS.Timeout;
}

const num = (v: unknown, fallback: number) => {
	const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
	return Number.isFinite(n) ? n : fallback;
};

@action({ UUID: "com.sctelemetry.deck.gauge" })
export class ScGauge extends SingletonAction<GaugeSettings> {
	private readonly instances = new Map<string, Instance>();

	constructor(
		private readonly telemetry: TelemetryClient,
		private readonly keyboard: Keyboard,
	) {
		super();
		telemetry.onStatus(() => this.instances.forEach((inst) => this.render(inst)));
	}

	override onWillAppear(ev: WillAppearEvent<GaugeSettings>): void {
		if (!ev.action.isKey()) return;
		const inst: Instance = { action: ev.action, settings: {}, steps: [], unsubscribe: [], pressSeq: 0, stateChangedSincePress: false, seenNonZero: false };
		this.instances.set(ev.action.id, inst);
		this.configure(inst, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<GaugeSettings>): void {
		const gone = this.instances.get(ev.action.id);
		gone?.unsubscribe.forEach((u) => u());
		if (gone) {
			clearInterval(gone.pulseTimer);
			clearInterval(gone.animTimer);
		}
		this.instances.delete(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<GaugeSettings>): void {
		const inst = this.instances.get(ev.action.id);
		if (inst) this.configure(inst, ev.payload.settings);
	}

	override onKeyDown(ev: KeyDownEvent<GaugeSettings>): void {
		const inst = this.instances.get(ev.action.id);
		if (!inst?.steps.length) return;
		const s = inst.settings;
		const { field, stateField } = resolve(s);
		const tag = `SC Gauge [${s.preset ?? field ?? "unset"}]`;
		const stateBefore = inst.state;
		streamDeck.logger.debug(`${tag}: tap "${s.keys}"${stateField ? ` (${stateField} = ${JSON.stringify(stateBefore)})` : ""}`);
		this.keyboard.tap(inst.steps);
		// Powering on (e.g. engines for hydrogen): pulse the icon until the game reports ON.
		if (stateField && stateBefore !== undefined && !isOn(stateBefore, resolve(s).stateOnValues) && this.telemetry.status === "live") {
			inst.pendingSince = Date.now();
			inst.pulseTimer ??= setInterval(() => this.render(inst), 80);
			this.render(inst);
		}

		// Same check as SC Hotkey: any change in the state field after the press means the game took it.
		if ((s.verify ?? true) && stateField && stateBefore !== undefined && this.telemetry.status === "live") {
			const seq = ++inst.pressSeq;
			inst.stateChangedSincePress = false;
			setTimeout(() => {
				if (this.instances.get(ev.action.id) === inst && inst.pressSeq === seq && !inst.stateChangedSincePress) {
					streamDeck.logger.warn(`${tag}: ${stateField} still ${JSON.stringify(stateBefore)} after pressing "${s.keys}". Check the keybind in game.`);
					void inst.action.showAlert();
				}
			}, 1500);
		}
	}

	/** Field pickers: numbers for the gauge itself, anything for the state field. */
	override onSendToPlugin(ev: SendToPluginEvent<JsonValue, GaugeSettings>): void {
		const event = (ev.payload as { event?: string } | null)?.event;
		if (event !== "getFields" && event !== "getStateFields") return;
		const paths = this.telemetry.paths().filter((p) => event === "getStateFields" || typeof this.telemetry.get(p) === "number");
		const items = paths.map((p) => {
			const v = this.telemetry.get(p);
			return { label: `${p} = ${typeof v === "number" ? v.toFixed(2) : JSON.stringify(v)}`, value: p };
		});
		if (event === "getStateFields") items.unshift({ label: "(none)", value: "" });
		void streamDeck.ui.sendToPropertyInspector({
			event,
			items: items.length ? items : [{ label: "(no telemetry yet: get in a ship, then refresh)", value: "", disabled: true }],
		});
	}

	private configure(inst: Instance, settings: GaugeSettings): void {
		inst.settings = settings;
		try {
			inst.steps = settings.keys ? parseKeys(settings.keys) : [];
		} catch (err) {
			inst.steps = [];
			streamDeck.logger.warn(`SC Gauge: ${(err as Error).message}`);
		}
		inst.unsubscribe.forEach((u) => u());
		inst.unsubscribe = [];
		inst.value = undefined;
		inst.seenNonZero = false;
		// New settings start from the current values with no animation.
		inst.fTo = inst.pTo = inst.fStart = inst.pStart = undefined;
		inst.state = undefined;
		inst.lastKey = undefined;
		const { field, stateField, maxField } = resolve(settings);
		streamDeck.logger.debug(`SC Gauge [${settings.preset ?? field ?? "unset"}]: configured${field ? ` (${field}${stateField ? `, state ${stateField}` : ""})` : ""}`);
		if (maxField) inst.unsubscribe.push(this.telemetry.subscribe(maxField, () => this.render(inst)));
		if (field) {
			inst.unsubscribe.push(
				this.telemetry.subscribe(field, (value) => {
					inst.value = value;
					this.render(inst);
				}),
			);
		}
		if (stateField) {
			inst.unsubscribe.push(
				this.telemetry.subscribe(stateField, (value) => {
					if (value !== inst.state) inst.stateChangedSincePress = true;
					inst.state = value;
					this.render(inst);
				}),
			);
		}
		this.render(inst);
	}

	private render(inst: Instance): void {
		const s = inst.settings;
		const r = resolve(s);
		const min = r.min;
		const maxFromField = r.maxField ? this.telemetry.get(r.maxField) : undefined;
		const max = typeof maxFromField === "number" && maxFromField > min ? maxFromField : r.max;
		const segments = Math.round(num(s.segments, DEFAULTS.segments));
		const partial = s.partial ?? DEFAULTS.partial;
		const warnAt = num(s.warnAt, DEFAULTS.warnAt);
		const alertAt = num(s.alertAt, DEFAULTS.alertAt);
		const decimals = Math.max(0, Math.min(3, Math.round(num(s.decimals, DEFAULTS.decimals))));
		const icon = r.icon;

		const live = this.telemetry.status === "live" && typeof inst.value === "number" && !!r.field;
		let fraction: number | undefined;
		let valueText = "--%";
		let level: "normal" | "warn" | "alert" | "offline" = "offline";
		// With a state field: OFF dims the gauge. Unknown state (field not sent) counts as on.
		const stateField = r.stateField;
		// Read the state from the latest message, not from inst.state: fuel and engine power change
		// in the same message, and the fuel listener may run first.
		const state = stateField ? this.telemetry.get(stateField) : undefined;
		const inactive = live && state !== undefined && !isOn(state, r.stateOnValues);
		if (inst.pendingSince !== undefined && (!inactive || !live || Date.now() - inst.pendingSince > PENDING_MS)) {
			inst.pendingSince = undefined;
			clearInterval(inst.pulseTimer);
			inst.pulseTimer = undefined;
		}
		const pulse = inst.pendingSince !== undefined ? pulseAt(inst.pendingSince) : undefined;
		if (live && inst.value !== 0) inst.seenNonZero = true;
		if (live) {
			// Always the game's live value. While OFF that may be 0 (hydrogen reads 0 with the
			// engines off), so the ring empties, matching the in-game HUD.
			const v = inst.value as number;
			fraction = max === min ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min)));
			// Round to the shown precision so the ring, colour and number always agree.
			const pct = Math.round(fraction * 1000) / 10;
			fraction = pct / 100;
			level = pct <= alertAt ? "alert" : pct <= warnAt ? "warn" : "normal";
			valueText = s.display === "value" ? `${v.toFixed(decimals)}${s.unit ? ` ${s.unit}` : ""}` : `${Math.round(pct)}%`;
			if (r.zeroMeansUnknown && !inst.seenNonZero) {
				// The game has only ever sent 0 here (LIVE doesn't report quantum fuel): show "no
				// reading" with an empty ring in the normal colour, rather than a false red 0%.
				fraction = undefined;
				level = "normal";
				valueText = "--%";
			}
			if (inactive) valueText = r.offLabel.slice(0, 9);
		} else if (!r.field) {
			valueText = "SET";
		}

		// Only redraw when what's on the key would change (fuel creeps in tiny steps at ~18 Hz).
		const colors = colorsOf(s);
		// Pips: the game doesn't report pip levels, so 66% are lit while the gauge's system is on
		// (no state field = always on), none while it's off or there's no data.
		const style: GaugeStyle = GAUGE_STYLES.includes(s.style as GaugeStyle) ? (s.style as GaugeStyle) : "v1";
		const pipCount = Math.max(1, Math.min(12, Math.round(num(s.pips, 4))));
		const pips = { count: pipCount, filled: live && !inactive ? Math.round(pipCount * 0.66) : 0 };
		// Animate: fuel sweeps to big changes; pips light or dim one at a time.
		const now = Date.now();
		const fTarget = fraction ?? 0;
		if (inst.fTo === undefined || Math.abs(fTarget - inst.fTo) <= FUEL_JUMP) {
			if (inst.fStart === undefined || now - inst.fStart >= ANIM_MS) inst.fStart = undefined;
			inst.fFrom = inst.fStart === undefined ? fTarget : inst.fFrom;
			inst.fTo = fTarget;
		} else {
			const shown = inst.fStart === undefined ? inst.fTo : inst.fFrom! + (inst.fTo - inst.fFrom!) * ease((now - inst.fStart) / ANIM_MS);
			inst.fFrom = shown;
			inst.fTo = fTarget;
			inst.fStart = now;
		}
		const fuelT = inst.fStart === undefined ? 1 : (now - inst.fStart) / ANIM_MS;
		const shownFraction = fraction === undefined && fuelT >= 1 ? undefined : inst.fFrom! + (inst.fTo - inst.fFrom!) * ease(fuelT);

		if (inst.pTo === undefined) inst.pTo = pips.filled;
		else if (pips.filled !== inst.pTo) {
			inst.pFrom = inst.pTo;
			inst.pTo = pips.filled;
			inst.pStart = now;
		}
		const pipT = inst.pStart === undefined ? 1 : (now - inst.pStart) / ANIM_MS;
		let levels: number[] | undefined;
		if (pipT < 1 && inst.pFrom !== undefined) {
			const from = inst.pFrom, to = inst.pTo, m = Math.abs(to - from);
			levels = Array.from({ length: pipCount }, (_, i) => {
				if (i >= Math.max(from, to)) return 0;
				if (i < Math.min(from, to)) return 1;
				// Each changing pip takes 40% of the time; they start in turn across the first 60%.
				const k = to > from ? i - from : from - 1 - i;
				const local = Math.max(0, Math.min(1, (pipT - (k / Math.max(1, m)) * 0.6) / 0.4));
				return to > from ? local : 1 - local;
			});
		} else inst.pStart = undefined;
		const animating = fuelT < 1 || levels !== undefined;
		if (animating) inst.animTimer ??= setInterval(() => this.render(inst), 40);
		else if (inst.animTimer) {
			clearInterval(inst.animTimer);
			inst.animTimer = undefined;
		}
		const drawnPips = { ...pips, levels };

		const key = `${shownFraction?.toFixed(3)}|${levels?.map((l) => l.toFixed(2)).join(",")}|${fraction}|${valueText}|${level}|${segments}|${partial}|${icon}|${inactive}|${JSON.stringify(colors)}|${s.offlineOpacity}|${pulse?.toFixed(2)}|${style}|${pips.count}|${pips.filled}`;
		if (key === inst.lastKey) return;
		inst.lastKey = key;
		void inst.action.setImage(renderGauge({ style, pips: drawnPips, fraction: shownFraction, valueText, icon, segments, partial, level, inactive, colors, fade: offlineOpacityOf(s.offlineOpacity), pulse }));
	}
}
