/**
 * Telemetry probe — run with the game open:  npm run probe [-- address] [--seconds N] [--proto file.proto]
 *
 * 1. Lists the gRPC services and prints every method and message schema.
 * 2. Calls read-only-looking methods (Get, List, Subscribe, Stream...) and
 *    records what comes back to probe-output/, so we learn the real field names.
 * Never calls methods that look like they change game state.
 */
import * as grpc from "@grpc/grpc-js";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { codec, describeType, discover, errorMessage, isSafeToCall, loadFromProto, MethodInfo } from "./telemetry/reflection";
import { flatten } from "./telemetry/flatten";

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const seconds = Number(flag("seconds") ?? 15);
const protoFile = flag("proto");
const address = args[0] ?? "127.0.0.1:50051";
const outDir = "probe-output";

async function main() {
	mkdirSync(outDir, { recursive: true });
	console.log(`Connecting to ${address}${protoFile ? ` using ${protoFile}` : " via gRPC reflection"}...`);

	const found = protoFile ? await loadFromProto(protoFile) : await discover(address);
	let schema = "";
	for (const m of found.methods) {
		const kind = `${m.requestStream ? "stream " : ""}${m.requestType.name} -> ${m.responseStream ? "stream " : ""}${m.responseType.name}`;
		schema += `\n${m.path}   [${kind}]${isSafeToCall(m) ? "" : "   (not called: may change game state)"}\n`;
		schema += `  request ${m.requestType.fullName}\n${describeType(m.requestType, "    ")}`;
		schema += `  response ${m.responseType.fullName}\n${describeType(m.responseType, "    ")}`;
	}
	console.log(`\nServices: ${found.services.join(", ") || "(none)"}${schema}`);
	writeFileSync(join(outDir, "schema.txt"), `Services: ${found.services.join(", ")}\n${schema}`);
	writeFileSync(join(outDir, "methods.json"), JSON.stringify(found.methods.map(({ requestType, responseType, ...m }) => ({ ...m, request: requestType.fullName, response: responseType.fullName })), null, 2));

	const client = new grpc.Client(address, grpc.credentials.createInsecure());
	for (const m of found.methods.filter(isSafeToCall)) await sample(client, m);
	client.close();
	console.log(`\nDone. See ${outDir}/ — schema.txt, *.jsonl (raw messages) and *.fields.txt (every field path seen).`);
}

function sample(client: grpc.Client, m: MethodInfo): Promise<void> {
	const req = codec(m.requestType);
	const res = codec(m.responseType);
	const base = join(outDir, `${m.service}.${m.name}`.replace(/[^\w.-]/g, "_"));
	const fields = new Map<string, unknown>();
	let count = 0;
	const record = (msg: Record<string, unknown>) => {
		count++;
		appendFileSync(`${base}.jsonl`, JSON.stringify(msg) + "\n");
		for (const [k, v] of Object.entries(flatten(msg))) fields.set(k, v);
	};
	const finish = () => {
		const lines = [...fields.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
		writeFileSync(`${base}.fields.txt`, lines.join("\n") + "\n");
		console.log(`  ${m.path}: ${count} message(s), ${fields.size} field(s)`);
	};

	return new Promise((resolve) => {
		if (m.responseStream) {
			console.log(`\nStreaming ${m.path} for ${seconds}s — fly around, toggle gear/lights/power to see fields change...`);
			const stream = client.makeServerStreamRequest(m.path, req.serialize, res.deserialize, {});
			const done = () => (clearTimeout(timer), stream.removeAllListeners(), stream.on("error", () => {}), stream.cancel(), finish(), resolve());
			const timer = setTimeout(done, seconds * 1000);
			stream.on("data", record);
			stream.on("error", (err) => (console.log(`  ${m.path}: ${errorMessage(err)}`), done()));
			stream.on("end", done);
		} else {
			client.makeUnaryRequest(m.path, req.serialize, res.deserialize, {}, { deadline: Date.now() + 3000 }, (err, msg) => {
				if (err) console.log(`  ${m.path}: ${errorMessage(err)}`);
				else if (msg) record(msg);
				finish();
				resolve();
			});
		}
	});
}

main().catch((err) => {
	console.error(`\nProbe failed: ${errorMessage(err)}`);
	console.error(
		"\nChecks:\n" +
			"  - Is the game running and past the main menu?\n" +
			"  - user.cfg has: server.game.telemetry.enabled = 1 (some guides also add grpc.client.server.enabled = 1 and grpc.client.server.port = 50051)\n" +
			"  - If reflection is off, rerun with --proto path\\to\\file.proto",
	);
	process.exit(1);
});
