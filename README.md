# SC Telemetry Deck

Stream Deck hotkeys for Star Citizen whose icons follow the game's live telemetry (5.0+ local gRPC feed).

Unofficial fan project. CIG hasn't said whether fan tools may use the telemetry feed — use at your own risk.

## Actions

| Action | What it does |
| --- | --- |
| **SC Button** | One action for every Star Citizen key. Its settings start with a single **Button** dropdown; after you choose, only the settings that apply are shown. |
| **Telemetry Status** | LIVE / CONNECTING / OFFLINE with messages per second. Press to save every current field to `com.sctelemetry.deck.sdPlugin/snapshots/`. |

What SC Button can be:

| Choice | What the key does |
| --- | --- |
| **Hotkey** | An icon and a keybind. No state from the game. |
| **Hotkey with status** | Landing gear, lights, doors, LAMP, VTOL, coupled, cruise, speed limiter, G-safe, gimbal lock, boost, or a custom field: sends the key and shows the system's state (animated for gear, lights, doors and LAMP). |
| **Power** | Ship power, engines, shields, weapons, coolers, quantum drive, life support, gravity, sensors: on / off from the game, with pips (a ring or a row). The game doesn't report pip levels, so two-thirds are lit when on. |
| **Gauge** | Engines (hydrogen fuel), quantum fuel, boost reserves, oxygen, health, or a custom field: a gauge in one of 18 styles, with pips. Press to send its key (e.g. engine power). |

Each choice comes with a default keybind (Star Citizen's own default, where it has one), icon and colours: black background, white icon and pips, cyan gauge and % text, yellow warning, red critical. All can be changed.

Keys are recorded: click **Key to press** and press the combination (e.g. hold Right Alt and press L to get `RAlt+L`). Left and right modifiers are kept apart. F13–F24 are handy for Stream-Deck-only binds.

The older **SC Hotkey** and **SC Gauge** actions (before 0.3.0) still work on keys that use them, but are hidden from the actions list.

## Setup

1. Install **Node.js 24+** and Stream Deck **7.1+**.
2. Turn on telemetry: back up `...\StarCitizen\LIVE\user.cfg`, then add
   ```
   server.game.telemetry.enabled = 1
   ```
   Some guides also add `grpc.client.server.enabled = 1` and `grpc.client.server.port = 50051`. Restart the game.
3. Install and build:
   ```
   npm install
   npm run build
   ```

## What works where (tested 26 Nov 2026)

| Channel | Build | Result |
| --- | --- | --- |
| **LIVE** | 4.10.201.48085 | ✅ Works. Service `sc.game.telemetry.v1.GameTelemetryService` on `127.0.0.1:2942`, `TelemetryStream` at ~18 msg/s. |
| PTU | 5.0.202.46035 (CL 13284307) | ❌ Reads `user.cfg` but logs "GRPC Server: No services configured", so nothing listens. Earlier PTU builds reportedly worked. |

- LIVE needs both `user.cfg` (in `LIVE\`) and the user environment variable `GRPC_CLIENT_SERVER_ENABLED=true`. Fully quit the RSI Launcher from the tray after setting the variable.
- The game does **not** answer schema requests (gRPC reflection), so the schema is read from the exe:
  ```
  npm.cmd run extract-schema -- "G:\Roberts Space Industries\StarCitizen\LIVE\Bin64\StarCitizen.exe"
  ```
  This writes `com.sctelemetry.deck.sdPlugin/schema/telemetry.protoset`, which `telemetry.config.json` points at. Re-run it after a game patch.
- Check `Game.log` for `Service 'sc.game.telemetry.v1.GameTelemetryService' registered` to confirm the game is serving.

## Step 1: probe the feed (do this first)

With the game running and you in a ship:

```
npm run probe
```

It lists the gRPC services, prints every message schema, then records ~15 s of every read-only method to `probe-output/`. Toggle gear, lights, power, and so on while it runs. `*.fields.txt` is the list of field paths you can bind buttons to.

Options: `npm run probe -- 127.0.0.1:50051 --seconds 30`, or `--proto path\to\telemetry.proto` if the server has reflection turned off.

If the probe picks the wrong method or needs a request body, set `method` / `request` in `com.sctelemetry.deck.sdPlugin/telemetry.config.json`.

## Watching what the plugin does

```
npm.cmd run logs
```

This opens a live, colour-coded feed:
- **[plugin] lines** come from the plugin's own log: connection attempts, which feed method it picked, messages per second, changes to fields bound to buttons, key presses, and button state changes.
- **[host] lines** come from Stream Deck: plugin starts, stops and crashes, plus the debugger address.

The feed follows the plugin across restarts. Detailed logging is controlled by `"debug": true` in `telemetry.config.json`; set it to `false` for warnings only.

Use `npm.cmd` rather than `npm` if PowerShell says running scripts is disabled.

## Developing without the game

```
npm run fake-game
```

This starts a fake telemetry server on `127.0.0.1:50051`, defined by `dev/fake-game.proto`. It has reflection on and streams 20 frames/s, toggling gear, lights and flight mode every few seconds. **Its field names are invented**: replace the proto with the real schema once the probe has run. The probe and the plugin both work against it, so you can build buttons with the game closed. Close the game first, because both use port 50051.

## Step 2: run the plugin

```
npx streamdeck dev
npx streamdeck link com.sctelemetry.deck.sdPlugin
npm run watch
```

`streamdeck dev` turns on Stream Deck's developer mode. Without it, Stream Deck ignores the restart that `watch` sends after each rebuild. Stream Deck only finds a newly linked plugin when the app starts, so quit and reopen it once after linking.

`watch` rebuilds and restarts the plugin on every save. Drag **SC Button** from the *Star Citizen* category onto a key and choose what it is in the Button dropdown (the game must be running for live state).

## Layout

```
src/
  plugin.ts               entry: wires telemetry + keyboard into the actions
  probe.ts                standalone schema discovery / recorder
  telemetry/reflection.ts gRPC server reflection -> protobufjs types
  telemetry/client.ts     shared feed connection, flatten to paths, subscribe, reconnect
  input/keyboard.ts       scancode SendInput via a persistent PowerShell helper
  buttons.ts              SC Button's choices: kind, preset, default key and icon
  presets.ts              telemetry fields behind each choice
  render/                 SVG key faces: hotkeys, gauges, icons, the icon boundary
  actions/sc-key.ts       SC Button: routes each key to the hotkey or gauge engine
  actions/                sc-hotkey.ts, sc-gauge.ts (the engines), telemetry-status.ts
dev/                      fake telemetry server + made-up proto for offline development
com.sctelemetry.deck.sdPlugin/
  manifest.json, ui/key.html + key.js (SC Button settings), ui/key-recorder.js,
  imgs/icons/ (supplied SVG icons + bounds.json), telemetry.config.json
```

## Versions

Each finished version is a git tag (`v0.1.0`, …), listed with what's in it in [CHANGELOG.md](CHANGELOG.md). Work in progress happens on `main`.

**Go back to a version:**

```
git checkout v0.1.0          # look at / build that version (detached)
npm install
npm run build                # plugin in Stream Deck now runs v0.1.0
git checkout main            # back to the latest work
```

**Start over from a version** (throw away newer work on `main`): `git reset --hard v0.1.0`. This discards everything after that tag, so only do it on purpose.

**Just reinstall it:** `releases/sc-telemetry-deck-v0.1.0.streamDeckPlugin` (local, not in git) installs that version with a double-click. Any tag can be packed again with `npx streamdeck pack com.sctelemetry.deck.sdPlugin -o releases` after checking it out and building.

**Save a new version:** set the version in `package.json` and `com.sctelemetry.deck.sdPlugin/manifest.json`, update CHANGELOG.md, commit, then `git tag -a vX.Y.Z -m "..."` and `git push --follow-tags`.

## Ideas for next steps

- Multi-state buttons (NAV / SCM / QT), threshold colours (shield % < 25 → red)
- Stream Deck+ dial gauges (shields, fuel, quantum spool)
- Flashing alerts on warning lights
- Macros that use "only press if" for idempotent sequences (landing checklist)
- If the feed also accepts game actions, send those instead of keypresses
