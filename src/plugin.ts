import streamDeck from "@elgato/streamdeck";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ScGauge } from "./actions/sc-gauge";
import { ScHotkey } from "./actions/sc-hotkey";
import { TelemetryStatus } from "./actions/telemetry-status";
import { Keyboard } from "./input/keyboard";
import { setUserIconDir } from "./render/user-icons";
import { TelemetryClient, TelemetryConfig } from "./telemetry/client";

// bin/plugin.js -> the .sdPlugin folder
const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadConfig(): TelemetryConfig {
	const defaults: TelemetryConfig = { address: "127.0.0.1:50051" };
	const file = join(pluginDir, "telemetry.config.json");
	if (!existsSync(file)) return defaults;
	try {
		const cfg = { ...defaults, ...JSON.parse(readFileSync(file, "utf8")) } as TelemetryConfig;
		if (cfg.protoFile) cfg.protoFile = resolve(pluginDir, cfg.protoFile);
		return cfg;
	} catch (err) {
		streamDeck.logger.error(`Bad telemetry.config.json: ${(err as Error).message}`);
		return defaults;
	}
}

setUserIconDir(join(pluginDir, "imgs", "icons"));

const config = loadConfig();
streamDeck.logger.setLevel(config.debug ? "debug" : "info");
streamDeck.logger.info(`SC Telemetry Deck started (log level ${config.debug ? "debug" : "info"}, feed ${config.address})`);

const telemetry = new TelemetryClient(config, streamDeck.logger);
const keyboard = new Keyboard(streamDeck.logger);

streamDeck.actions.registerAction(new ScHotkey(telemetry, keyboard));
streamDeck.actions.registerAction(new TelemetryStatus(telemetry, pluginDir));
streamDeck.actions.registerAction(new ScGauge(telemetry, keyboard));

streamDeck.connect();
telemetry.start();
keyboard.warmUp();
