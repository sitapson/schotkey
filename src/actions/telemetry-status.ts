/**
 * Telemetry Status: LIVE / CONNECTING / OFFLINE plus messages per second.
 * Press it to save every current field to snapshots/ — the quickest way to
 * find the field name for a button while you're in the game.
 */
import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TelemetryClient } from "../telemetry/client";
import { renderKey } from "../render/key-image";

@action({ UUID: "com.sctelemetry.deck.status" })
export class TelemetryStatus extends SingletonAction {
	private readonly keys = new Map<string, { setImage(image?: string): Promise<void> }>();
	private timer?: NodeJS.Timeout;
	private lastCount = 0;

	constructor(
		private readonly telemetry: TelemetryClient,
		private readonly pluginDir: string,
	) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey()) return;
		this.keys.set(ev.action.id, ev.action);
		this.timer ??= setInterval(() => this.render(), 1000);
		this.render();
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.keys.delete(ev.action.id);
		if (this.keys.size === 0) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const snap = this.telemetry.snapshot();
		if (Object.keys(snap).length === 0) return void ev.action.showAlert();
		const dir = join(this.pluginDir, "snapshots");
		mkdirSync(dir, { recursive: true });
		const file = join(dir, `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
		writeFileSync(file, JSON.stringify({ method: this.telemetry.method?.path, fields: snap }, null, 2));
		streamDeck.logger.info(`Saved telemetry snapshot: ${file}`);
		if (ev.action.isKey()) await ev.action.showOk();
	}

	private render(): void {
		const t = this.telemetry;
		const rate = t.messageCount - this.lastCount;
		this.lastCount = t.messageCount;
		const face =
			t.status === "live"
				? renderKey({ label: "SC LIVE", color: "#1f5f8a", value: `${rate}/s`, live: true })
				: t.status === "stale"
					? renderKey({ label: "SC FROZEN", color: "#6b5a1f", value: `${rate}/s`, live: false })
				: t.status === "connecting"
					? renderKey({ label: "CONNECTING", color: "#6b5a1f", live: false })
					: renderKey({ label: "SC OFFLINE", color: "#2a3038", live: false });
		this.keys.forEach((k) => void k.setImage(face));
	}
}
