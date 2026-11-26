/**
 * Plain-English choices for the settings panels. Each preset knows which telemetry
 * fields it needs, so the user only picks "Quantum fuel" or "Landing gear".
 *
 * Field paths are from the LIVE 4.10 schema (docs/TELEMETRY_FIELDS.md). "custom" keeps
 * the old behaviour: the user picks the field themselves under Advanced.
 */
import type { GaugeIcon } from "./render/gauge";

export interface GaugePreset {
	field: string;
	/** Optional field holding the maximum (e.g. health.max); otherwise min..max below. */
	maxField?: string;
	min?: number;
	max?: number;
	icon: GaugeIcon;
	/** On/off field that dims the gauge, e.g. engine power for hydrogen. */
	stateField?: string;
	/** Values of stateField that mean ON (blank = true / non-zero). */
	stateOnValues?: string;
	offLabel?: string;
	/**
	 * The game sends 0 when it doesn't actually know (LIVE never fills in quantum fuel).
	 * Until a non-zero value arrives, show "--%" instead of a false empty gauge.
	 */
	zeroMeansUnknown?: boolean;
}

/**
 * The quantum drive's status light: OFF when the drive is unpowered, NOMINAL (or a warning
 * state) when powered. LIVE 4.10 has no other quantum power field. Seen in an RSI Hermes:
 * NOMINAL -> OFF -> NOMINAL as the drive was powered off and on.
 */
const QDRV = "vehicle.state.annunciators.qdrv";
const QDRV_ON = "NOMINAL, MINOR_ON, MINOR_FLASHING, MAJOR_ON, MAJOR_FLASHING";

export const GAUGE_PRESETS: Record<string, GaugePreset> = {
	hydrogen: {
		field: "vehicle.state.flight.instruments.hydrogen_fuel",
		icon: "hydrogen",
		// The game reports hydrogen as 0 while the engines are off.
		stateField: "vehicle.state.power.engines",
		offLabel: "ENG OFF",
	},
	quantum: {
		field: "vehicle.state.flight.instruments.quantum_fuel",
		icon: "quantum",
		stateField: QDRV,
		stateOnValues: QDRV_ON,
		offLabel: "QT OFF",
		zeroMeansUnknown: true,
	},
	boost: { field: "vehicle.state.flight.instruments.boost.reserves", icon: "boost" },
	oxygen: { field: "actor.vitals.oxygen.current", maxField: "actor.vitals.oxygen.max", icon: "oxygen" },
	health: { field: "actor.vitals.health.current", maxField: "actor.vitals.health.max", icon: "health" },
};

export interface HotkeyPreset {
	field: string;
	/** Values that mean ON; blank = true / non-zero. */
	onValues?: string;
	onLabel: string;
	offLabel: string;
}

export const HOTKEY_PRESETS: Record<string, HotkeyPreset> = {
	gear: { field: "vehicle.state.flight.state.gear", onValues: "DEPLOYED, DEPLOYING", onLabel: "GEAR DOWN", offLabel: "GEAR UP" },
	lights: { field: "vehicle.state.lights_enabled", onLabel: "LIGHTS ON", offLabel: "LIGHTS OFF" },
	vtol: { field: "vehicle.state.flight.state.vtol", onValues: "DEPLOYED, DEPLOYING", onLabel: "VTOL ON", offLabel: "VTOL OFF" },
	engines: { field: "vehicle.state.power.engines", onLabel: "ENGINES ON", offLabel: "ENGINES OFF" },
	shields: { field: "vehicle.state.power.shield_generators", onLabel: "SHIELDS ON", offLabel: "SHIELDS OFF" },
	weapons: { field: "vehicle.state.power.weapons", onLabel: "WEAPONS ON", offLabel: "WEAPONS OFF" },
	coolers: { field: "vehicle.state.power.coolers", onLabel: "COOLERS ON", offLabel: "COOLERS OFF" },
	quantum: { field: QDRV, onValues: QDRV_ON, onLabel: "QT ON", offLabel: "QT OFF" },
	coupled: { field: "vehicle.state.flight.settings.ifcs_coupled.active", onLabel: "COUPLED", offLabel: "DECOUPLED" },
	cruise: { field: "vehicle.state.flight.settings.ifcs_cruise_mode.active", onLabel: "CRUISE ON", offLabel: "CRUISE OFF" },
	limiter: { field: "vehicle.state.flight.settings.ifcs_speed_limiter.active", onLabel: "LIMITER ON", offLabel: "LIMITER OFF" },
	gsafe: { field: "vehicle.state.flight.settings.ifcs_g_safe.active", onLabel: "G-SAFE ON", offLabel: "G-SAFE OFF" },
	gimbals: { field: "weapons.settings.gimbals_locked", onLabel: "GIMBALS LOCKED", offLabel: "GIMBALS FREE" },
	boost: { field: "vehicle.state.flight.instruments.boost.engaged", onLabel: "BOOST", offLabel: "BOOST" },
};
