// Fake telemetry server for developing without the game: `npm run fake-game`.
// Serves dev/fake-game.proto on 127.0.0.1:50051 with gRPC reflection enabled,
// streaming 20 frames/s. Every few seconds it toggles gear/lights/mode so buttons visibly change.
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { ReflectionService } from "@grpc/reflection";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = process.argv[2] ?? "50051";
const protoPath = join(dirname(fileURLToPath(import.meta.url)), "fake-game.proto");
const pkgDef = protoLoader.loadSync(protoPath, { keepCase: false, enums: String, defaults: true });
const proto = grpc.loadPackageDefinition(pkgDef);

const state = {
	seated: true,
	ship: { name: "Test Ship", landingGear: "GEAR_DOWN", lights: false, vtol: false, mode: "SCM", shieldsPct: 100, hydrogenFuelPct: 87.5, quantumFuelPct: 64, powerOn: true, warnings: [] },
};

let tick = 0;
setInterval(() => {
	tick++;
	state.ship.shieldsPct = 60 + 40 * Math.abs(Math.sin(tick / 40));
	if (tick % 60 === 0) state.ship.lights = !state.ship.lights;
	if (tick % 100 === 0) state.ship.landingGear = state.ship.landingGear === "GEAR_DOWN" ? "GEAR_UP" : "GEAR_DOWN";
	if (tick % 140 === 0) state.ship.mode = { SCM: "NAV", NAV: "QUANTUM", QUANTUM: "SCM" }[state.ship.mode];
	state.ship.warnings = state.ship.shieldsPct < 65 ? ["SHIELDS_LOW"] : [];
}, 50);

const frame = () => {
	const now = Date.now();
	return { time: { seconds: Math.floor(now / 1000), nanos: (now % 1000) * 1e6 }, ...structuredClone(state) };
};

const server = new grpc.Server();
server.addService(proto.fake.sc.Telemetry.service, {
	Subscribe(call) {
		const timer = setInterval(() => call.write(frame()), 50);
		call.on("cancelled", () => clearInterval(timer));
		call.on("close", () => clearInterval(timer));
	},
	GetSnapshot(_call, cb) {
		cb(null, frame());
	},
	ExecuteAction(call, cb) {
		console.log(`ExecuteAction called with ${JSON.stringify(call.request)} (the probe should never do this)`);
		cb(null, { ok: true });
	},
});
new ReflectionService(pkgDef).addToServer(server);

server.bindAsync(`127.0.0.1:${port}`, grpc.ServerCredentials.createInsecure(), (err) => {
	if (err) throw err;
	console.log(`Fake SC telemetry on 127.0.0.1:${port} (reflection on). Ctrl+C to stop.`);
});
