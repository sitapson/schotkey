# Changelog

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
