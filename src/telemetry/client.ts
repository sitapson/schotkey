/**
 * One shared connection to the game's telemetry feed.
 *
 * Connects, discovers the schema, subscribes to the best streaming method (or
 * polls a unary one), flattens every message into dotted paths and notifies
 * subscribers when a path's value changes. Reconnects forever.
 */
import * as grpc from "@grpc/grpc-js";
import { codec, discover, errorMessage, loadFromProto, MethodInfo, pickMethod } from "./reflection";
import { flatten, Leaf } from "./flatten";

/**
 * "stale": connected and messages still arrive, but nothing has changed for `staleMs`.
 * The game does this after a server disconnect: it keeps streaming a frozen copy of the
 * last state. Buttons treat it like offline.
 */
export type TelemetryStatus = "disconnected" | "connecting" | "live" | "stale";

export interface TelemetryConfig {
	address: string;
	/** "package.Service/Method" or just "Method". Empty = auto-pick. */
	method?: string;
	request?: object;
	/** Path to a .proto, used if reflection is off. */
	protoFile?: string;
	pollMs?: number;
	reconnectMs?: number;
	/** No value changing for this long = frozen feed (default 5000). In play, vitals and instruments jitter every frame. */
	staleMs?: number;
	/** Verbose logging: connection attempts, rates, bound field changes, key presses. */
	debug?: boolean;
}

export interface Logger {
	info(...args: unknown[]): unknown;
	warn(...args: unknown[]): unknown;
	error(...args: unknown[]): unknown;
	debug(...args: unknown[]): unknown;
}

type ValueListener = (value: Leaf | undefined) => void;
type StatusListener = (status: TelemetryStatus) => void;

export class TelemetryClient {
	private readonly values = new Map<string, Leaf>();
	private readonly valueListeners = new Map<string, Set<ValueListener>>();
	private readonly statusListeners = new Set<StatusListener>();
	private client?: grpc.Client;
	private stream?: grpc.ClientReadableStream<Record<string, unknown>>;
	private pollTimer?: NodeJS.Timeout;
	private reconnectTimer?: NodeJS.Timeout;
	private rateTimer?: NodeJS.Timeout;
	private staleTimer?: NodeJS.Timeout;
	private lastChangeAt = 0;
	private failCount = 0;
	private stopped = true;

	status: TelemetryStatus = "disconnected";
	method?: MethodInfo;
	lastMessageAt = 0;
	messageCount = 0;
	lastError = "";

	constructor(
		private readonly config: TelemetryConfig,
		private readonly log: Logger = console,
	) {}

	start(): void {
		if (!this.stopped) return;
		this.stopped = false;
		let lastCount = this.messageCount;
		this.rateTimer = setInterval(() => {
			if (this.status === "live") {
				const rate = (this.messageCount - lastCount) / 10;
				this.log.debug(`Telemetry: live, ${rate.toFixed(1)} msg/s, ${this.values.size} fields`);
			}
			lastCount = this.messageCount;
		}, 10_000);
		const staleMs = this.config.staleMs ?? 5000;
		this.staleTimer = setInterval(() => {
			if (this.status === "live" && Date.now() - this.lastChangeAt > staleMs) {
				this.log.warn(`Telemetry: no values changed for ${staleMs / 1000}s; treating the feed as frozen (game disconnected or paused)`);
				this.setStatus("stale");
			}
		}, 1000);
		void this.connect();
	}

	stop(): void {
		this.stopped = true;
		clearInterval(this.rateTimer);
		clearInterval(this.staleTimer);
		this.teardown();
		this.setStatus("disconnected");
	}

	get(path: string): Leaf | undefined {
		return this.values.get(path);
	}

	paths(): string[] {
		return [...this.values.keys()].sort();
	}

	snapshot(): Record<string, Leaf> {
		return Object.fromEntries([...this.values.entries()].sort(([a], [b]) => a.localeCompare(b)));
	}

	/** Calls `fn` now and whenever `path` changes. Returns an unsubscribe function. */
	subscribe(path: string, fn: ValueListener): () => void {
		let set = this.valueListeners.get(path);
		if (!set) this.valueListeners.set(path, (set = new Set()));
		set.add(fn);
		fn(this.values.get(path));
		return () => set!.delete(fn);
	}

	onStatus(fn: StatusListener): () => void {
		this.statusListeners.add(fn);
		fn(this.status);
		return () => this.statusListeners.delete(fn);
	}

	private async connect(): Promise<void> {
		if (this.stopped) return;
		this.teardown();
		this.setStatus("connecting");
		if (this.failCount === 0) this.log.debug(`Telemetry: connecting to ${this.config.address} (${this.config.protoFile ? `proto ${this.config.protoFile}` : "reflection"})`);
		try {
			const found = this.config.protoFile
				? await loadFromProto(this.config.protoFile)
				: await discover(this.config.address);
			const method = pickMethod(found.methods, this.config.method || undefined);
			if (!method) throw new Error(`no usable method among: ${found.methods.map((m) => m.path).join(", ")}`);
			this.method = method;
			this.log.info(`Telemetry: using ${method.path} (${method.responseStream ? "stream" : "poll"})`);

			const req = codec(method.requestType);
			const res = codec(method.responseType);
			this.client = new grpc.Client(this.config.address, grpc.credentials.createInsecure());
			const request = this.config.request ?? {};

			if (method.responseStream) {
				const stream = this.client.makeServerStreamRequest(method.path, req.serialize, res.deserialize, request);
				this.stream = stream;
				stream.on("data", (msg) => this.apply(msg));
				stream.on("error", (err) => this.fail(err));
				stream.on("end", () => this.fail(new Error("stream ended")));
			} else {
				const poll = () =>
					this.client?.makeUnaryRequest(method.path, req.serialize, res.deserialize, request, (err, msg) => {
						if (err) this.fail(err);
						else if (msg) this.apply(msg);
					});
				poll();
				this.pollTimer = setInterval(poll, this.config.pollMs ?? 100);
			}
		} catch (err) {
			this.fail(err);
		}
	}

	private apply(msg: Record<string, unknown>): void {
		this.lastMessageAt = Date.now();
		this.messageCount++;
		const changed: Array<[string, Leaf | undefined]> = [];
		const flat = flatten(msg);
		for (const [path, value] of Object.entries(flat)) {
			if (this.values.get(path) === value) continue;
			this.values.set(path, value);
			changed.push([path, value]);
		}
		// Each message is a full snapshot: a field that's no longer sent (e.g. you left the
		// ship, so vehicle.* is gone) is cleared rather than left showing its last value.
		for (const path of [...this.values.keys()]) {
			if (path in flat) continue;
			this.values.delete(path);
			changed.push([path, undefined]);
		}
		if (changed.length) this.lastChangeAt = this.lastMessageAt;

		// First data after connecting goes live; a frozen ("stale") feed only comes back
		// once something actually changes.
		if (this.status === "connecting" || this.status === "disconnected") this.setStatus("live");
		else if (this.status === "stale" && changed.length) this.setStatus("live");

		for (const [path, value] of changed) {
			const listeners = this.valueListeners.get(path);
			if (listeners?.size) {
				// Only fields bound to a button are logged, so a 20 Hz feed doesn't flood the log.
				this.log.debug(`Field ${path} = ${JSON.stringify(value)}`);
				listeners.forEach((fn) => fn(value));
			}
		}
	}

	private fail(err: unknown): void {
		const message = errorMessage(err);
		if (message !== this.lastError) {
			this.failCount = 0;
			this.log.warn(`Telemetry: ${message}`);
		} else if (++this.failCount % 20 === 0) {
			this.log.debug(`Telemetry: still unavailable after ${this.failCount} retries (every ${(this.config.reconnectMs ?? 3000) / 1000}s)`);
		}
		this.lastError = message;
		this.teardown();
		this.setStatus("disconnected");
		if (!this.stopped && !this.reconnectTimer) {
			this.reconnectTimer = setTimeout(() => {
				this.reconnectTimer = undefined;
				void this.connect();
			}, this.config.reconnectMs ?? 3000);
		}
	}

	private teardown(): void {
		clearInterval(this.pollTimer);
		this.pollTimer = undefined;
		this.stream?.removeAllListeners();
		this.stream?.on("error", () => {}); // swallow the CANCELLED error from cancel()
		this.stream?.cancel();
		this.stream = undefined;
		this.client?.close();
		this.client = undefined;
	}

	private setStatus(status: TelemetryStatus): void {
		if (status === this.status) return;
		if (status === "live" || this.status === "live") this.log.info(`Telemetry: ${this.status} -> ${status}`);
		this.status = status;
		if (status === "disconnected" || status === "connecting") {
			// The feed dropped: forget values so buttons show "offline" and nothing old lingers.
			// (On "stale" values are kept, so only a real change brings the feed back to live.)
			const stale = [...this.values.keys()];
			this.values.clear();
			for (const path of stale) this.valueListeners.get(path)?.forEach((fn) => fn(undefined));
		}
		this.statusListeners.forEach((fn) => fn(status));
	}
}
