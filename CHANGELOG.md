# Changelog

## 0.2.0 (27 Nov 2026)

Tested against Star Citizen LIVE 4.10 (telemetry on 127.0.0.1:2942).

- **Icons:** every key shows an icon, no text. Supplied SVG icons (`imgs/icons/`, measured by `npm run measure-icons`) and built-in line icons; gauges and hotkeys share one picker of named icons, each key defaulting to its system's icon.
- **Icon boundary:** icons are scaled by what they actually draw to fill a fixed 62 px square centred on the key, so they all match in size and place.
- **Animations:** landing gear swings, lights beam out, doors slide, LAMP letters light in turn; they repeat after a press until the game confirms. A spinning cog shows other moving systems; the icon pulses while a system powers on.
- **New hotkeys:** ship power, doors, LAMP (light amplification). Power keys show pips (a ring or a row; the game doesn't report pip levels, so two-thirds are lit when on).
- **Gauges:** 18 styles (rings, arcs, bars, pip rows, big-icon layouts); fuel sweeps and pips light one at a time when they change; text colour setting; the icon stays lit while the system is off but the game is reporting.
- **Colours:** set per state (on, off, moving, offline) for background, icon and pips; one faded strength for dim parts. No borders: backgrounds fill the whole key.
- **Keys:** recorded by pressing them (e.g. hold Right Alt and press L) instead of typing; left / right modifiers supported.
- Gear and VTOL count only DEPLOYED as ON; "only press if" treats DEPLOYING as already heading ON.
- Fixes: health and oxygen gauge icons were blank (invalid SVG); quick toggles no longer show a false ⚠.

## 0.1.0 (26 Nov 2026)

Saved in `releases/`: `sc-telemetry-deck-v0.1.0.streamDeckPlugin` (double-click to install) and `sc-telemetry-deck-v0.1.0-source.zip` (the project source).

Tested against Star Citizen LIVE 4.10.201.48085 (telemetry on 127.0.0.1:2942).

- **SC Hotkey:** sends a key and shows ON / OFF / OFFLINE from the game. Plain-English choices: landing gear, lights, VTOL, boost, engine / shield / weapon / cooler / quantum drive power, coupled, cruise, speed limiter, G-safe, gimbal lock, or a custom field. Tap, hold or long press; "only press if not already on/off"; ⚠ if a press changed nothing.
- **SC Gauge:** segmented ring (1–24 segments, partial fill) with icon and percentage. Choices: hydrogen fuel, quantum fuel, boost reserves, oxygen, health, or custom. Yellow / red thresholds (default 50% / 15%), all colours adjustable, optional key on press.
  - Hydrogen follows engine power: engines off shows an empty, dimmed ring with "ENG OFF", matching the game's 0%.
  - Quantum follows quantum drive power (the drive's status light): "QT OFF" when off. LIVE never sends quantum fuel, so it shows "--%" rather than a false 0%.
- **Telemetry Status:** LIVE / FROZEN / CONNECTING / OFFLINE with messages per second; press to save a snapshot of every field.
- Buttons go OFFLINE when the feed drops, freezes (nothing changes for 5 s, e.g. after a server disconnect) or stops sending a field (e.g. you left the ship).
- Tools: `npm run probe`, `npm run extract-schema`, `npm run list-fields`, `npm run fake-game`, `npm.cmd run logs` (live log).
