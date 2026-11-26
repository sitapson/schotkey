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
};

type Phase = HotkeyPhase;

/** Working animation: ~12 frames a second. The cog turns 10° a frame. */
const COG_FRAME_MS = 80;
const COG_STEP = 10;
/** Landing gear swing: timed, since the game only says DEPLOYING / RETRACTING, not how far along. */
const GEAR_SWING_MS = 1000;
const GEAR_UP_ANGLE = -85;

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

		if (phase === "busy") {
			this.startCog(inst);
			inst.busySince ??= Date.now();
		} else {
			this.stopCog(inst);
			inst.busySince = undefined;
		}
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
			image = renderHotkey({ phase, icon: inst.icon, color, live, cogAngle: inst.cogAngle, gearAngle });
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
