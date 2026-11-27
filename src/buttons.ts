/**
 * Everything the single "SC Button" action can be, as chosen in its one dropdown
 * (ui/key.html, setting "button"). Each choice says which engine draws it (hotkey or gauge),
 * which preset it uses, and its default keybind, press mode and icon.
 *
 * Default keys are Star Citizen's own defaults (Alpha 4.10.2, Options > Keybindings). Blank where
 * the game has no default; set your own with the key recorder.
 */
export type ButtonKind = "hotkey" | "status" | "power" | "gauge";

export interface ButtonDef {
	kind: ButtonKind;
	/** HOTKEY_PRESETS (hotkey / status / power) or GAUGE_PRESETS (gauge) key; "custom" = choose a field. */
	preset?: string;
	keys: string;
	pressMode?: "tap" | "hold" | "long";
	/** Default icon: a hotkey icon id, or "g:<gauge icon>" from the shared icon list. Unset = the preset's. */
	icon?: string;
}

export const BUTTONS: Record<string, ButtonDef> = {
	// A plain key: an icon and a keybind, no state from the game.
	hotkey: { kind: "hotkey", keys: "", icon: "power" },

	// Hotkeys with status: the key shows the system's state from the game.
	"status:gear": { kind: "status", preset: "gear", keys: "N" },
	"status:lights": { kind: "status", preset: "lights", keys: "L" },
	"status:doors": { kind: "status", preset: "doors", keys: "" },
	"status:lamp": { kind: "status", preset: "lamp", keys: "RAlt+L" },
	"status:vtol": { kind: "status", preset: "vtol", keys: "K" },
	"status:coupled": { kind: "status", preset: "coupled", keys: "C" },
	"status:cruise": { kind: "status", preset: "cruise", keys: "LAlt+C" },
	"status:limiter": { kind: "status", preset: "limiter", keys: "" },
	"status:gsafe": { kind: "status", preset: "gsafe", keys: "" },
	"status:gimbals": { kind: "status", preset: "gimbals", keys: "G" },
	"status:boost": { kind: "status", preset: "boost", keys: "LShift", pressMode: "hold" },
	"status:custom": { kind: "status", preset: "custom", keys: "" },

	// Power: on / off from the game, plus pips.
	"power:shippower": { kind: "power", preset: "shippower", keys: "U", icon: "g:power-plant-01" },
	"power:engines": { kind: "power", preset: "engines", keys: "I", icon: "g:power-engines" },
	"power:shields": { kind: "power", preset: "shields", keys: "O", icon: "shields" },
	"power:weapons": { kind: "power", preset: "weapons", keys: "P", icon: "g:power-weapons" },
	"power:coolers": { kind: "power", preset: "coolers", keys: "", icon: "g:power-coolers" },
	"power:quantum": { kind: "power", preset: "quantum", keys: "", icon: "g:power-quantum" },
	"power:lifesupport": { kind: "power", preset: "lifesupport", keys: "", icon: "g:power-life-support" },
	"power:gravity": { kind: "power", preset: "gravity", keys: "", icon: "g:power-gravity" },
	"power:sensors": { kind: "power", preset: "sensors", keys: "", icon: "power" },

	// Gauges: a value from the game as a gauge, with pips. The key toggles the system's power.
	"gauge:hydrogen": { kind: "gauge", preset: "hydrogen", keys: "I" },
	"gauge:quantum": { kind: "gauge", preset: "quantum", keys: "" },
	"gauge:boost": { kind: "gauge", preset: "boost", keys: "" },
	"gauge:oxygen": { kind: "gauge", preset: "oxygen", keys: "" },
	"gauge:health": { kind: "gauge", preset: "health", keys: "" },
	"gauge:custom": { kind: "gauge", preset: "custom", keys: "" },
};
