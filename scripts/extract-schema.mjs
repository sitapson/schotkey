// Extracts the telemetry gRPC schema compiled into StarCitizen.exe.
//
//   node scripts/extract-schema.mjs "G:\...\StarCitizen\LIVE\Bin64\StarCitizen.exe" [outDir]
//
// The game embeds its protobuf FileDescriptorProtos (the compiled .proto files) in the exe.
// We find them by their file names, decode them, and write:
//   <outDir>/telemetry.protoset   binary FileDescriptorSet the plugin and probe load
//   <outDir>/telemetry.json       the same schema as readable JSON
// Reads the file only; never touches the running game.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import protobuf from "protobufjs";
import descriptor from "protobufjs/ext/descriptor/index.js";

const exe = process.argv[2];
const outDir = process.argv[3] ?? "com.sctelemetry.deck.sdPlugin/schema";
if (!exe) {
	console.error('Usage: node scripts/extract-schema.mjs "<path to StarCitizen.exe>" [outDir]');
	process.exit(1);
}

const bin = readFileSync(exe);
console.log(`Read ${(bin.length / 1048576).toFixed(0)} MB from ${exe}`);

function readVarint(pos) {
	let value = 0, shift = 0, byte;
	do {
		if (pos >= bin.length || shift > 49) return null;
		byte = bin[pos++];
		value += (byte & 0x7f) * 2 ** shift;
		shift += 7;
	} while (byte & 0x80);
	return { value, pos };
}

/** Walks FileDescriptorProto fields from `start` until something isn't one; returns the end offset. */
function descriptorEnd(start) {
	let pos = start, first = true;
	for (;;) {
		const tag = readVarint(pos);
		if (!tag) return pos;
		const field = Math.floor(tag.value / 8), wire = tag.value & 7;
		// FileDescriptorProto fields are 1..14; only varint (0) or length-delimited (2) wire types.
		if (field < 1 || field > 14 || (wire !== 0 && wire !== 2)) return pos;
		if (field === 1 && !first) return pos; // the next file's name: stop here
		first = false;
		if (wire === 0) {
			const v = readVarint(tag.pos);
			if (!v) return pos;
			pos = v.pos;
		} else {
			const len = readVarint(tag.pos);
			if (!len || len.pos + len.value > bin.length) return pos;
			pos = len.pos + len.value;
		}
	}
}

/** Finds and decodes the embedded descriptor for a .proto file name. */
function findFile(name) {
	const needle = Buffer.concat([Buffer.from([0x0a, Buffer.byteLength(name)]), Buffer.from(name)]);
	for (let i = bin.indexOf(needle); i !== -1; i = bin.indexOf(needle, i + 1)) {
		try {
			const fdp = descriptor.FileDescriptorProto.decode(bin.subarray(i, descriptorEnd(i)));
			if (fdp.name === name && (fdp.messageType?.length || fdp.service?.length || fdp.enumType?.length)) return fdp;
		} catch {
			// not a real descriptor at this offset; keep looking
		}
	}
	return null;
}

// Seed with every telemetry .proto named in the exe, then follow imports.
const seeds = new Set();
const marker = Buffer.from("sc/game/telemetry/");
for (let i = bin.indexOf(marker); i !== -1; i = bin.indexOf(marker, i + 1)) {
	const end = bin.indexOf(".proto", i);
	if (end !== -1 && end - i < 100) seeds.add(bin.subarray(i, end + 6).toString("latin1"));
}

const files = new Map();
const queue = [...seeds];
const missing = [];
while (queue.length) {
	const name = queue.shift();
	if (files.has(name) || missing.includes(name)) continue;
	const fdp = findFile(name);
	if (!fdp) {
		missing.push(name);
		continue;
	}
	files.set(name, fdp);
	console.log(`  found ${name}: ${fdp.messageType?.length ?? 0} messages, ${fdp.enumType?.length ?? 0} enums, ${fdp.service?.length ?? 0} services`);
	queue.push(...(fdp.dependency ?? []));
}
if (files.size === 0) {
	console.error("No telemetry schema found in this exe.");
	process.exit(1);
}

// Imports the exe doesn't carry (e.g. google/protobuf well-known types) come from protobufjs's copies.
const set = descriptor.FileDescriptorSet.create({ file: [...files.values()] });
const root = protobuf.Root.fromDescriptor(set);
for (const name of missing) {
	const common = protobuf.common.get(name);
	if (common) {
		root.addJSON(common.nested ?? {});
		console.log(`  ${name}: using protobufjs built-in copy`);
	} else console.warn(`  WARNING: ${name} not found; types from it won't resolve`);
}
root.resolveAll();

const services = [];
const walk = (ns) => {
	for (const obj of ns.nestedArray) {
		if (obj instanceof protobuf.Service) services.push(obj);
		else if (obj instanceof protobuf.Namespace) walk(obj);
	}
};
walk(root);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "telemetry.protoset"), descriptor.FileDescriptorSet.encode(set).finish());
writeFileSync(join(outDir, "telemetry.json"), JSON.stringify(root.toJSON(), null, 2));

console.log("\nServices:");
for (const s of services) {
	for (const m of s.methodsArray) {
		console.log(`  ${s.fullName.slice(1)}/${m.name}  (${m.requestStream ? "stream " : ""}${m.requestType} -> ${m.responseStream ? "stream " : ""}${m.responseType})`);
	}
}
console.log(`\nWrote ${join(outDir, "telemetry.protoset")} and telemetry.json`);
