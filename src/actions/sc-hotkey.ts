/**
 * SC Hotkey: like the built-in Hotkey, but the key face follows a telemetry field.
 *
 * - Sends a key combo (tap, hold-while-pressed, or long press).
 * - Shows ON / OFF / OFFLINE from a telemetry field, with your labels, colours or images.
 * - "Ensure" mode only sends the key if the game isn't already in the wanted state.
 * - After a tap it checks the state actually changed, and shows ⚠ if it didn't.
 */
import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	KeyUpEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { Keyboard, parseKeys, Step } from "../input/keyboard";
import { TelemetryClient } from "../telemetry/client";
import type { Leaf } from "../telemetry/flatten";
import { formatValue } from "../render/key-image";
import { renderHotkey, HotkeyPhase } from "../render/hotkey-face";
import { HotkeyIcon, HOTKEY_ICONS } from "../render/icons";
import { headingOn, isOn, isTransition, stateWord } from "./on-off";
import { HOTKEY_PRESETS } from "../presets";

type HotkeySettings = {
	/** Plain-English choice: "gear", "lights", "engines"… (see presets.ts) or "custom". */
	preset?: string;
	keys?: string;
	pressMode?: "tap" | "hold" | "long";
	holdMs?: number;
	longMs?: number;
	field?: string;
	/** Comma-separated values that mean ON. Empty = truthy (true, non-zero, non-empty). */
	onValues?: string;
	onLabel?: string;
	offLabel?: string;
	onColor?: string;
	offColor?: string;
	onImage?: string;
	offImage?: string;
	ensure?: "none" | "on" | "off";
	verify?: boolean;
	showValue?: boolean;
	/** Show the state ("GEAR DOWN", "DEPLOYING"…) as the key's Stream Deck title. */
	stateTitle?: boolean;
	/** "auto" (default) = the preset's icon. */
	icon?: HotkeyIcon | "auto";
	/** Background while a system is moving (DEPLOYING, RETRACTING…). */
	busyColor?: string;
	/** Background when there's no telemetry for this button. */
	offlineColor?: string;
	/** Power icons: how many pips in the ring (1-12). */
	pips?: number | string;
	/** Icon colour in each state. */
	onIconColor?: string;
	offIconColor?: string;
	busyIconColor?: string;
	offlineIconColor?: string;
	/** Offline: the icon in its OFF colour at this opacity, percent (default 20). */
	offlineOpacity?: number | string;
};

type Phase = HotkeyPhase;

/** Working animation: ~12 frames a second. The cog turns 10° a frame. */
// 25 frames a second, so short switch animations still get several frames; same cog speed as before.
const COG_FRAME_MS = 40;
const COG_STEP = 5;
/** Landing gear swing: timed, since the game only says DEPLOYING / RETRACTING, not how far along. */
const GEAR_SWING_MS = 1000;
const GEAR_UP_ANGLE = -85;
/** How long the switch animation runs: doors swing slowly, lights and LAMP snap on and off. */
const SWITCH_MS: Partial<Record<HotkeyIcon, number>> = { doors: 1000, lights: 200, lamp: 200 };
/** Icons that animate between their OFF and ON pose when the state flips. */
const SWITCH_ICONS: HotkeyIcon[] = ["lights", "doors", "lamp"];
/** Power icons draw a ring of pips. The game doesn't report pip levels, so ON shows this share lit. */
const PIP_ICONS: HotkeyIcon[] = ["shippower", "shields"];
const PIPS_LIT_WHEN_ON = 0.66;

/**
 * Powering on: the game has no in-between state for systems like engines, so after a press
 * that should switch something ON, the icon pulses until the game reports it ON (real data)
 * or PENDING_MS passes.
 */
export const PENDING_MS = 5000;
const PULSE_PERIOD_MS = 900;
/** Icon opacity for a pulse that started at `since`: smoothly between 0.3 and 1. */
export function pulseAt(since: number): number {
	return 0.3 + 0.7 * (0.5 + 0.5 * Math.cos((2 * Math.PI * (Date.now() - since)) / PULSE_PERIOD_MS));
}

/** Offline opacity setting (percent, default 20) as 0-1. */
export function offlineOpacityOf(v: unknown): number {
	const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
	return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 20)) / 100;
}

interface Instance {
	action: { setImage(image?: string): Promise<void>; setTitle(title?: string): Promise<void>; showAlert(): Promise<void>; showOk(): Promise<void> };
	settings: HotkeySettings;
	steps: Step[];
	unsubscribe?: () => void;
	lastFace?: string;
	lastPhase?: Phase;
	value?: Leaf;
	pressSeq: number;
	changedSincePress: boolean;
	icon: HotkeyIcon;
	cogAngle: number;
	cogTimer?: NodeJS.Timeout;
	/** Title last set by the plugin; undefined = the user's own title. */
	lastTitle?: string;
	/** When the current DEPLOYING / RETRACTING began (for the gear swing). */
	busySince?: number;
	/** Last settled ON/OFF, and when it last flipped (for the lights animation). */
	lastSteady?: "on" | "off";
	flipSince?: number;
	/** Pressed while OFF: pulsing until the game reports ON. */
	pendingSince?: number;
}

@action({ UUID: "com.sctelemetry.deck.hotkey" })
export class ScHotkey extends SingletonAction<HotkeySettings> {
	private readonly instances = new Map<string, Instance>();

	constructor(
		private readonly telemetry: TelemetryClient,
		private readonly keyboard: Keyboard,
	) {
		super();
		// The status dot and OFFLINE face depend on connection state too.
		telemetry.onStatus(() => this.instances.forEach((inst) => this.render(inst)));
	}

	override onWillAppear(ev: WillAppearEvent<HotkeySettings>): void {
		if (!ev.action.isKey()) return;
		const inst: Instance = { action: ev.action, settings: {}, steps: [], pressSeq: 0, changedSincePress: false, icon: "power", cogAngle: 0 };
		this.instances.set(ev.action.id, inst);
		this.configure(inst, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<HotkeySettings>): void {
		const inst = this.instances.get(ev.action.id);
		inst?.unsubscribe?.();
		if (inst) this.stopCog(inst);
		this.instances.delete(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<HotkeySettings>): void {
		const inst = this.instances.get(ev.action.id);
		if (inst) this.configure(inst, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<HotkeySettings>): Promise<void> {
		const inst = this.instances.get(ev.action.id);
		if (!inst || inst.steps.length === 0) return void ev.action.showAlert();
		const { pressMode = "tap", ensure = "none", verify = true } = inst.settings;
		const before = this.phase(inst);
		const valueBefore = inst.value;
		// A new press supersedes any pending check from an earlier one.
		const seq = ++inst.pressSeq;
		inst.changedSincePress = false;

		const tag = this.describe(inst);
		// Mid-transition, "where it's heading" counts: DEPLOYING is already on its way to ON.
		const effective = before === "busy" ? (headingOn(inst.value as string) ? "on" : "off") : before;
		if (ensure !== "none" && effective === ensure) {
			streamDeck.logger.debug(`${tag}: already ${before === "busy" ? `going ${effective}` : before}, not pressing`);
			return void ev.action.showOk();
		}
		streamDeck.logger.debug(`${tag}: ${pressMode} "${inst.settings.keys}" (state ${before})`);

		if (pressMode === "hold") return this.keyboard.press(inst.steps);
		this.keyboard.tap(inst.steps, pressMode === "long" ? (inst.settings.longMs ?? 1000) : (inst.settings.holdMs ?? 40));
		// Switching something ON that has no in-between state of its own: pulse until confirmed.
		if (before === "off" && inst.icon !== "gear") {
			inst.pendingSince = Date.now();
			this.render(inst);
		}

		if (verify && inst.settings.field && before !== "offline") {
			setTimeout(() => {
				// Any change in the field since this press (even DEPLOYED -> DEPLOYING, or a quick
				// on/off that ends where it started) means the game took the key.
				if (this.instances.get(ev.action.id) === inst && inst.pressSeq === seq && !inst.changedSincePress) {
					streamDeck.logger.warn(`${tag}: ${inst.settings.field} still ${JSON.stringify(valueBefore)} after pressing "${inst.settings.keys}". Check the keybind in game.`);
					void inst.action.showAlert();
				}
			}, 1500 + (pressMode === "long" ? (inst.settings.longMs ?? 1000) : 0));
		}
	}

	override onKeyUp(ev: KeyUpEvent<HotkeySettings>): void {
		const inst = this.instances.get(ev.action.id);
		if (inst?.settings.pressMode === "hold") this.keyboard.release(inst.steps);
	}

	/** Feeds the settings panel's field picker with every path seen in the live feed. */
	override onSendToPlugin(ev: SendToPluginEvent<JsonValue, HotkeySettings>): void {
		const payload = ev.payload as { event?: string } | null;
		if (payload?.event !== "getFields") return;
		const items = this.telemetry.paths().map((p) => ({ label: `${p} = ${formatValue(this.telemetry.get(p))}`, value: p }));
		void streamDeck.ui.sendToPropertyInspector({
			event: "getFields",
			items: items.length ? items : [{ label: "(no telemetry yet: start the game, then refresh)", value: "", disabled: true }],
		});
	}

	private configure(inst: Instance, settings: HotkeySettings): void {
		// A preset fills in the field and ON values; labels you typed still win over its labels.
		const preset = settings.preset && settings.preset !== "custom" ? HOTKEY_PRESETS[settings.preset] : undefined;
		inst.settings = preset
			? { ...settings, field: preset.field, onValues: preset.onValues ?? "", onLabel: settings.onLabel || preset.onLabel, offLabel: settings.offLabel || preset.offLabel }
			: settings;
		inst.icon = settings.icon && settings.icon !== "auto" && HOTKEY_ICONS.includes(settings.icon) ? settings.icon : (preset?.icon ?? "power");
		this.stopCog(inst);
		try {
			inst.steps = settings.keys ? parseKeys(settings.keys) : [];
		} catch (err) {
			inst.steps = [];
			streamDeck.logger.warn(`SC Hotkey: ${(err as Error).message}`);
		}
		inst.unsubscribe?.();
		inst.unsubscribe = undefined;
		inst.value = undefined;
		inst.lastFace = undefined;
		inst.lastPhase = undefined;
		inst.lastSteady = undefined;
		inst.flipSince = undefined;
		streamDeck.logger.debug(`${this.describe(inst)}: configured (keys "${settings.keys ?? ""}", ${inst.steps.length} step(s))`);
		const field = inst.settings.field;
		if (field) {
			inst.unsubscribe = this.telemetry.subscribe(field, (value) => {
				if (value !== inst.value) inst.changedSincePress = true;
				inst.value = value;
				this.render(inst);
			});
		} else this.render(inst);
	}

	private describe(inst: Instance): string {
		const s = inst.settings;
		return `SC Hotkey [${s.onLabel || s.keys || "unset"}${s.field ? ` / ${s.field}` : ""}]`;
	}

	private phase(inst: Instance): Phase {
		const { field, onValues } = inst.settings;
		if (!field) return "off";
		const v = inst.value;
		if (v === undefined || this.telemetry.status !== "live") return "offline";
		if (isTransition(v)) return "busy";
		return isOn(v, onValues) ? "on" : "off";
	}

	/** Spins the cog while busy: redraws every COG_FRAME_MS until the state settles. */
	private startCog(inst: Instance): void {
		if (inst.cogTimer) return;
		inst.cogTimer = setInterval(() => {
			inst.cogAngle = (inst.cogAngle + COG_STEP) % 360;
			this.render(inst);
		}, COG_FRAME_MS);
	}

	private stopCog(inst: Instance): void {
		clearInterval(inst.cogTimer);
		inst.cogTimer = undefined;
	}

	/**
	 * With "Show state as title" on, the key's title follows the state ("GEAR DOWN",
	 * "DEPLOYING"…). Turning it off hands the title back to whatever the user typed in Stream Deck.
	 */
	private updateTitle(inst: Instance, title: string | undefined): void {
		if (title === inst.lastTitle) return;
		inst.lastTitle = title;
		void (title === undefined ? inst.action.setTitle() : inst.action.setTitle(title));
	}

	private render(inst: Instance): void {
		const s = inst.settings;
		const phase = this.phase(inst);
		const live = this.telemetry.status === "live";
		let image: string;

		if (phase === "busy") inst.busySince ??= Date.now();
		else inst.busySince = undefined;
		// Note ON <-> OFF flips (not from offline or the first reading) to animate the switch.
		if (phase === "on" || phase === "off") {
			if (inst.lastSteady && inst.lastSteady !== phase) inst.flipSince = Date.now();
			inst.lastSteady = phase;
		}
		// Lights / doors: animate from one pose to the other when switched, then hold the pose.
		let switchAmount: number | undefined;
		let animating = false;
		// Powering on: pulse until the game reports anything but OFF, or the wait runs out.
		if (inst.pendingSince !== undefined && (phase !== "off" || Date.now() - inst.pendingSince > PENDING_MS)) inst.pendingSince = undefined;
		const pulse = inst.pendingSince !== undefined ? pulseAt(inst.pendingSince) : undefined;
		if (pulse !== undefined) animating = true;
		if (SWITCH_ICONS.includes(inst.icon) && (phase === "on" || phase === "off")) {
			const t = inst.flipSince === undefined ? 1 : Math.min(1, (Date.now() - inst.flipSince) / (SWITCH_MS[inst.icon] ?? 1000));
			const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);
			switchAmount = phase === "on" ? eased : 1 - eased;
			animating = t < 1;
		}
		// One frame timer drives the cog, the gear swing and the lights.
		if (phase === "busy" || animating) this.startCog(inst);
		else this.stopCog(inst);
		// Landing gear is drawn by pose: hanging down when deployed (ON), folded up when retracted
		// (OFF), and swinging between the two while moving (eased like an actuator, holding the end
		// pose if the game takes longer than GEAR_SWING_MS to report it finished).
		let gearAngle: number | undefined;
		if (inst.icon === "gear") {
			if (phase === "on") gearAngle = 0;
			else if (phase === "off") gearAngle = GEAR_UP_ANGLE;
			else if (phase === "busy" && inst.busySince !== undefined) {
				const t = Math.min(1, (Date.now() - inst.busySince) / GEAR_SWING_MS);
				const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);
				gearAngle = GEAR_UP_ANGLE * (headingOn(inst.value as string) ? 1 - eased : eased);
			}
		}

		// The state in words. Not drawn on the image; optionally shown as the key's title.
		const label =
			phase === "offline" ? "OFFLINE"
			: phase === "busy" ? stateWord(inst.value)
			: phase === "on" ? (s.onLabel ?? "ON")
			: s.offLabel ?? (s.field ? "OFF" : s.keys ?? "SET KEYS");
		const value = s.showValue && phase !== "offline" ? formatValue(inst.value) : undefined;
		this.updateTitle(inst, s.stateTitle ? (value ? `${label}\n${value}` : label) : undefined);

		if (phase === "on" && s.onImage) image = s.onImage;
		else if (phase === "off" && s.offImage) image = s.offImage;
		else {
			const color =
				phase === "offline" ? (s.offlineColor ?? "#2a3038")
				: phase === "busy" ? (s.busyColor ?? "#8a6414")
				: phase === "on" ? (s.onColor ?? "#1f7a3a")
				: (s.offColor ?? "#3a434d");
			const iconColor =
				phase === "offline" ? (s.offIconColor ?? "#ffffff")
				: phase === "busy" ? s.busyIconColor
				: phase === "on" ? s.onIconColor
				: s.offIconColor;
			const pipCount = Math.max(1, Math.min(12, Math.round(Number(s.pips ?? 4)) || 4));
			const pips = PIP_ICONS.includes(inst.icon) ? { count: pipCount, filled: phase === "on" ? Math.round(pipCount * PIPS_LIT_WHEN_ON) : 0 } : undefined;
			const iconOpacity = phase === "offline" ? offlineOpacityOf(s.offlineOpacity) : pulse;
			image = renderHotkey({ phase, icon: inst.icon, color, iconColor, iconOpacity, pips, live, cogAngle: inst.cogAngle, gearAngle, switchAmount });
		}

		if (image === inst.lastFace) return; // nothing changed; don't spam the device
		if (phase !== inst.lastPhase) {
			streamDeck.logger.debug(`${this.describe(inst)}: ${inst.lastPhase ?? "new"} -> ${phase}`);
			inst.lastPhase = phase;
		}
		inst.lastFace = image;
		void inst.action.setImage(image);
	}
}
