/**
 * SC Button: the one Stream Deck action. Its settings panel (ui/key.html) shows a single dropdown
 * ("button"); the choice decides what the key is (src/buttons.ts):
 *
 *   Hotkey                  an icon and a keybind, no state from the game
 *   Hotkey with status      landing gear, lights, doors…: shows the system's state
 *   Power                   ship power, engines, shields…: on / off plus pips
 *   Gauge                   hydrogen, quantum, boost…: a gauge, with pips
 *
 * The work is done by the existing engines: hotkey, status and power keys by ScHotkey, gauges by
 * ScGauge. This action passes each key's events to the right one, with its settings translated
 * (preset, default keys, default icon). The older "SC Hotkey" and "SC Gauge" actions stay
 * registered, hidden from the actions list, so keys already on a deck keep working.
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
import type { JsonObject, JsonValue } from "@elgato/utils";
import { BUTTONS, ButtonDef } from "../buttons";
import { TelemetryClient } from "../telemetry/client";
import { ScGauge } from "./sc-gauge";
import { ScHotkey } from "./sc-hotkey";

type KeySettings = JsonObject & {
	/** The dropdown choice: a key of BUTTONS. */
	button?: string;
	keys?: string;
	pressMode?: string;
	/** Hotkey, status and power keys: hotkey icon id or "g:<gauge icon>"; "auto" = the choice's own. */
	icon?: string;
	/** Gauges: gauge icon id; "auto" = the gauge's own. */
	gaugeIcon?: string;
};

type Engine = "hotkey" | "gauge";
const engineOf = (def: ButtonDef | undefined): Engine => (def?.kind === "gauge" ? "gauge" : "hotkey");

/** What the engine sees: this key's settings with the dropdown choice turned into its preset and defaults. */
function translate(s: KeySettings): JsonObject {
	const def = BUTTONS[s.button ?? ""] ?? BUTTONS.hotkey;
	const keys = s.keys ?? def.keys;
	if (def.kind === "gauge") {
		return { ...s, preset: def.preset ?? "custom", keys, icon: s.gaugeIcon && s.gaugeIcon !== "auto" ? s.gaugeIcon : "auto", offLabel: (s.gaugeOffLabel as string | undefined) ?? "", verify: true };
	}
	const icon = s.icon && s.icon !== "auto" ? s.icon : (def.icon ?? "auto");
	// "Check it worked" (warn if a press changed nothing) is always on: there is no toggle.
	const out: JsonObject = { ...s, preset: def.preset ?? "custom", keys, icon, pressMode: s.pressMode ?? def.pressMode ?? "tap", verify: true };
	// A plain hotkey never reads the game, even if a field was set under another choice.
	if (def.kind === "hotkey") out.field = "";
	if (def.kind === "power") out.forcePips = true;
	return out;
}

/** The event as an engine expects it: the same key, with translated settings. */
function withSettings<T extends { action: unknown; payload: { settings: JsonObject } }>(ev: T, settings: JsonObject): T {
	return { action: ev.action, payload: { ...ev.payload, settings } } as unknown as T;
}

@action({ UUID: "com.sctelemetry.deck.key" })
export class ScKey extends SingletonAction<KeySettings> {
	/** Per key: which engine draws it, and the dropdown choice last seen. */
	private readonly keys = new Map<string, { engine: Engine; button?: string }>();

	constructor(
		private readonly hotkey: ScHotkey,
		private readonly gauge: ScGauge,
		private readonly telemetry: TelemetryClient,
	) {
		super();
	}

	private engine(e: Engine): ScHotkey | ScGauge {
		return e === "gauge" ? this.gauge : this.hotkey;
	}

	override async onWillAppear(ev: WillAppearEvent<KeySettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const settings = await this.fillDefaults(ev, ev.payload.settings, undefined);
		const engine = engineOf(BUTTONS[settings.button ?? ""]);
		this.keys.set(ev.action.id, { engine, button: settings.button });
		this.engine(engine).onWillAppear(withSettings(ev, translate(settings)) as never);
	}

	override onWillDisappear(ev: WillDisappearEvent<KeySettings>): void {
		const k = this.keys.get(ev.action.id);
		if (k) this.engine(k.engine).onWillDisappear(withSettings(ev, translate(ev.payload.settings)) as never);
		this.keys.delete(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<KeySettings>): Promise<void> {
		const k = this.keys.get(ev.action.id);
		if (!k) return;
		const settings = await this.fillDefaults(ev, ev.payload.settings, k.button);
		const engine = engineOf(BUTTONS[settings.button ?? ""]);
		const translated = translate(settings);
		if (engine !== k.engine) {
			// Switched between a hotkey kind and a gauge: hand the key over.
			this.engine(k.engine).onWillDisappear(withSettings(ev, translated) as never);
			this.engine(engine).onWillAppear(withSettings(ev, translated) as never);
		} else {
			this.engine(engine).onDidReceiveSettings(withSettings(ev, translated) as never);
		}
		this.keys.set(ev.action.id, { engine, button: settings.button });
	}

	override async onKeyDown(ev: KeyDownEvent<KeySettings>): Promise<void> {
		const k = this.keys.get(ev.action.id);
		if (k) await this.engine(k.engine).onKeyDown(withSettings(ev, translate(ev.payload.settings)) as never);
	}

	override onKeyUp(ev: KeyUpEvent<KeySettings>): void {
		const k = this.keys.get(ev.action.id);
		if (k?.engine === "hotkey") this.hotkey.onKeyUp(withSettings(ev, translate(ev.payload.settings)) as never);
	}

	/**
	 * When a key gets a (new) dropdown choice, give it that choice's default keybind and press
	 * mode, and reset the icon to the choice's own, so the panel shows them and they can be changed.
	 */
	private async fillDefaults(ev: { action: { setSettings(s: KeySettings): Promise<void> } }, s: KeySettings, previous: string | undefined): Promise<KeySettings> {
		const def = s.button ? BUTTONS[s.button] : undefined;
		if (!def) return s;
		const changed = previous !== undefined && previous !== s.button;
		if (!changed && s.keys !== undefined) return s;
		const next: KeySettings = { ...s, keys: def.keys, pressMode: def.pressMode ?? "tap" };
		if (changed) {
			next.icon = def.kind === "hotkey" ? (def.icon ?? "power") : "auto";
			next.gaugeIcon = "auto";
		}
		await ev.action.setSettings(next);
		return next;
	}

	/** Field lists for the panel's Advanced pickers. */
	override onSendToPlugin(ev: SendToPluginEvent<JsonValue, KeySettings>): void {
		const event = (ev.payload as { event?: string } | null)?.event;
		if (event !== "getFields" && event !== "getNumberFields" && event !== "getStateFields") return;
		const show = (v: unknown) => (typeof v === "number" ? v.toFixed(2) : JSON.stringify(v));
		const paths = this.telemetry.paths().filter((p) => event !== "getNumberFields" || typeof this.telemetry.get(p) === "number");
		const items: { label: string; value: string; disabled?: boolean }[] = paths.map((p) => ({ label: `${p} = ${show(this.telemetry.get(p))}`, value: p }));
		if (event === "getStateFields") items.unshift({ label: "(none)", value: "" });
		void streamDeck.ui.sendToPropertyInspector({
			event,
			items: items.length ? items : [{ label: "(no telemetry yet: get in a ship, then refresh)", value: "", disabled: true }],
		});
	}
}
